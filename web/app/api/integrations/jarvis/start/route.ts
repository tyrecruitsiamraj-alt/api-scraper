import { NextResponse } from 'next/server';
import { jarvisKeyMatches } from '@/lib/jarvis-auth';
import { startJarvisRequest } from '@/lib/jarvis-start';

export const dynamic = 'force-dynamic';

/**
 * Jarvis เรียกหลังบันทึกคำสั่ง (job_posting_requests status=pending) เพื่อให้งานเริ่มทันที
 * POST /api/integrations/jarvis/start  { "request_no": "OPL6910068" }
 */
export async function POST(req: Request) {
  if (!jarvisKeyMatches(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { request_no?: unknown };
  const requestNo = String(body.request_no ?? '').trim();
  if (!requestNo) return NextResponse.json({ error: 'request_no required' }, { status: 400 });
  try {
    const result = await startJarvisRequest(requestNo);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message || 'start_failed' }, { status: 500 });
  }
}
