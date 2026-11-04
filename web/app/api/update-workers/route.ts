import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { enqueueWorkerCodeUpdate } from '@/lib/repo';

export const dynamic = 'force-dynamic';

function authorized(req: Request, session: unknown): boolean {
  if (session) return true;
  const token = process.env.REPAIR_TOKEN?.trim();
  if (!token) return false;
  const header = req.headers.get('authorization') || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(bearer && bearer === token);
}

/**
 * Enqueue update_code jobs for online scraper slots (git reset → pool respawn;
 * on Mac the whole machine updates Scrap + Autopost once).
 * Auth: desk session or Authorization: Bearer $REPAIR_TOKEN.
 *
 * Note: workers only claim this after they already run a build that registers
 * the update_code handler. First upgrade still needs Update Code / UPDATE-SCRAPE-NOW.bat.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!authorized(req, session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { workers?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const only = Array.isArray(body.workers) ? body.workers.map(String) : [];
  const { enqueued, online, posting } = await enqueueWorkerCodeUpdate(only);
  if (posting) {
    return NextResponse.json({ ok: false, error: `Autopost กำลังโพสต์อยู่ ${posting} งาน รอให้เสร็จก่อน` }, { status: 409 });
  }
  if (!enqueued.length) {
    return NextResponse.json({
      ok: false,
      error: 'ไม่มี scraper ออนไลน์ที่จะอัปเดต (หรือมีคำสั่งอัปเดตรออยู่แล้ว)',
      online,
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    enqueued,
    note: 'Worker ต้องมี handler update_code แล้ว — ถ้ายังอยู่ SHA เก่า ให้รัน UPDATE-SCRAPE-NOW.bat หรือกด Update Code บนเครื่อง',
  });
}
