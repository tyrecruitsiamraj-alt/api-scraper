import 'server-only';
import { q } from './db';
import { listConnectorOptions, listSoRecruitPostingRequests, type TaskRow } from './repo';
import { operatorJobTitle } from './operator-copy';
import { jobDescriptionFromJarvis, prefillScrapePlan } from './scrape-intake.js';
import { deriveScrapStage } from './scrap-stage';
import type { ScrapTaskRowData } from '@/components/scrap/ScrapTaskRow';

export {
  SCRAP_STAGES,
  SCRAP_GROUP_LABEL,
  deriveScrapStage,
  failedStageFromError,
} from './scrap-stage';
export type {
  ScrapStageKey,
  ScrapStageState,
  ScrapStageStep,
  ScrapStageInput,
  ScrapStageResult,
  ScrapTaskGroup,
} from './scrap-stage';

export const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

export function platformLabel(platform: string | null | undefined) {
  const key = String(platform ?? '');
  return PLATFORM_LABEL[key] ?? key;
}

/** แสดงวันเวลาแบบไทยเสมอ (server รันเป็น UTC) */
export function formatBangkokDateTime(value: string | Date | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// คำขอ Scrap จาก Jarvis ที่รอกดเริ่ม
// ---------------------------------------------------------------------------

/** บัญชีค้นหาที่เลือกได้บนการ์ดคำขอ (รูปแบบเดียวกับที่ศูนย์งานใช้) */
export type ScrapConnectorChoice = {
  id: string;
  label: string;
  available: boolean;
  blockReason: string | null;
};

/** ข้อมูลที่ ScrapIntakeCard ต้องใช้ ต่อหนึ่งคำขอ */
export type ScrapIntakeItem = {
  /** `request:<id>` เหมือนศูนย์งาน เพื่อให้ id ของช่องในฟอร์มไม่ชนกัน */
  id: string;
  requestNo: string;
  title: string;
  detail: string | null;
  requester: string | null;
  createdAt: string;
  context: string | null;
  checklist: { label: string; ok: boolean }[];
  requestFields: Record<string, string>;
  /** เนื้องานที่ระบบจะใช้วางแผนค้น (แคปชั่นใบเดียวกัน + ช่องข้อมูล) */
  searchDescription: string;
  /** บัญชีค้นหาที่พนักงานเลือกใน Jarvis (job_snapshot.scrape_connector_ids) — ใช้เป็นค่าเริ่มต้นของช่องเลือก */
  requestedConnectorIds: string[];
};

export async function listScrapConnectorChoices(): Promise<ScrapConnectorChoice[]> {
  const connectors = await listConnectorOptions();
  return connectors.map((connector) => ({
    id: connector.id,
    label: `${platformLabel(connector.platform)} · ${connector.label}`,
    available: connector.available,
    blockReason: connector.block_reason,
  }));
}

/**
 * คำขอ Scrap จาก Jarvis ที่ยังไม่มีงาน (pending) ใช้ logic เดียวกับหน้า /orchestrator
 * เพื่อให้แผนที่คนเห็นก่อนกดเริ่มตรงกันทั้งสองหน้า.
 */
export async function listJarvisScrapRequests(): Promise<ScrapIntakeItem[]> {
  const requests = await listSoRecruitPostingRequests();
  const scrapNos = requests.filter((r) => r.request_type === 'scraping').map((r) => r.request_no);
  // แคปชั่นของคำสั่งโพสต์ใบเดียวกัน — ใช้ประกอบเนื้องานสำหรับค้นหา
  const captions = new Map(
    scrapNos.length
      ? (await q<{ request_no: string; caption: string | null }>(
        `SELECT DISTINCT ON (r.request_no) r.request_no, to_jsonb(r)->'job_snapshot'->>'caption' AS caption
           FROM "jarvis_rm".job_posting_requests r
          WHERE r.request_no = ANY($1::text[]) AND to_jsonb(r)->>'request_type' = 'content'
          ORDER BY r.request_no, r.created_at DESC`,
        [scrapNos],
      ).catch(() => [])).map((row) => [row.request_no, row.caption ?? ''])
      : [],
  );
  return requests
    .filter((request) => request.request_type === 'scraping')
    .map((request): ScrapIntakeItem => {
      const js = (request.job_snapshot ?? {}) as Record<string, unknown>;
      const has = (v: unknown) => String(v ?? '').trim() !== '' && v !== null;
      const erpPosition = request.erp_title && request.erp_title !== request.request_no ? request.erp_title : '';
      const checklist = [
        { label: 'ตำแหน่ง', ok: has(js.position) || has(erpPosition) },
        { label: 'พื้นที่', ok: has(js.location) || has(request.erp_province) },
        { label: 'รายได้', ok: has(js.income) },
        { label: 'จำนวน', ok: has(js.qty) || has(request.erp_qty) },
        { label: 'เวลางาน', ok: has(js.work_schedule) },
      ];
      const requestFields = prefillScrapePlan(js, {
        position: erpPosition,
        location: request.erp_province || '',
        qty: request.erp_qty ? String(request.erp_qty) : '',
      }) as Record<string, string>;
      return {
        id: `request:${request.id}`,
        requestNo: request.request_no,
        title: operatorJobTitle({ position: requestFields.position, title: request.erp_title, requestNo: request.request_no }),
        detail: request.reason || request.notes,
        requester: request.requested_by_name,
        createdAt: request.created_at,
        context: requestFields.location || request.requested_by_name,
        checklist,
        requestFields,
        searchDescription: jobDescriptionFromJarvis({ caption: captions.get(request.request_no) ?? '', snapshot: js }),
        requestedConnectorIds: (Array.isArray(js.scrape_connector_ids) ? js.scrape_connector_ids : [js.scrape_connector_id])
          .map((v) => String(v ?? '').trim())
          .filter(Boolean),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ---------------------------------------------------------------------------
// ประวัติการรันของงาน
// ---------------------------------------------------------------------------

export type ScrapRunRow = {
  id: string;
  platform: string;
  status: string;
  criteria: Record<string, unknown> | null;
  found: number;
  opened_count: number;
  qualified_count: number;
  new_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  running: 'กำลังทำ',
  success: 'สำเร็จ',
  partial: 'ได้บางส่วน',
  failed: 'ไม่สำเร็จ',
  cooldown: 'บัญชีพักชั่วคราว',
};

/** รอบที่เครื่องค้นหาทำให้งานนี้ ล่าสุดก่อน (อ่านอย่างเดียว) */
export async function listScrapRuns(taskId: string, limit = 50): Promise<ScrapRunRow[]> {
  try {
    return await q<ScrapRunRow>(
      `SELECT r.id, r.platform, r.status, r.criteria,
              COALESCE(r.found, 0)::int AS found,
              COALESCE(r.opened_count, 0)::int AS opened_count,
              COALESCE(r.qualified_count, 0)::int AS qualified_count,
              COALESCE(r.new_count, 0)::int AS new_count,
              r.error, r.started_at, r.finished_at
         FROM scrape_runs r
        WHERE r.task_id = $1
        ORDER BY r.started_at DESC
        LIMIT $2`,
      [taskId, limit],
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// งาน Scrap: แถวในรายการ + ตัวช่วยแสดงผล
// ---------------------------------------------------------------------------

/** ป้ายรอบการรันของงาน */
export function scheduleLabel(cron: string | null): string {
  if (!cron) return 'รันเมื่อกดเอง';
  if (cron === '@hourly') return 'ทุกชั่วโมง';
  if (cron === '@daily') return 'ทุกวัน';
  const m = cron.match(/^every:(\d+)$/);
  if (m) return `ทุก ${Math.round(Number(m[1]) / 60)} นาที`;
  return cron;
}

/** เกณฑ์ที่บันทึกไว้กับงาน เป็นคู่ ชื่อ/ค่า สำหรับแสดงผล */
export function criteriaEntries(criteria: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  const c = criteria ?? {};
  const val = (k: string) => {
    const v = c[k];
    return v == null || String(v).trim() === '' ? '' : String(v).trim();
  };
  const fmtBaht = (v: string) => (v ? Number(v).toLocaleString('en-US') : v);
  const out: { label: string; value: string }[] = [];
  if (val('position')) out.push({ label: 'ตำแหน่ง', value: val('position') });
  if (val('keyword')) out.push({ label: 'คำค้น', value: val('keyword') });
  if (val('province')) out.push({ label: 'จังหวัด', value: val('province') });
  if (val('industry')) out.push({ label: 'ประเภทงาน', value: val('industry') });
  if (val('gender') && val('gender') !== 'ไม่ระบุ') out.push({ label: 'เพศ', value: val('gender') });
  if (val('education') && val('education') !== 'ไม่ระบุ') out.push({ label: 'วุฒิ', value: val('education') });
  const smin = val('salaryMin');
  const smax = val('salaryMax');
  if (smin || smax) {
    out.push({
      label: 'เงินเดือน',
      value: smin && smax ? `${fmtBaht(smin)} ถึง ${fmtBaht(smax)}` : smin ? `${fmtBaht(smin)} ขึ้นไป` : `ไม่เกิน ${fmtBaht(smax)}`,
    });
  }
  const amin = val('ageMin');
  const amax = val('ageMax');
  if (amin || amax) {
    out.push({ label: 'อายุ', value: amin && amax ? `${amin} ถึง ${amax} ปี` : amin ? `${amin} ปีขึ้นไป` : `ไม่เกิน ${amax} ปี` });
  }
  if (val('job_description')) out.push({ label: 'เนื้องาน', value: val('job_description') });
  return out;
}

/** เป้าของงาน: progress_target ถูก reset เป็น 0 ระหว่างเปลี่ยนขั้น จึงใช้ target_count ก่อน */
export function scrapTaskTarget(task: Pick<TaskRow, 'target_count' | 'progress_target'>) {
  return task.target_count || task.progress_target || 0;
}

/** ชื่องานที่คนอ่านเข้าใจ (ตำแหน่ง > ชื่องาน) */
export function scrapTaskTitle(task: Pick<TaskRow, 'criteria' | 'name' | 'source_request_no'>) {
  return operatorJobTitle({
    position: task.criteria?.position || task.criteria?.keyword,
    title: task.name,
    requestNo: task.source_request_no,
  });
}

/** updated_at มีใน row จริง (SELECT t.*) แต่ไม่อยู่ใน type TaskRow */
export function scrapTaskUpdatedAt(task: TaskRow): string {
  const row = task as TaskRow & { updated_at?: string | null };
  return row.updated_at || task.last_progress_at || task.last_run_at || task.created_at;
}

export function toScrapTaskRow(task: TaskRow): ScrapTaskRowData {
  return {
    id: task.id,
    title: scrapTaskTitle(task),
    requestNo: task.source_request_no,
    source: `${platformLabel(task.platform)} · ${task.connector_label}`,
    stage: deriveScrapStage(task),
    qualified: task.qualified_count ?? 0,
    target: scrapTaskTarget(task),
    updatedLabel: formatBangkokDateTime(scrapTaskUpdatedAt(task)),
    enabled: task.enabled,
    requestedBy: task.requested_by ?? null,
  };
}
