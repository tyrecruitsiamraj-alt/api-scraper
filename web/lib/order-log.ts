import 'server-only';
import { q } from './db';
import { OUTCOMES, orderOutcome } from '../../src/core/order-outcome.js';
import type { OrderOutcomeKey } from '../../src/core/order-outcome.js';
import { countGroupStatuses, linkedCount, orderGroupResults } from '../../src/core/order-groups.js';
import { stopCodeForText, stopReasonLine } from '../../autopost/server/post-stop.js';
import type { GroupStatusKey, OrderGroupResult } from '../../src/core/order-groups.js';

const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;

export const ORDER_RANGES = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วันล่าสุด' },
  { value: '30d', label: '30 วันล่าสุด' },
] as const;
export type OrderRange = (typeof ORDER_RANGES)[number]['value'];

export const ORDER_TYPES = [
  { value: '', label: 'ทุกประเภท' },
  { value: 'content', label: 'โพสต์' },
  { value: 'scraping', label: 'Scrap' },
] as const;

export type OrderLogRow = {
  id: string;
  request_no: string;
  type: 'content' | 'scraping';
  who: string;
  created_at: string;
  position: string | null;
  account: string | null;
  notes: string | null;
  outcome: OrderOutcomeKey;
  stage: string;
  /** โพสต์: กลุ่มที่ขึ้นแล้ว (มีลิงก์โพสต์) · Scrap: คนที่ได้ */
  got: number;
  /** Scrap: เป้าหมายจำนวนคน */
  target: number | null;
  task_id: string | null;
  /** โพสต์: จำนวนกลุ่มแยกสถานะ (ผลรวม = total) · Scrap: null */
  group_counts: ({ total: number } & Record<GroupStatusKey, number>) | null;
  /** โพสต์: ผลทีละกลุ่ม · Scrap: [] */
  groups: OrderGroupResult[];
};

export type OrderPersonSummary = {
  who: string;
  total: number;
  counts: Record<OrderOutcomeKey, number>;
  posted_groups: number;
  candidates: number;
};

/** คำสั่งจาก Jarvis ทุกใบในช่วงเวลา */
export async function listOrderLog(range: OrderRange, type: string): Promise<OrderLogRow[]> {
  const since =
    range === 'today'
      ? `date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`
      : `now() - interval '${range === '7d' ? 7 : 30} days'`;
  return loadOrders(`req.created_at >= ${since}`, `${since} - interval '1 day'`, [type === 'content' || type === 'scraping' ? type : ''], `($1 = '' OR req.type = $1)`);
}

/**
 * ใบที่สั่งในช่วงวันที่ไทย (รวมวันสุดท้าย) — เส้นให้ Jarvis ดึงหน้าคำสั่งงาน (เจ้าของ 13 พ.ย. 2569)
 * คำนวณด้วย loadOrders ตัวเดียวกับหน้าคำสั่งงาน ตัวเลขจึงตรงกัน
 */
export async function listOrdersBetween(fromDay: string, toDay: string, type: string): Promise<OrderLogRow[]> {
  const from = new Date(`${fromDay}T00:00:00+07:00`);
  const to = new Date(new Date(`${toDay}T00:00:00+07:00`).getTime() + 86_400_000);
  return loadOrders(
    `req.created_at >= $1::timestamptz AND req.created_at < $2::timestamptz`,
    `$1::timestamptz - interval '1 day'`,
    [from.toISOString(), to.toISOString(), type === 'content' || type === 'scraping' ? type : ''],
    `($3 = '' OR req.type = $3)`,
  );
}

export type OrderPerson = { name: string; bu: string | null };

/** ชื่อและฝ่ายของคนสั่ง (jarvis_rm.users) — ชื่อเล่น → ชื่อจริง → อีเมลตัดโดเมน · ฝ่าย = department_code */
export async function loadOrderPeople(whos: string[]): Promise<Map<string, OrderPerson>> {
  const uniq = [...new Set(whos)];
  const rows = uniq.length
    ? await q<{ email: string; name: string | null; bu: string | null }>(
      `SELECT lower(email) AS email, COALESCE(NULLIF(TRIM(nickname), ''), NULLIF(TRIM(full_name), '')) AS name,
              NULLIF(UPPER(TRIM(department_code)), '') AS bu
         FROM "jarvis_rm".users WHERE lower(email) = ANY($1::text[])`,
      [uniq],
    ).catch(() => [])
    : [];
  const found = new Map(rows.map((u) => [u.email, u]));
  return new Map(uniq.map((w) => [w, { name: found.get(w)?.name || w.replace(/@siamraj\.com$/i, ''), bu: found.get(w)?.bu ?? null }]));
}

