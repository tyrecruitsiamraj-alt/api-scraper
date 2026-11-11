import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { jarvisKeyMatches } from '@/lib/jarvis-auth';
import { listPostGroupRows, parseDay } from '@/lib/order-log';
import { GROUP_STATUSES } from '../../../../../../src/core/order-groups.js';

export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 200;

/**
 * ตารางเดียวกับหน้า "โพสต์รายกลุ่ม" ให้ Jarvis ดึงไปแสดง — ใบโพสต์ที่สั่งในช่วงวันที่ แตกเป็นแถวละกลุ่ม
 * GET /api/integrations/jarvis/post-groups?from=2026-10-01&to=2026-11-11&bu=LBA&page=1&page_size=10
 * from/to = วันที่ไทย (รวมวันสุดท้าย) · ไม่ส่ง from = 2026-10-01 · ไม่ส่ง to = วันนี้
 * bu = ฝ่ายของคนสั่ง (department_code ใน Jarvis) · ไม่ส่ง = ทุกฝ่าย
 * counts = จำนวนแยกสถานะของทั้งช่วง (ผลรวม = total) ไม่ใช่แค่หน้านี้
 */
export async function GET(req: Request) {
  if (!jarvisKeyMatches(req) && !(await getServerSession(authOptions))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  let from = url.searchParams.has('from') ? parseDay(url.searchParams.get('from')) : '2026-10-01';
  let to = url.searchParams.has('to') ? parseDay(url.searchParams.get('to')) : today;
  if (!from || !to) return NextResponse.json({ error: 'from และ to ต้องเป็น YYYY-MM-DD' }, { status: 400 });
  if (from > to) [from, to] = [to, from];
  const bu = (url.searchParams.get('bu') ?? '').trim();
  if (bu && !/^[A-Za-z0-9_-]{1,20}$/.test(bu)) return NextResponse.json({ error: 'bu ไม่ถูกต้อง' }, { status: 400 });
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(url.searchParams.get('page_size') ?? '10', 10) || 10));

  try {
    const rows = await listPostGroupRows(from, to, bu || null);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
    const label = new Map(GROUP_STATUSES.map((s) => [s.key, s.label]));
    return NextResponse.json(
      {
        from,
        to,
        bu: bu ? bu.toUpperCase() : null,
        page,
        page_size: pageSize,
        pages,
        total: rows.length,
        statuses: GROUP_STATUSES,
        counts: Object.fromEntries(GROUP_STATUSES.map((s) => [s.key, rows.filter((r) => r.status === s.key).length])),
        rows: rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
          request_no: r.request_no,
          position: r.position,
          ordered_at: r.ordered_at,
          ordered_by: r.who,
          ordered_by_name: r.who_name,
          ordered_by_bu: r.who_bu,
          account: r.account,
          fb_group_id: r.fb_group_id,
          group_name: r.group_name,
          status: r.status,
          status_label: label.get(r.status) ?? r.status,
          posted_at: r.at,
          post_link: r.post_link,
          error: r.error,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'post_groups_failed' }, { status: 500 });
  }
}
