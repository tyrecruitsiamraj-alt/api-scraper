import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { jarvisKeyMatches } from '@/lib/jarvis-auth';
import { getOrder, loadOrderPeople } from '@/lib/order-log';
import { OUTCOMES } from '../../../../../../../src/core/order-outcome.js';
import { GROUP_STATUSES } from '../../../../../../../src/core/order-groups.js';

export const dynamic = 'force-dynamic';

/**
 * ใบเดียวพร้อมผลรายกลุ่ม (เหมือนหน้ารายละเอียดใบบนหน้าคำสั่งงาน) ให้ Jarvis ดึง
 * GET /api/integrations/jarvis/orders/{id}?bu=LBA · id = แถวใบใน Jarvis (job_posting_requests.id)
 * ส่ง bu มาแล้วใบนี้เป็นของคนฝ่ายอื่น = 404 (แยกตามฝ่ายเหมือนรายการ)
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!jarvisKeyMatches(req) && !(await getServerSession(authOptions))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const bu = (new URL(req.url).searchParams.get('bu') ?? '').trim().toUpperCase();
  if (bu && !/^[A-Z0-9_-]{1,20}$/.test(bu)) return NextResponse.json({ error: 'bu ไม่ถูกต้อง' }, { status: 400 });
  try {
    const o = await getOrder(String(id));
    if (!o) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const who = (await loadOrderPeople([o.who])).get(o.who);
    if (bu && who?.bu !== bu) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const statusLabel = new Map(GROUP_STATUSES.map((s) => [s.key, s.label]));
    return NextResponse.json(
      {
        id: o.id,
        request_no: o.request_no,
        type: o.type,
        ordered_at: o.created_at,
        ordered_by: o.who,
        ordered_by_name: who?.name ?? o.who,
        ordered_by_bu: who?.bu ?? null,
        position: o.position,
        account: o.account,
        outcome: o.outcome,
        outcome_label: OUTCOMES.find((x) => x.key === o.outcome)?.label ?? o.outcome,
        stage: o.stage,
        got: o.got,
        target: o.target,
        notes: o.notes,
        group_counts: o.group_counts,
        groups: o.groups.map((g) => ({
          fb_group_id: g.fb_group_id,
          group_name: g.name,
          status: g.status,
          status_label: statusLabel.get(g.status) ?? g.status,
          account: g.account,
          posted_at: g.at,
          post_link: g.post_link,
          error: g.error,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'order_failed' }, { status: 500 });
  }
}