/** ใบเดียว (id แถวใน Jarvis) พร้อมผลทีละกลุ่ม — หน้ารายละเอียด */
export async function getOrder(id: string): Promise<OrderLogRow | null> {
  const rows = await loadOrders(`req.id = $1`, `now() - interval '60 days'`, [id], 'true');
  return rows[0] ?? null;
}

type RawOrder = {
  id: string; request_no: string; type: 'content' | 'scraping'; who: string; created_at: string; next_at: string | null;
  position: string | null; account: string | null; notes: string | null; jarvis_status: string;
  run_status: string | null; active: boolean; run_error: string | null; group_ids: unknown; task_id: string | null; task_status: string | null;
  run_count: number; stop_code: string | null; stop_reason: string | null; stop_log: string | null;
  got: number | null; target: number | null;
};

/**
 * คำสั่งจาก Jarvis (1 แถวใน Jarvis = 1 ใบ สั่งซ้ำเลขเดิมนับแยกใบ)
 * ใบโพสต์: รอบโพสต์ของ job ใบนี้ (jv-<เลข>) ที่สร้างหลังใบนี้และก่อนใบถัดไปของเลขเดียวกัน
 *   ดูจาก job ไม่ใช่เลข assignment — รอบที่สลับบัญชีมาโพสต์แทนได้ assignment เลขใหม่ (เดิมนับตกไป)
 * ใบ Scrap: งานค้นหาของเลขนี้ในช่วงเดียวกัน
 */
