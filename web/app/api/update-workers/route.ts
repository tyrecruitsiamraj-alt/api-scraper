import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { q } from '@/lib/db';

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
 * Enqueue update_code jobs for online scraper slots (git reset → pool respawn).
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

  let body: { workers?: string[]; restart?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const online = await q<{ name: string; build_sha: string | null }>(
    `SELECT name, meta->>'build_sha' AS build_sha
       FROM workers
      WHERE kind = 'scraper'
        AND last_seen > now() - interval '2 minutes'
        AND name ~ '^scraper-[0-9]+$'
      ORDER BY name`,
  );

  const wanted = Array.isArray(body.workers) && body.workers.length
    ? body.workers.map(String)
    : online.map((w) => w.name);

  const targets = online.filter((w) => wanted.includes(w.name));
  if (!targets.length) {
    return NextResponse.json({
      ok: false,
      error: 'ไม่มี scraper ออนไลน์ที่จะอัปเดต',
      online: online.map((w) => ({ name: w.name, build_sha: w.build_sha })),
    }, { status: 409 });
  }

  const restart = body.restart !== false;
  const enqueued: { worker: string; jobId: string; prior_sha: string | null }[] = [];
  for (const w of targets) {
    const rows = await q<{ id: string }>(
      `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user, preferred_worker, priority)
       VALUES ('update_code', 'system', $1, NULL, $2::jsonb, NULL, $3, 2000)
       RETURNING id`,
      [
        `system:update_code:${w.name}:${Date.now()}`,
        JSON.stringify({ restart, requested_at: new Date().toISOString() }),
        w.name,
      ],
    );
    enqueued.push({ worker: w.name, jobId: rows[0].id, prior_sha: w.build_sha });
  }

  return NextResponse.json({
    ok: true,
    enqueued,
    note: 'Worker ต้องมี handler update_code แล้ว — ถ้ายังอยู่ SHA เก่า ให้รัน UPDATE-SCRAPE-NOW.bat หรือกด Update Code บนเครื่อง',
  });
}
