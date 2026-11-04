import 'server-only';
import { q } from './db';
import { OUTCOMES, orderOutcome } from '../../src/core/order-outcome.js';
import type { OrderOutcomeKey } from '../../src/core/order-outcome.js';

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
};

export type OrderPersonSummary = {
  who: string;
  total: number;
  counts: Record<OrderOutcomeKey, number>;
  posted_groups: number;
  candidates: number;
};

/**
 * คำสั่งจาก Jarvis ทุกใบในช่วงเวลา (1 แถวใน Jarvis = 1 ใบ สั่งซ้ำเลขเดิมนับแยกใบ)
 * ใบโพสต์: จับรอบโพสต์ที่สร้างหลังใบนี้และก่อนใบถัดไปของเลขเดียวกัน · ใบ Scrap: งานค้นหาของเลขนี้ในช่วงเดียวกัน
 */
export async function listOrderLog(range: OrderRange, type: string): Promise<OrderLogRow[]> {
  const since =
    range === 'today'
      ? `date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'`
      : `now() - interval '${range === '7d' ? 7 : 30} days'`;
  const rows = await q<{
    id: string; request_no: string; type: 'content' | 'scraping'; who: string; created_at: string;
    position: string | null; account: string | null; notes: string | null; jarvis_status: string;
    run_status: string | null; posted_groups: number; task_id: string | null; task_status: string | null;
    got: number | null; target: number | null;
  }>(
    `WITH req AS (
       SELECT r.id::text AS id, r.request_no, r.created_at, r.status AS jarvis_status, r.notes,
              COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') AS type,
              lower(COALESCE(NULLIF(TRIM(r.requested_by_name), ''), 'ไม่ระบุ')) AS who,
              NULLIF(TRIM(r.job_snapshot->>'position'), '') AS position,
              NULLIF(TRIM(r.job_snapshot->>'account_name'), '') AS account,
              LEAD(r.created_at) OVER (
                PARTITION BY r.request_no, COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content')
                ORDER BY r.created_at) AS next_at
         FROM "jarvis_rm".job_posting_requests r
     ),
     runs AS (
       SELECT p.run_id, p.status, p.created_at, a AS assignment
         FROM ${AP}.post_run_queue p, jsonb_array_elements_text(p.assignment_ids::jsonb) a
        WHERE p.created_at >= ${since} - interval '1 day'
     )
     SELECT req.id, req.request_no, req.type, req.who, req.created_at, req.position, req.account, req.notes, req.jarvis_status,
            lastrun.status AS run_status,
            COALESCE(posted.n, 0)::int AS posted_groups,
            t.id::text AS task_id, t.status AS task_status, t.progress_got AS got, t.progress_target AS target
       FROM req
       LEFT JOIN LATERAL (
         SELECT ru.status FROM runs ru
          WHERE req.type = 'content'
            AND (ru.assignment = 'jv-' || lower(req.request_no) OR ru.assignment LIKE 'jv-' || lower(req.request_no) || '-r%')
            AND ru.created_at >= req.created_at - interval '1 minute'
            AND (req.next_at IS NULL OR ru.created_at < req.next_at)
          ORDER BY ru.created_at DESC LIMIT 1
       ) lastrun ON true
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT pl.id)::int AS n FROM ${AP}.post_logs pl
          WHERE COALESCE(pl.post_link, '') <> ''
            AND pl.run_id IN (
              SELECT ru.run_id FROM runs ru
               WHERE req.type = 'content'
                 AND (ru.assignment = 'jv-' || lower(req.request_no) OR ru.assignment LIKE 'jv-' || lower(req.request_no) || '-r%')
                 AND ru.created_at >= req.created_at - interval '1 minute'
                 AND (req.next_at IS NULL OR ru.created_at < req.next_at))
       ) posted ON true
       LEFT JOIN LATERAL (
         SELECT st.id, st.status, st.progress_got, st.progress_target FROM scrape_tasks st
          WHERE req.type = 'scraping'
            AND st.source_request_no = req.request_no
            AND st.created_at >= req.created_at - interval '1 minute'
            AND (req.next_at IS NULL OR st.created_at < req.next_at)
          ORDER BY st.created_at DESC LIMIT 1
       ) t ON true
      WHERE req.created_at >= ${since}
        AND ($1 = '' OR req.type = $1)
      ORDER BY req.created_at DESC`,
    [type === 'content' || type === 'scraping' ? type : ''],
  );
  return rows.map((r) => {
    const { outcome, stage } = orderOutcome({
      type: r.type,
      jarvis_status: r.jarvis_status,
      run_status: r.run_status,
      posted_groups: r.posted_groups,
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
      got: r.type === 'content' ? r.posted_groups : Number(r.got ?? 0),
      target: r.type === 'scraping' ? r.target : null,
      task_id: r.task_id,
    };
  });
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