async function loadOrders(where: string, runsSince: string, params: unknown[], typeFilter: string): Promise<OrderLogRow[]> {
  const rows = await q<RawOrder>(
    `WITH req AS (
       SELECT r.id::text AS id, r.request_no, r.created_at, r.status AS jarvis_status, r.notes,
              COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') AS type,
              lower(COALESCE(NULLIF(TRIM(r.requested_by_name), ''), 'ไม่ระบุ')) AS who,
              NULLIF(TRIM(r.job_snapshot->>'position'), '') AS position,
              NULLIF(TRIM(r.job_snapshot->>'account_name'), '') AS account,
              r.job_snapshot->'group_ids' AS group_ids,
              LEAD(r.created_at) OVER (
                PARTITION BY r.request_no, COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content')
                ORDER BY r.created_at) AS next_at
         FROM "jarvis_rm".job_posting_requests r
     ),
     runs AS (
       SELECT DISTINCT p.id, p.run_id, p.status, p.created_at, NULLIF(TRIM(COALESCE(p.error, '')), '') AS error, jid AS job_id,
              -- to_jsonb: คอลัมน์ stop_* เพิ่มทีหลัง (ฐานที่ยังไม่อัปเดตไม่มี) ห้ามให้หน้าเว็บล้ม
              NULLIF(to_jsonb(p)->>'stop_code', '') AS stop_code, NULLIF(to_jsonb(p)->>'stop_reason', '') AS stop_reason
         FROM ${AP}.post_run_queue p
         CROSS JOIN LATERAL jsonb_array_elements_text(p.assignment_ids::jsonb) a
         JOIN ${AP}.assignments asg ON asg.id = a
         CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(asg.job_ids, '[]'::jsonb)) jid
        WHERE p.created_at >= ${runsSince}
     )
     SELECT req.id, req.request_no, req.type, req.who, req.created_at, req.next_at, req.position, req.account, req.notes,
            req.jarvis_status, req.group_ids,
            lastrun.status AS run_status, COALESCE(lastrun.active, false) AS active, lastrun.error AS run_error,
            COALESCE(lastrun.run_count, 0)::int AS run_count, lastrun.stop_code, lastrun.stop_reason, stoplog.message AS stop_log,
            t.id::text AS task_id, t.status AS task_status, t.progress_got AS got, t.progress_target AS target
       FROM req
       LEFT JOIN LATERAL (
         SELECT (array_agg(ru.status ORDER BY ru.created_at DESC))[1] AS status,
                bool_or(ru.status IN ('queued', 'running')) AS active,
                (array_agg(ru.error ORDER BY ru.created_at DESC) FILTER (WHERE ru.error IS NOT NULL))[1] AS error,
                count(*) AS run_count,
                (array_agg(ru.stop_code ORDER BY ru.created_at DESC) FILTER (WHERE ru.stop_code IS NOT NULL))[1] AS stop_code,
                (array_agg(ru.stop_reason ORDER BY ru.created_at DESC) FILTER (WHERE ru.stop_code IS NOT NULL))[1] AS stop_reason,
                array_agg(ru.run_id) FILTER (WHERE ru.run_id IS NOT NULL) AS run_ids
           FROM runs ru
          WHERE req.type = 'content'
            AND ru.job_id = 'jv-' || lower(req.request_no)
            AND ru.created_at >= req.created_at - interval '1 minute'
            AND (req.next_at IS NULL OR ru.created_at < req.next_at)
       ) lastrun ON true
       -- รอบก่อนมีรหัสเหตุ: บรรทัดหยุดกลางทางในบันทึกรอบ (โดนจำกัด/ถูกพัก/ข้ามการโพสต์) — ใช้ตัวแยกเหตุเดียวกันอ่าน
       LEFT JOIN LATERAL (
         SELECT l.message FROM ${AP}.run_logs l
          WHERE lastrun.stop_code IS NULL AND lastrun.error IS NULL
            AND l.run_id = ANY(lastrun.run_ids)
            AND l.group_id IS NULL
            AND (l.meta->>'kind' IN ('run_stop', 'deferred', 'handoff') OR l.level = 'error' OR l.message LIKE 'ข้ามการโพสต์%')
          ORDER BY l.created_at DESC LIMIT 1
       ) stoplog ON true
       LEFT JOIN LATERAL (
         SELECT st.id, st.status, st.progress_got, st.progress_target FROM scrape_tasks st
          WHERE req.type = 'scraping'
            AND st.source_request_no = req.request_no
            AND st.created_at >= req.created_at - interval '1 minute'
            AND (req.next_at IS NULL OR st.created_at < req.next_at)
          ORDER BY st.created_at DESC LIMIT 1
       ) t ON true
      WHERE ${where}
        AND ${typeFilter}
      ORDER BY req.created_at DESC`,
    params,
  );
  const groupsByOrder = await loadPostGroups(rows.filter((r) => r.type === 'content'));
  return rows.map((r) => {
    const groups = groupsByOrder.get(r.id) ?? [];
    const linked = linkedCount(groups);
    const { outcome, stage } = orderOutcome({
      type: r.type,
      jarvis_status: r.jarvis_status,
      run_status: r.run_status,
      posted_groups: linked,
      task_status: r.task_status,
      got: r.got,
    });
    return {
      id: r.id,
      request_no: r.request_no,
      type: r.type,
      who: r.who,
      created_at: r.created_at,
      position: r.position,
      account: r.account,
      notes: r.jarvis_status === 'rejected' ? r.notes : null,
      outcome,
      stage,
      got: r.type === 'content' ? linked : Number(r.got ?? 0),
      target: r.type === 'scraping' ? r.target : null,
      task_id: r.task_id,
      group_counts: r.type === 'content' ? countGroupStatuses(groups) : null,
      groups,
    };
  });
}

/**
 * เหตุที่รอบของใบนี้หยุด: รหัสที่บันทึกตอนรอบหยุด (post_run_queue.stop_code)
 * รอบก่อนมีรหัส: อ่านข้อความ error ของรอบ หรือบรรทัดหยุดในบันทึกรอบ ด้วยตัวแยกเหตุตัวเดียวกัน
 * ไม่มีรอบเลย = no_run · มีรอบแต่ไม่มีเหตุ = unknown
 */
function orderStop(o: RawOrder): { code: string; reason: string | null } {
  if (o.stop_code) return { code: o.stop_code, reason: o.stop_reason };
  const legacy = o.run_error ?? o.stop_log;
  if (legacy) return { code: stopCodeForText(legacy), reason: stopReasonLine(legacy) || null };
  return { code: o.run_count > 0 ? 'unknown' : 'no_run', reason: null };
}

