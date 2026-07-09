// Unified work-queue runner (merge phase 2, step 2).
//
// One process = one worker slot. It claims the next eligible job from work_queue
// with a PER-CONNECTOR lock (an account runs one job at a time; different accounts
// run in parallel across separate runner processes), dispatches it to a handler,
// and isolates crashes (one job failing never kills the runner or another module).
// Scale = run more runner processes / containers (pm2, docker compose scale).
//
// Only job TYPES with a registered handler are ever claimed — so `post`/`collect`
// jobs sit untouched in the queue until their handlers are wired (no accidental
// Facebook posting).
//
//   node workers/runner.js            # loop forever (daemon)
//   node workers/runner.js --once     # claim+run a single job, then exit
import os from 'node:os';
import { sleep } from '../src/config.js';
import { loadRuntime } from '../src/config.js';
import { query, closePool } from '../src/db/pool.js';
import { getConnector } from '../src/db/repositories.js';
import { runConnector } from '../src/pipeline.js';

const WORKER_ID = `${os.hostname()}#${process.pid}`;
const POLL_MS = Number.parseInt(process.env.WORKER_POLL_MS ?? '3000', 10);
const STALE_SECONDS = Number.parseInt(process.env.WORKER_STALE_SECONDS ?? '1800', 10); // 30 min

/** connector_key = '<platform>:<id>' */
function splitConnectorKey(key) {
  const i = String(key).indexOf(':');
  return { platform: key.slice(0, i), id: key.slice(i + 1) };
}

// ---- handlers: map job.type -> async (job) => result. Only these types get claimed.
const HANDLERS = {
  // Real scraper run — reuses the exact same path as tasks-worker (headful for JobBKK).
  async scrape(job) {
    const { id: connectorId } = splitConnectorKey(job.connector_key);
    const connector = await getConnector(connectorId);
    if (!connector) throw new Error(`connector not found: ${job.connector_key}`);
    const criteria = { ...(job.payload || {}) };
    const r = await runConnector(connector, criteria, loadRuntime(), { taskId: job.ref_id || null });
    if (r.status === 'failed' || r.status === 'cooldown') throw new Error(r.error || `run ${r.status}`);
    return r;
  },
  // Plumbing self-test — zero cost, no browser. Proves claim/lock/status transitions.
  async selftest(job) {
    await sleep(400);
    return { ok: true, echo: job.payload ?? null };
  },
  // NOTE: post / collect handlers intentionally NOT registered yet — those jobs stay
  // queued (never claimed) until the autopost handler is wired + tested carefully.
};

const SUPPORTED = Object.keys(HANDLERS);

/** Reclaim jobs left 'running' by a worker that died (lock older than STALE_SECONDS). */
async function recoverStale() {
  const { rowCount } = await query(
    `UPDATE work_queue SET status='queued', worker_id=NULL, locked_at=NULL,
            last_error='recovered stale lock'
      WHERE status='running' AND locked_at < now() - ($1 || ' seconds')::interval`,
    [STALE_SECONDS],
  );
  if (rowCount) console.log(`  ↻ recovered ${rowCount} stale job(s)`);
}

/**
 * Atomically claim the next runnable job:
 *  - status queued, type we can handle
 *  - respects preferred_worker pin (account -> this worker), else unpinned
 *  - the job's account (connector_key) has NO job currently running  ← per-account lock
 */
async function claimNext() {
  const { rows } = await query(
    `UPDATE work_queue SET status='running', worker_id=$1, locked_at=now(),
            started_at=COALESCE(started_at, now())
      WHERE id = (
        SELECT q.id FROM work_queue q
         WHERE q.status='queued'
           AND q.type = ANY($2)
           AND (q.preferred_worker IS NULL OR q.preferred_worker = $1)
           AND NOT EXISTS (
             SELECT 1 FROM work_queue r
              WHERE r.connector_key = q.connector_key AND r.status='running')
         ORDER BY q.priority DESC, q.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING *`,
    [WORKER_ID, SUPPORTED],
  );
  return rows[0] ?? null;
}

async function finish(id, status, error = null) {
  await query(
    `UPDATE work_queue SET status=$2, finished_at=now(), last_error=$3 WHERE id=$1`,
    [id, status, error],
  );
}

async function runOne() {
  await recoverStale();
  const job = await claimNext();
  if (!job) return false;
  console.log(`▶ [${WORKER_ID}] ${job.type} ${job.connector_key} (job ${job.id})`);
  try {
    const r = await HANDLERS[job.type](job);
    await finish(job.id, 'done');
    console.log(`  ✓ done: ${JSON.stringify(r).slice(0, 200)}`);
  } catch (e) {
    await finish(job.id, 'error', String(e?.message ?? e).slice(0, 500));
    console.error(`  ✗ error: ${e?.message ?? e}`);
  }
  return true;
}

async function main() {
  const once = process.argv.includes('--once');
  console.log(`work-queue runner up — id=${WORKER_ID} types=[${SUPPORTED}] ${once ? '(--once)' : `(poll ${POLL_MS}ms)`}`);
  if (once) {
    const did = await runOne();
    if (!did) console.log('no runnable job');
    await closePool();
    return;
  }
  let stop = false;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop = true; });
  while (!stop) {
    const did = await runOne().catch((e) => { console.error('loop error:', e.message); return false; });
    if (!did) await sleep(POLL_MS);
  }
  await closePool();
  console.log('runner stopped');
}

main().catch(async (e) => { console.error('runner fatal:', e.message); await closePool(); process.exit(1); });
