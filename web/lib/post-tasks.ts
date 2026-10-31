import 'server-only';
import { q } from './db';
import { buildPostTaskGroups, postTaskStage } from '../../src/core/post-task-state.js';
import type { PostTaskCounts, PostTaskCurrent, PostTaskGroup } from '../../src/core/post-task-state.js';

// งานโพสต์ 1 task = 1 รอบโพสต์ (post_run_queue 1 แถว, mode=post)
const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;

export type PostTask = {
  id: string;
  run_id: string | null;
  status: string;
  title: string;
  request_no: string | null;
  account: string | null;
  worker: string | null;
  requested_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  is_repost: boolean;
  counts: PostTaskCounts;
  current: PostTaskCurrent;
  stage: { step: number; state: 'active' | 'done' | 'failed'; label: string };
  groups: PostTaskGroup[];
};

export type PostTaskLog = { at: string; level: string; message: string; group_name: string | null };

type RunRow = {
  id: string;
  run_id: string | null;
  status: string;
  user_id: string | null;
  account: string | null;
  worker_id: string | null;
  requested_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  assignment_ids: string[] | null;
  user_group_ids: string[] | null;
};

type AttemptRow = { run_id: string; group_id: string | null; level: string; kind: string | null; message: string | null; at: string; meta: Record<string, unknown> | null };

/** jv-opl6910006 หรือ jv-opl6910006-r2 → OPL6910006 */
function requestNoFromAssignment(id: string): string | null {
  const m = /^jv-(.+?)(?:-r\d+)?$/i.exec(id);
  return m ? m[1].toUpperCase() : null;
}

async function loadTasks(where: string, params: unknown[], limit: number): Promise<{ rows: RunRow[]; attempts: AttemptRow[]; logs: Record<string, unknown>[]; groups: { id: string; name: string; fb_group_id: string }[]; assignments: { id: string; job_ids: string[]; group_ids: string[]; title: string | null }[] }> {
  const rows = await q<RunRow>(
    `SELECT r.id, r.run_id, r.status, r.user_id, u.name AS account, r.worker_id, r.requested_by, r.error,
            r.created_at, r.started_at, r.finished_at,
            COALESCE(r.assignment_ids::jsonb, '[]'::jsonb) AS assignment_ids,
            COALESCE(u.group_ids::jsonb, '[]'::jsonb) AS user_group_ids
       FROM ${AP}.post_run_queue r
       LEFT JOIN ${AP}.users u ON u.id = r.user_id
      WHERE COALESCE(r.mode, 'post') = 'post' ${where}
      ORDER BY r.created_at DESC LIMIT ${limit}`,
    params,
  );
  const runIds = rows.map((r) => r.run_id).filter((v): v is string => Boolean(v));
  const assignmentIds = [...new Set(rows.flatMap((r) => (r.assignment_ids ?? []).map(String)))];
  const [attempts, logs, groups, assignments] = await Promise.all([
    runIds.length
      ? q<AttemptRow>(
        `SELECT run_id, group_id, level, meta->>'kind' AS kind, message, created_at AS at, meta
           FROM ${AP}.run_logs
          WHERE run_id = ANY($1::text[])
            AND (group_id IS NOT NULL OR meta->>'kind' = 'plan' OR level = 'error')
          ORDER BY created_at`,
        [runIds],
      ).catch(() => [])
      : Promise.resolve([] as AttemptRow[]),
    runIds.length
      ? q<Record<string, unknown>>(
        `SELECT run_id, group_id, post_link, post_status, comment_count, reactions, shares, last_collected_at, created_at
           FROM ${AP}.post_logs WHERE run_id = ANY($1::text[])`,
        [runIds],
      ).catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[]),
    q<{ id: string; name: string; fb_group_id: string }>(`SELECT id, name, fb_group_id FROM ${AP}.groups`).catch(() => []),
    assignmentIds.length
      ? q<{ id: string; job_ids: string[]; group_ids: string[]; title: string | null }>(
        `SELECT a.id, COALESCE(a.job_ids::jsonb, '[]'::jsonb) AS job_ids, COALESCE(a.group_ids::jsonb, '[]'::jsonb) AS group_ids,
                (SELECT string_agg(j.title, ', ') FROM ${AP}.jobs j
                  WHERE j.id IN (SELECT jsonb_array_elements_text(COALESCE(a.job_ids::jsonb, '[]'::jsonb)))) AS title
           FROM ${AP}.assignments a WHERE a.id = ANY($1::text[])`,
        [assignmentIds],
      ).catch(() => [])
      : Promise.resolve([] as { id: string; job_ids: string[]; group_ids: string[]; title: string | null }[]),
  ]);
  return { rows, attempts, logs, groups, assignments };
}

