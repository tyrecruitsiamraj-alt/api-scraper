import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { jarvisKeyMatches } from '@/lib/jarvis-auth';
import { getJarvisStatuses } from '@/lib/jarvis-status';

export const dynamic = 'force-dynamic';

/**
 * ผลงานของคำสั่งจาก Jarvis (ดึงได้ครั้งละไม่เกิน 20 ใบ)
 * GET /api/integrations/jarvis/status?request_no=OPL6905114
 * GET /api/integrations/jarvis/status?request_no=OPL6905114,OPL6910068
 */
export async function GET(req: Request) {
  if (!jarvisKeyMatches(req) && !(await getServerSession(authOptions))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const requestNos = url.searchParams.getAll('request_no').flatMap((v) => v.split(','));
  if (!requestNos.some((r) => r.trim())) return NextResponse.json({ error: 'request_no required' }, { status: 400 });
  try {
    return NextResponse.json({ requests: await getJarvisStatuses(requestNos) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'status_failed' }, { status: 500 });
  }
}
