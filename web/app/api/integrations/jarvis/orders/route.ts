import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { jarvisKeyMatches } from '@/lib/jarvis-auth';
import { listOrdersBetween, loadOrderPeople, parseDay, summarizeOrders } from '@/lib/order-log';
import { OUTCOMES } from '../../../../../../src/core/order-outcome.js';
import { GROUP_STATUSES } from '../../../../../../src/core/order-groups.js';

export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 200;

/**
 * หน้า "คำสั่งงาน" ให้ Jarvis ดึงไปแสดง (เจ้าของ 13 พ.ย. 2569: ทั้งหน้า แยกตามฝ่าย)
 * GET /api/integrations/jarvis/orders?from=2026-11-13&to=2026-11-13&bu=LBA&type=content&by=a@siamraj.com&outcome=failed&page=1&page_size=20
 * from/to = วันที่ไทย (รวมวันสุดท้าย) · ไม่ส่ง = วันนี้ · bu = ฝ่ายของคนสั่ง · type = content | scraping · ไม่ส่ง = ทั้งหมด
 * people/total = ยอดรวมทั้งช่วงหลังกรองฝ่ายกับประเภท (ไม่กรอง by/outcome — เหมือนตารางสรุปบนหน้าคำสั่งงาน)
 * rows = รายการใบหลังกรอง by/outcome แบ่งหน้า · ผลรายกลุ่มของใบดูที่ /orders/{id}
 */
export async function GET(req: Request) {
  if (!jarvisKeyMatches(req) && !(await getServerSession(authOptions))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  let from = url.searchParams.has('from') ? parseDay(url.searchParams.get('from')) : today;
  let to = url.searchParams.has('to') ? parseDay(url.searchParams.get('to')) : today;
  if (!from || !to) return NextResponse.json({ error: 'from และ to ต้องเป็น YYYY-MM-DD' }, { status: 400 });
  if (from > to) [from, to] = [to, from];
  const bu = (url.searchParams.get('bu') ?? '').trim().toUpperCase();
  if (bu && !/^[A-Z0-9_-]{1,20}$/.test(bu)) return NextResponse.json({ error: 'bu ไม่ถูกต้อง' }, { status: 400 });
  const type = url.searchParams.get('type') ?? '';
  if (type && type !== 'content' && type !== 'scraping') return NextResponse.json({ error: 'type ต้องเป็น content หรือ scraping' }, { status: 400 });
  const by = (url.searchParams.get('by') ?? '').trim().toLowerCase();
  const outcome = url.searchParams.get('outcome') ?? '';
  if (outcome && !OUTCOMES.some((o) => o.key === outcome)) return NextResponse.json({ error: 'outcome ไม่ถูกต้อง' }, { status: 400 });
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(url.searchParams.get('page_size') ?? '20', 10) || 20));

  try {
    const all = await listOrdersBetween(from, to, type);
    const people = await loadOrderPeople(all.map((o) => o.who));
    const inBu = bu ? all.filter((o) => people.get(o.who)?.bu === bu) : all;
    const summary = summarizeOrders(inBu);
    const listed = inBu.filter((o) => (!by || o.who === by) && (!outcome || o.outcome === outcome));
    const pages = Math.max(1, Math.ceil(listed.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
    const outcomeLabel = new Map(OUTCOMES.map((o) => [o.key, o.label]));
    const person = (who: string) => ({ ordered_by: who, ordered_by_name: people.get(who)?.name ?? who, ordered_by_bu: people.get(who)?.bu ?? null });
    return NextResponse.json(
      {
        from,
        to,
        bu: bu || null,
        type: type || null,
        outcomes: OUTCOMES,
        group_statuses: GROUP_STATUSES,
        total: summary.total,
        people: summary.people.map((p) => ({ ...person(p.who), total: p.total, counts: p.counts, posted_groups: p.posted_groups, candidates: p.candidates })),
        page,
        page_size: pageSize,
        pages,
        listed: listed.length,
        rows: listed.slice((page - 1) * pageSize, page * pageSize).map((o) => ({
          id: o.id,
          request_no: o.request_no,
          type: o.type,
          ordered_at: o.created_at,
          ...person(o.who),
          position: o.position,
          account: o.account,
          outcome: o.outcome,
          outcome_label: outcomeLabel.get(o.outcome) ?? o.outcome,
          stage: o.stage,
          got: o.got,
          target: o.target,
          group_counts: o.group_counts,
          notes: o.notes,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'orders_failed' }, { status: 500 });
  }
}