/** ผลรายกลุ่มของทุกใบโพสต์ในชุดเดียว — 3 query รวม ไม่ยิงทีละใบ */
async function loadPostGroups(orders: RawOrder[]): Promise<Map<string, OrderGroupResult[]>> {
  const out = new Map<string, OrderGroupResult[]>();
  if (!orders.length) return out;
  const jobIds = [...new Set(orders.map((o) => `jv-${o.request_no.toLowerCase()}`))];
  const from = new Date(Math.min(...orders.map((o) => new Date(o.created_at).getTime())) - 60_000).toISOString();
  const plannedRaw = [...new Set(orders.flatMap((o) => (Array.isArray(o.group_ids) ? o.group_ids.map(String) : [])))];
  const [attempts, logs, groupRows] = await Promise.all([
    q<{ job_id: string; group_id: string | null; level: string; message: string | null; at: string; account: string | null }>(
      `SELECT l.job_id, l.group_id, l.level, l.message, l.created_at AS at,
              COALESCE(NULLIF(TRIM(u.name), ''), u.env_key, l.user_id) AS account
         FROM ${AP}.run_logs l LEFT JOIN ${AP}.users u ON u.id = l.user_id
        WHERE l.job_id = ANY($1::text[]) AND l.created_at >= $2
          AND l.group_id IS NOT NULL AND l.level IN ('success', 'warn', 'error')`,
      [jobIds, from],
    ),
    q<{ job_id: string; group_id: string | null; post_link: string | null; post_status: string | null; at: string; account: string | null }>(
      `SELECT pl.job_id, pl.group_id, pl.post_link, pl.post_status, pl.created_at AS at,
              COALESCE(NULLIF(TRIM(u.name), ''), u.env_key, pl.user_id) AS account
         FROM ${AP}.post_logs pl LEFT JOIN ${AP}.users u ON u.id = pl.user_id
        WHERE pl.job_id = ANY($1::text[]) AND pl.created_at >= $2`,
      [jobIds, from],
    ),
    // Jarvis ส่งกลุ่มมาเป็น id แถวในคลัง หรือเลขกลุ่ม Facebook — แปลงเป็นเลขกลุ่มพร้อมชื่อ
    q<{ id: string; fb_group_id: string; name: string }>(
      `SELECT id, fb_group_id, COALESCE(NULLIF(TRIM(name), ''), fb_group_id) AS name FROM ${AP}.groups
        WHERE id = ANY($1::text[]) OR fb_group_id = ANY($1::text[])`,
      [plannedRaw],
    ),
  ]);
  const fbOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  for (const g of groupRows) {
    fbOf.set(g.id, String(g.fb_group_id));
    fbOf.set(String(g.fb_group_id), String(g.fb_group_id));
    nameOf.set(String(g.fb_group_id), g.name);
  }
  const missingNames = [...new Set([...attempts, ...logs].map((a) => String(a.group_id ?? '')).filter((fb) => fb && !nameOf.has(fb)))];
  if (missingNames.length) {
    for (const g of await q<{ fb_group_id: string; name: string }>(
      `SELECT fb_group_id, COALESCE(NULLIF(TRIM(name), ''), fb_group_id) AS name FROM ${AP}.groups WHERE fb_group_id = ANY($1::text[])`,
      [missingNames],
    )) nameOf.set(String(g.fb_group_id), g.name);
  }
  for (const o of orders) {
    const jobId = `jv-${o.request_no.toLowerCase()}`;
    const start = new Date(o.created_at).getTime() - 60_000;
    const end = o.next_at ? new Date(o.next_at).getTime() : Infinity;
    const inWindow = (r: { job_id: string; at: string }) => {
      const t = new Date(r.at).getTime();
      return r.job_id === jobId && t >= start && t < end;
    };
    const planned = (Array.isArray(o.group_ids) ? o.group_ids.map(String) : []).map((id) => fbOf.get(id) ?? id);
    out.set(o.id, orderGroupResults({
      planned,
      attempts: attempts.filter(inWindow),
      postLogs: logs.filter(inWindow),
      active: o.active || o.jarvis_status === 'pending' || (o.jarvis_status === 'in_progress' && !o.run_status),
      stop: orderStop(o),
      groupName: (fb) => nameOf.get(fb) ?? fb,
    }));
  }
  return out;
}

