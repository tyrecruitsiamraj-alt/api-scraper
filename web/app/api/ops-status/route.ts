import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { q } from '@/lib/db';
import { listWorkerHeartbeats } from '@/lib/repo';

export const dynamic = 'force-dynamic';

function authorized(req: Request, session: unknown): boolean {
  if (session) return true;
  const token = process.env.REPAIR_TOKEN?.trim();
  if (!token) return false;
  const header = req.headers.get('authorization') || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(bearer && bearer === token);
}

/** Ops snapshot: workers + recent scrape tasks (no PII). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!authorized(req, session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const qText = String(url.searchParams.get('q') || 'ช่างอาคาร').trim();

  const workers = await listWorkerHeartbeats();
  const preferred = String(process.env.SCRAPE_PREFERRED_WORKER || '').trim();
  const tasks = await q<{
    id: string;
    name: string;
    status: string;
    phase: string;
    last_error: string | null;
    progress_got: number;
    progress_target: number;
    updated_at: string;
    created_at: string;
  }>(
    `SELECT id, name, status, phase, last_error, progress_got, progress_target, updated_at, created_at
       FROM scrape_tasks
      WHERE name ILIKE $1 OR COALESCE(criteria->>'position','') ILIKE $1
         OR COALESCE(criteria->>'job_description','') ILIKE $1
      ORDER BY updated_at DESC
      LIMIT 12`,
    [`%${qText}%`],
  );

  const queue = await q<{
    id: string;
    ref_id: string;
    status: string;
    preferred_worker: string | null;
    worker_id: string | null;
    last_error: string | null;
    created_at: string;
    started_at: string | null;
    locked_at: string | null;
  }>(
    `SELECT id, ref_id, status, preferred_worker, worker_id, last_error, created_at, started_at, locked_at
       FROM work_queue
      WHERE type='scrape'
        AND (
          ref_id = ANY($1::text[])
          OR created_at > now() - interval '2 days'
        )
      ORDER BY created_at DESC
      LIMIT 20`,
    [tasks.map((t) => t.id)],
  );

  const scraperWorkers = workers.filter((w) => w.kind === 'scraper').map((w) => ({
    name: w.name,
    online: w.online,
    last_seen: w.last_seen,
    machine_name: w.meta?.machine_name ?? null,
    content_pipeline: w.meta?.content_pipeline ?? null,
    types: w.meta?.types ?? null,
    build_sha: w.meta?.build_sha ?? null,
  }));

  return NextResponse.json({
    ok: true,
    preferredWorker: preferred || null,
    scraperWorkers,
    tasks,
    queue,
  });
}