function assemble(data: Awaited<ReturnType<typeof loadTasks>>): PostTask[] {
  const nameByFb = new Map(data.groups.map((g) => [String(g.fb_group_id), g.name]));
  const fbByRow = new Map(data.groups.map((g) => [g.id, String(g.fb_group_id)]));
  const assignmentById = new Map(data.assignments.map((a) => [a.id, a]));

  return data.rows.map((row) => {
    const runAttempts = row.run_id ? data.attempts.filter((a) => a.run_id === row.run_id) : [];
    const planLog = [...runAttempts].reverse().find((a) => a.kind === 'plan');
    const planItems = Array.isArray(planLog?.meta?.items) ? (planLog!.meta!.items as Array<{ group_id?: string }>) : null;
    const assignments = (row.assignment_ids ?? []).map((id) => assignmentById.get(String(id))).filter(Boolean) as typeof data.assignments;
    // ไม่มี log แผน (รอบเก่า/ยังไม่เริ่ม): ใช้กลุ่มที่ผูกกับงาน ถ้าว่างใช้กลุ่มของบัญชี — แบบเดียวกับ worker
    const fallbackRows = assignments.flatMap((a) => (a.group_ids?.length ? a.group_ids : row.user_group_ids ?? []));
    const plan = (planItems ?? fallbackRows.map((id) => ({ group_id: fbByRow.get(String(id)) ?? String(id) })))
      .map((p) => ({ group_id: String(p.group_id ?? '') }))
      .filter((p) => p.group_id);
    const { groups, counts, current } = buildPostTaskGroups({
      plan,
      attempts: runAttempts.filter((a) => a.group_id).map((a) => ({ group_id: a.group_id, level: a.level, kind: a.kind, message: a.message, at: a.at })),
      postLogs: row.run_id ? data.logs.filter((l) => l.run_id === row.run_id) : [],
      runStatus: row.status,
      groupName: (id) => nameByFb.get(id) ?? `กลุ่ม ${id}`,
    });
    const runError = row.error || [...runAttempts].reverse().find((a) => a.level === 'error' && !a.group_id)?.message || null;
    const assignmentId = String(row.assignment_ids?.[0] ?? '');
    return {
      id: row.id,
      run_id: row.run_id,
      status: row.status,
      title: assignments.map((a) => a.title).filter(Boolean).join(', ') || 'งานโพสต์',
      request_no: requestNoFromAssignment(assignmentId),
      account: row.account,
      worker: row.worker_id ? row.worker_id.replace(/-\d+$/, '') : null,
      requested_by: row.requested_by,
      error: runError,
      created_at: row.created_at,
      started_at: row.started_at,
      finished_at: row.finished_at,
      is_repost: /-r\d+$/i.test(assignmentId),
      counts,
      current,
      stage: postTaskStage(row.status, counts, current),
      groups,
    };
  });
}

export async function listPostTasks(limit = 60): Promise<PostTask[]> {
  try {
    return assemble(await loadTasks('', [], Math.max(1, Math.min(200, limit))));
  } catch {
    return [];
  }
}

export async function getPostTask(id: string): Promise<PostTask | null> {
  try {
    return assemble(await loadTasks('AND r.id = $1', [id], 1))[0] ?? null;
  } catch {
    return null;
  }
}

