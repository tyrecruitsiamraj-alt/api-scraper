import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import writeExcelFile from 'write-excel-file/node';
import { authOptions } from '@/lib/auth';
import { listPostGroupRows, parseDay } from '@/lib/order-log';
import type { PostGroupRow } from '@/lib/order-log';
import { GROUP_STATUSES } from '../../../../../../src/core/order-groups.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function when(iso: string | null) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const head = (value: string) => ({ value, fontWeight: 'bold' as const });

/** ไฟล์ Excel ของหน้า "โพสต์รายกลุ่ม" — ช่วงวันที่เดียวกับบนหน้า ทุกแถว ไม่แบ่งหน้า */
export async function GET(req: Request) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  let from = parseDay(url.searchParams.get('from'));
  let to = parseDay(url.searchParams.get('to'));
  if (!from || !to) return NextResponse.json({ error: 'from และ to ต้องเป็น YYYY-MM-DD' }, { status: 400 });
  if (from > to) [from, to] = [to, from];

  const rows = await listPostGroupRows(from, to);
  const label = (key: PostGroupRow['status']) => GROUP_STATUSES.find((s) => s.key === key)?.label ?? key;
  const buffer = await writeExcelFile(rows, {
    sheet: 'โพสต์รายกลุ่ม',
    columns: [
      { header: head('คนสั่ง'), cell: (r: PostGroupRow) => ({ value: r.who_name }), width: 16 },
      { header: head('บัญชี'), cell: (r: PostGroupRow) => ({ value: r.account ?? '' }), width: 22 },
      { header: head('กลุ่ม'), cell: (r: PostGroupRow) => ({ value: r.group_name }), width: 40 },
      { header: head('เลขกลุ่ม Facebook'), cell: (r: PostGroupRow) => ({ value: r.fb_group_id }), width: 20 },
      { header: head('ใบขอ'), cell: (r: PostGroupRow) => ({ value: r.request_no }), width: 14 },
      { header: head('งาน'), cell: (r: PostGroupRow) => ({ value: r.position ?? '' }), width: 30 },
      { header: head('วันที่สั่ง'), cell: (r: PostGroupRow) => ({ value: when(r.ordered_at) }), width: 20 },
      { header: head('สถานะ'), cell: (r: PostGroupRow) => ({ value: label(r.status) }), width: 24 },
      { header: head('เวลาโพสต์'), cell: (r: PostGroupRow) => ({ value: when(r.at) }), width: 20 },
      { header: head('ลิงก์โพสต์'), cell: (r: PostGroupRow) => ({ value: r.post_link ?? '' }), width: 60 },
      { header: head('เหตุที่ไม่สำเร็จ'), cell: (r: PostGroupRow) => ({ value: r.error ?? '' }), width: 50 },
    ],
  }).toBuffer();

  const filename = `โพสต์รายกลุ่ม ${from} ถึง ${to}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="post-groups-${from}-${to}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
