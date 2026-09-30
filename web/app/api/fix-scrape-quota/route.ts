import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { q } from '@/lib/db';
import { enqueueScrapeForTask } from '@/lib/repo';
import { kickWorker } from '@/lib/worker-kick';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BANGKOK_DAY_START = `((now() AT TIME ZONE 'Asia/Bangkok')::date::timestamp AT TIME ZONE 'Asia/Bangkok')`;

function authorized(req: Request, session: unknown): boolean {
  if (session) return true;
  const token = process.env.REPAIR_TOKEN?.trim();
  if (!token) return false;
  const header = req.headers.get('authorization') || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(bearer && bearer === token);
}

/**
 * Unblock scrapes when repair/enrich falsely inflated last_seen_at-based quota.
 * Auth: desk session or Authorization: Bearer $REPAIR_TOKEN.
 *
 * Body: { platform?: string, requeueTaskId?: string, dryRun?: boolean }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!authorized(req, session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { platform?: string; requeueTaskId?: string; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const platform = String(body.platform || 'jobbkk').trim() || 'jobbkk';
  const dryRun = Boolean(body.dryRun);
  const requeueTaskId = String(body.requeueTaskId || '').trim() || null;

  const [beforeLegacy] = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM candidate_sources
      WHERE platform=$1 AND last_seen_at >= ${BANGKOK_DAY_START}`,
    [platform],
  );
  const [beforeOpened] = await q<{ n: number }>(
    `SELECT COALESCE(SUM(opened_count), 0)::int AS n FROM scrape_runs
      WHERE platform=$1 AND started_at >= ${BANGKOK_DAY_START}`,
    [platform],
  );
  const [capRow] = await q<{ daily_cap: number }>(
    `SELECT daily_cap FROM provider_limits WHERE platform=$1`,
    [platform],
  );

  let reclaimed = 0;
  if (!dryRun) {
    // Roll last_seen_at back for rows touched today that are not from today's scrape runs.
    // Repair used to SET last_seen_at=now() and exhausted the legacy counter.
    const updated = await q<{ id: string }>(
      `UPDATE candidate_sources s
          SET last_seen_at = COALESCE(
                (SELECT r.finished_at FROM scrape_runs r WHERE r.id = s.run_id),
                s.first_seen_at,
                s.last_seen_at - interval '1 day'
              )
        WHERE s.platform = $1
          AND s.last_seen_at >= ${BANGKOK_DAY_START}
          AND (
            s.run_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM scrape_runs r
               WHERE r.id = s.run_id
                 AND r.started_at >= ${BANGKOK_DAY_START}
            )
          )
      RETURNING s.id`,
      [platform],
    );
    reclaimed = updated.length;
  } else {
    const [{ n }] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM candidate_sources s
        WHERE s.platform = $1
          AND s.last_seen_at >= ${BANGKOK_DAY_START}
          AND (
            s.run_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM scrape_runs r
               WHERE r.id = s.run_id
                 AND r.started_at >= ${BANGKOK_DAY_START}
            )
          )`,
      [platform],
    );
    reclaimed = n;
  }

  const [afterLegacy] = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM candidate_sources
      WHERE platform=$1 AND last_seen_at >= ${BANGKOK_DAY_START}`,
    [platform],
  );

  let requeued: { ok: boolean; taskId: string; reason?: string } | null = null;
  if (requeueTaskId && !dryRun) {
    // Clear stuck error queue rows so enqueue can insert a fresh job.
    await q(
      `UPDATE work_queue
          SET status='error',
              finished_at=COALESCE(finished_at, now()),
              last_error=COALESCE(last_error,'') || ' · replaced by quota fix requeue'
        WHERE ref_id=$1 AND type='scrape' AND status IN ('queued','error')`,
      [requeueTaskId],
    );
    await q(
      `UPDATE scrape_tasks
          SET status='queued', phase='idle', last_error=NULL, updated_at=now()
        WHERE id=$1`,
      [requeueTaskId],
    );
    const ok = await enqueueScrapeForTask(requeueTaskId);
    if (ok) kickWorker();
    const [task] = await q<{ last_error: string | null; status: string }>(
      `SELECT last_error, status FROM scrape_tasks WHERE id=$1`,
      [requeueTaskId],
    );
    requeued = {
      ok,
      taskId: requeueTaskId,
      reason: ok ? undefined : (task?.last_error || 'enqueue failed'),
    };
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    platform,
    dailyCap: capRow?.daily_cap ?? null,
    legacyUsedBefore: beforeLegacy?.n ?? 0,
    legacyUsedAfter: afterLegacy?.n ?? 0,
    openedToday: beforeOpened?.n ?? 0,
    reclaimed,
    remainingByOpened: Math.max(0, (capRow?.daily_cap ?? 0) - (beforeOpened?.n ?? 0)),
    remainingByLegacyAfter: Math.max(0, (capRow?.daily_cap ?? 0) - (afterLegacy?.n ?? 0)),
    requeued,
  });
}