/** log ทั้งหมดของรอบ (ล่าสุดก่อน) สำหรับหน้า task */
export async function getPostTaskLogs(runId: string): Promise<PostTaskLog[]> {
  try {
    const [rows, groups] = await Promise.all([
      q<{ at: string; level: string; message: string; group_id: string | null }>(
        `SELECT created_at AS at, level, message, group_id FROM ${AP}.run_logs WHERE run_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [runId],
      ),
      q<{ name: string; fb_group_id: string }>(`SELECT name, fb_group_id FROM ${AP}.groups`).catch(() => []),
    ]);
    const nameByFb = new Map(groups.map((g) => [String(g.fb_group_id), g.name]));
    return rows.map((r) => ({ ...r, group_name: r.group_id ? nameByFb.get(String(r.group_id)) ?? r.group_id : null }));
  } catch {
    return [];
  }
}

export type ManualJoinGroup = {
  user_id: string;
  account: string | null;
  group_id: string;
  group_name: string | null;
  /** ลิงก์ให้คนกดไปแก้เอง: หน้ากลุ่ม · โพสต์ที่รออนุมัติ · หน้าเนื้อหาของคุณในกลุ่ม */
  url: string;
  /**
   * ผลล่าสุดของบัญชีนี้ในกลุ่มนี้ที่ยังไม่ขึ้นในกลุ่ม
   * questions = กลุ่มให้ตอบคำถามก่อนเข้า · pending = ส่งคำขอเข้ากลุ่มแล้ว รอแอดมิน
   * limit = บอทกดเข้าร่วมครบโควต้ารอบนั้น · unknown = ไม่เจอช่องโพสต์และปุ่มเข้าร่วม
   * rejected = Facebook ไม่รับโพสต์ · failed = โพสต์ไม่สำเร็จ
   * post_pending = โพสต์แล้ว รอแอดมินอนุมัติโพสต์ · unconfirmed = โพสต์แล้วไม่เจอในกลุ่ม
   */
  state: 'questions' | 'pending' | 'limit' | 'unknown' | 'rejected' | 'failed' | 'post_pending' | 'unconfirmed';
  /** ข้อความที่ Facebook หรือหน้ากลุ่มแสดง (ถ้ามี) */
  detail: string | null;
  request_no: string | null;
  seen_at: string;
};

const JOIN_STATES = new Set(['questions', 'pending', 'limit', 'unknown']);

/**
 * ทุกกลุ่มที่ยังไม่ขึ้นในกลุ่ม พร้อมลิงก์ให้คนไปแก้เอง — ดูผลล่าสุดต่อบัญชี+กลุ่ม ย้อน 30 วัน
 * ผลล่าสุดสำเร็จและได้ลิงก์ = หายจากรายการเอง
 */
export async function listManualJoinGroups(): Promise<ManualJoinGroup[]> {
  try {
    const rows = await q<{
      user_id: string; account: string | null; group_id: string; group_name: string | null;
      level: string; message: string | null; kind: string | null; join_state: string | null; fb_message: string | null;
      seen_at: string; job_id: string | null; post_link: string | null; post_status: string | null;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (l.user_id, l.group_id)
                l.user_id, l.group_id, l.level, l.message, l.meta->>'kind' AS kind, l.meta->>'state' AS join_state,
                l.meta->>'facebook_message' AS fb_message, l.created_at AS seen_at, l.job_id
           FROM ${AP}.run_logs l
          WHERE l.level IN ('success', 'warn') AND l.group_id IS NOT NULL AND l.user_id IS NOT NULL
            AND l.created_at > now() - interval '30 days'
          ORDER BY l.user_id, l.group_id, l.created_at DESC
       )
       SELECT latest.*, u.name AS account, g.name AS group_name, pl.post_link, pl.post_status
         FROM latest
         LEFT JOIN ${AP}.users u ON u.id = latest.user_id
         LEFT JOIN ${AP}.groups g ON g.fb_group_id = latest.group_id
         LEFT JOIN LATERAL (
           -- ลิงก์ที่เก็บตอนโพสต์ครั้งนั้น (บันทึกก่อน log สำเร็จไม่กี่นาที) หรือที่รอบเก็บคอมเมนต์หาเจอทีหลัง
           SELECT p.post_link, p.post_status FROM ${AP}.post_logs p
            WHERE p.user_id = latest.user_id AND p.group_id = latest.group_id
              AND p.created_at >= latest.seen_at - interval '15 minutes'
            ORDER BY p.created_at DESC LIMIT 1
         ) pl ON latest.level = 'success'
        ORDER BY latest.seen_at DESC
        LIMIT 500`,
    );
    const out: ManualJoinGroup[] = [];
    for (const r of rows) {
      const groupUrl = `https://www.facebook.com/groups/${r.group_id}`;
      const link = String(r.post_link ?? '').trim();
      let state: ManualJoinGroup['state'];
      let url = groupUrl;
      let detail: string | null = null;
      if (r.level === 'success') {
        if (r.post_status === 'รออนุมัติ') {
          state = 'post_pending';
          if (link) url = link;
        } else if (link) {
          continue; // ขึ้นในกลุ่มแล้ว
        } else {
          state = 'unconfirmed';
          url = `${groupUrl}/my_posted_content`;
        }
      } else if (r.kind === 'join' && r.join_state && JOIN_STATES.has(r.join_state)) {
        state = r.join_state as ManualJoinGroup['state'];
        if (state === 'unknown') {
          // ข้อความที่อ่านจากหน้ากลุ่มบางทีเป็นแค่คำอธิบายความเป็นส่วนตัวของกลุ่ม — เก็บเฉพาะที่บอกเหตุจริง
          const hint = r.message?.split('หน้ากลุ่มเขียนว่า:')[1]?.replace(/\(กลุ่ม \d+\)\s*$/, '').trim() ?? '';
          detail = /พัก|ปิด|ลบ|ไม่พร้อมใช้งาน|ไม่มีเนื้อหา|paused|archived|unavailable/i.test(hint) ? hint : null;
        }
      } else if (r.kind === 'post_rejected') {
        state = 'rejected';
        detail = r.fb_message;
      } else {
        state = 'failed';
      }
      out.push({
        user_id: r.user_id,
        account: r.account,
        group_id: r.group_id,
        group_name: r.group_name,
        url,
        state,
        detail,
        request_no: r.job_id ? requestNoFromAssignment(r.job_id) : null,
        seen_at: r.seen_at,
      });
    }
    // ไล่ทีละบัญชี: ล็อกอินบัญชีเดียวแล้วแก้ทุกกลุ่มของบัญชีนั้น
    return out.sort(
      (a, b) =>
        (a.account ?? '').localeCompare(b.account ?? '', 'th') ||
        new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime(),
    );
  } catch {
    return [];
  }
}

export type AccountNeedingVerification = { id: string; name: string | null; since: string; note: string | null };

/**
 * บัญชี Facebook ที่ Facebook ขอยืนยันตัวตนแล้วยังไม่ผ่าน (เซิร์ฟเวอร์ Auto-Post จดไว้ตอนรอบล้มเพราะ checkpoint
 * และลบเองเมื่อมีรอบผ่าน) — ระหว่างนี้ระบบไม่ส่งรอบเก็บคอมเมนต์อัตโนมัติให้บัญชีนั้น
 */
export async function listAccountsNeedingVerification(): Promise<AccountNeedingVerification[]> {
  return q<AccountNeedingVerification>(
    `SELECT id, name, needs_verification_since AS since, needs_verification_note AS note
       FROM ${AP}.users WHERE needs_verification_since IS NOT NULL
      ORDER BY needs_verification_since`,
  ).catch(() => []);
}

/** คนยืนยันตัวตนที่เครื่องแล้ว — เอาออกจากรายการ ให้ระบบกลับมาเก็บคอมเมนต์บัญชีนี้ */
export async function clearAccountVerification(userId: string) {
  await q(`UPDATE ${AP}.users SET needs_verification_since = NULL, needs_verification_note = NULL WHERE id = $1`, [userId]);
}