/** สรุปรายคน + แถวรวม — แต่ละคน: ทั้งหมด = ผลรวมทุกถัง */
export function summarizeOrders(rows: OrderLogRow[]): { people: OrderPersonSummary[]; total: OrderPersonSummary } {
  const empty = (who: string): OrderPersonSummary => ({
    who,
    total: 0,
    counts: Object.fromEntries(OUTCOMES.map((o) => [o.key, 0])) as Record<OrderOutcomeKey, number>,
    posted_groups: 0,
    candidates: 0,
  });
  const byWho = new Map<string, OrderPersonSummary>();
  const total = empty('รวม');
  for (const r of rows) {
    const p = byWho.get(r.who) ?? empty(r.who);
    byWho.set(r.who, p);
    for (const s of [p, total]) {
      s.total += 1;
      s.counts[r.outcome] += 1;
      if (r.type === 'content') s.posted_groups += r.got;
      else s.candidates += r.got;
    }
  }
  const people = [...byWho.values()].sort((a, b) => b.total - a.total || a.who.localeCompare(b.who));
  return { people, total };
}

export type PostGroupRow = {
  /** แถวใบใน Jarvis + เลขกลุ่ม — ไม่ซ้ำกันทั้งตาราง */
  key: string;
  order_id: string;
  request_no: string;
  position: string | null;
  ordered_at: string;
  who: string;
  /** ชื่อเล่นใน Jarvis → ชื่อจริง → อีเมลตัดโดเมน */
  who_name: string;
  /** ฝ่ายของคนสั่ง (jarvis_rm.users.department_code) เช่น LBA · LBD · null = ไม่รู้ */
  who_bu: string | null;
  account: string | null;
  fb_group_id: string;
  group_name: string;
  status: GroupStatusKey;
  /** เวลาที่โพสต์/ลองโพสต์กลุ่มนี้ — null = ยังไม่ได้ลอง */
  at: string | null;
  error: string | null;
  post_link: string | null;
};

/** วันที่ YYYY-MM-DD (เวลาไทย) — ไม่ถูกรูปแบบคืน null */
export function parseDay(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return Number.isNaN(new Date(`${v}T00:00:00+07:00`).getTime()) ? null : v;
}

/**
 * ใบโพสต์จาก Jarvis ที่สั่งในช่วงวันที่ (รวมวันสุดท้าย) แตกเป็นแถวละกลุ่ม
 * สถานะใช้ orderGroupResults ตัวเดียวกับหน้าใบสั่ง — ผลรวมทุกสถานะ = จำนวนแถว
 * bu = เฉพาะใบที่คนสั่งอยู่ฝ่ายนั้น (การ์ดภาพรวมงานสรรหาใน Jarvis กรองตาม BU) · ไม่ส่ง = ทุกฝ่าย
 */
export async function listPostGroupRows(fromDay: string, toDay: string, bu: string | null = null): Promise<PostGroupRow[]> {
  const from = new Date(`${fromDay}T00:00:00+07:00`);
  const to = new Date(new Date(`${toDay}T00:00:00+07:00`).getTime() + 86_400_000);
  const orders = await loadOrders(
    `req.created_at >= $1::timestamptz AND req.created_at < $2::timestamptz`,
    `$1::timestamptz - interval '1 day'`,
    [from.toISOString(), to.toISOString()],
    `req.type = 'content'`,
  );
  const names = await loadOrderPeople(orders.map((o) => o.who));
  const wantBu = bu ? bu.trim().toUpperCase() : null;
  return orders.filter((o) => !wantBu || names.get(o.who)?.bu === wantBu).flatMap((o) =>
    o.groups.map((g) => ({
      key: `${o.id}:${g.fb_group_id}`,
      order_id: o.id,
      request_no: o.request_no,
      position: o.position,
      ordered_at: o.created_at,
      who: o.who,
      who_name: names.get(o.who)?.name ?? o.who,
      who_bu: names.get(o.who)?.bu ?? null,
      account: g.account ?? o.account,
      fb_group_id: g.fb_group_id,
      group_name: g.name,
      status: g.status,
      at: g.at,
      error: g.error,
      post_link: g.post_link,
    })),
  );
}
