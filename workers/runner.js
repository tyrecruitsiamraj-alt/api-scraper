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
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sleep } from '../src/config.js';
import { loadRuntime } from '../src/config.js';
import { query, closePool } from '../src/db/pool.js';
import { getConnector, getTaskById, recoverStaleRunningTasks } from '../src/db/repositories.js';
import { runConnector } from '../src/pipeline.js';
import { runTask } from '../src/tasks-worker.js';
import { generateDraftForCampaign } from '../src/core/orchestrator-draft.js';
import { measureCampaign } from '../src/core/orchestrator-measure.js';
import { sendAlert } from '../src/core/alert.js';
import { classifyScrapeTaskResult, requireSuccessfulScrapeTaskResult } from '../src/core/scrape-task-result.js';
import { imageGenerationCapability } from '../src/core/ai-image.js';

const WORKER_NAME = os.hostname();
const WORKER_ID = `${WORKER_NAME}#${process.pid}`;
const WORKER_SOURCE_SHA = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
const WORKER_BUILD_SHA = String(process.env.WORKER_BUILD_SHA || '').trim() || WORKER_SOURCE_SHA;
const CONTENT_PIPELINE_RELEASE = 'evidence-v1';
const POLL_MS = Number.parseInt(process.env.WORKER_POLL_MS ?? '3000', 10);
const STALE_SECONDS = Number.parseInt(process.env.WORKER_STALE_SECONDS ?? '1800', 10); // 30 min
const LEASE_HEARTBEAT_MS = Number.parseInt(process.env.WORKER_LEASE_HEARTBEAT_MS ?? '30000', 10);
const RETRY_BASE_SECONDS = Number.parseInt(process.env.WORKER_RETRY_BASE_SECONDS ?? '30', 10);
const MEASURE_RETRY_MINUTES = Number.parseInt(process.env.MEASURE_RETRY_MINUTES ?? '30', 10);
const MEASURE_MAX_CHECKS = Number.parseInt(process.env.MEASURE_MAX_CHECKS ?? '96', 10);
// The pool intentionally starts multiple runner slots. A single global lock
// made those slots kill/restart one another forever. Keep one lock per slot;
// separate pool launchers still collide on the same slot names and fail safe.
const PROCESS_SLOT = String(process.env.WORKER_NAME || 'standalone')
  .replace(/[^A-Za-z0-9._-]+/g, '-')
  .slice(0, 80) || 'standalone';
const PROCESS_LOCK_PATH = resolve(process.cwd(), 'output', `runner-${PROCESS_SLOT}.lock`);
const PROCESS_LOCK_STALE_MS = 60_000;
let ownsProcessLock = false;

function touchProcessLock() {
  if (!ownsProcessLock) return;
  try {
    const now = new Date();
    utimesSync(PROCESS_LOCK_PATH, now, now);
  } catch { /* the DB lease remains the source of truth for individual jobs */ }
}

function acquireProcessLock() {
  mkdirSync(dirname(PROCESS_LOCK_PATH), { recursive: true });
  if (existsSync(PROCESS_LOCK_PATH)) {
    try {
      if (Date.now() - statSync(PROCESS_LOCK_PATH).mtimeMs < PROCESS_LOCK_STALE_MS) return false;
      unlinkSync(PROCESS_LOCK_PATH);
    } catch { return false; }
  }
  try {
    const fd = openSync(PROCESS_LOCK_PATH, 'wx');
    writeFileSync(fd, `${process.pid} ${new Date().toISOString()}`);
    closeSync(fd);
    ownsProcessLock = true;
    return true;
  } catch {
    return false;
  }
}

function releaseProcessLock() {
  if (!ownsProcessLock) return;
  ownsProcessLock = false;
  try { unlinkSync(PROCESS_LOCK_PATH); } catch { /* ignore */ }
}

// ---- heartbeat: บอกเว็บว่าเครื่องนี้ยังมีชีวิต (ตาราง workers, schema-011) ----
// key = hostname (ไม่มี pid) — pool หลาย process บนเครื่องเดียวกันแชร์แถวเดียว
// fail-soft: heartbeat พังห้ามทำให้ runner หยุด (แค่ log)
const HEARTBEAT_MS = 15_000;
let lastBeat = 0;
async function heartbeat() {
  if (process.argv.includes('--selftest')) return; // งานทดสอบต้องไม่เขียนทับ heartbeat ของ worker จริงบนเครื่องเดียวกัน
  touchProcessLock();
  if (Date.now() - lastBeat < HEARTBEAT_MS) return;
  lastBeat = Date.now();
  try {
    await query(
      `INSERT INTO workers (name, kind, last_seen, meta)
       VALUES ($1, 'scraper', now(), $2::jsonb)
       ON CONFLICT (name) DO UPDATE SET last_seen = now(), meta = EXCLUDED.meta`,
      [os.hostname(), JSON.stringify({ pid: process.pid, build_sha: WORKER_BUILD_SHA, source_sha: WORKER_SOURCE_SHA, content_pipeline: CONTENT_PIPELINE_RELEASE, types: SUPPORTED, image_generation: imageGenerationCapability() })],
    );
  } catch (e) {
    console.warn(`  [heartbeat] เขียนไม่ได้: ${e.message}`);
  }
}

/** connector_key = '<platform>:<id>' */
function splitConnectorKey(key) {
  const i = String(key).indexOf(':');
  return { platform: key.slice(0, i), id: key.slice(i + 1) };
}

// ---- handlers: map job.type -> async (job) => result. Only these types get claimed.
const HANDLERS = {
  // Real scraper run (headful for JobBKK). If the job references a scrape_task
  // (ref_id), run the FULL task pipeline (scrape → OCR → enrich) via the same
  // runTask the tasks-worker uses, so the web UI's task status/progress keeps
  // working. Otherwise run the connector directly (ad-hoc scrape into the DB).
  async scrape(job) {
    const runtime = loadRuntime();
    if (job.ref_id) {
      const task = await getTaskById(job.ref_id);
      if (!task) throw new Error(`scrape_task not found: ${job.ref_id}`);
      const result = await runTask(task, runtime); // manages task status + OCR + enrich itself
      return requireSuccessfulScrapeTaskResult(result);
    }
    const { id: connectorId } = splitConnectorKey(job.connector_key);
    const connector = await getConnector(connectorId);
    if (!connector) throw new Error(`connector not found: ${job.connector_key}`);
    const r = await runConnector(connector, { ...(job.payload || {}) }, runtime, {});
    if (r.status === 'failed' || r.status === 'cooldown') throw new Error(r.error || `run ${r.status}`);
    return r;
  },
  // Content Orchestrator draft: AI คิด caption + รูป + brief สำหรับ 1 campaign
  // (ใบขอที่หาคนไม่ได้) → เก็บ campaign_contents (draft) → campaign 'pending_approval'.
  // ไม่ต้องใช้ browser (แค่เรียก API Claude/OpenAI) — connector_key = 'orchestrator:<campaignId>'
  // ทำให้ campaign เดียวกันมี draft job วิ่งทีละงาน (per-campaign lock).
  async draft(job) {
    if (!job.ref_id) throw new Error('draft job missing ref_id (campaign id)');
    return generateDraftForCampaign(job.ref_id);
  },
  // Content Orchestrator วัดผล (เฟส 4): อ่าน engagement จาก post_logs → verdict →
  // regen (คนสนใจน้อย) / บันทึกแนวที่เวิร์ค (เยอะ). ไม่ต้อง browser (อ่าน DB).
  async measure(job) {
    if (!job.ref_id) throw new Error('measure job missing ref_id (campaign id)');
    return measureCampaign(job.ref_id);
  },
  // Plumbing self-test — zero cost, no browser. Proves claim/lock/status transitions.
  async selftest(job) {
    await sleep(400);
    return { ok: true, echo: job.payload ?? null };
  },
  // NOTE: post / collect handlers intentionally NOT registered yet — those jobs stay
  // queued (never claimed) until the autopost handler is wired + tested carefully.
};

// --selftest จำกัด worker ให้รับเฉพาะงานทดสอบ ป้องกันการแตะงานจริงที่กำลังรออยู่.
const SUPPORTED = process.argv.includes('--selftest') ? ['selftest'] : Object.keys(HANDLERS);

/** Reclaim jobs left 'running' by a worker that died (lock older than STALE_SECONDS). */
async function recoverStale() {
  const { rowCount } = await query(
    `UPDATE work_queue SET status='queued', worker_id=NULL, locked_at=NULL,
            last_error='recovered stale lock'
      WHERE status='running' AND locked_at < now() - ($1 || ' seconds')::interval`,
    [STALE_SECONDS],
  );
  if (rowCount) console.log(`  ↻ recovered ${rowCount} stale job(s)`);
  const recoveredTasks = await recoverStaleRunningTasks(10);
  for (const task of recoveredTasks) console.log(`  ↻ recovered stale scrape task: ${task.name}`);
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
           AND q.available_at <= now()
           AND (q.preferred_worker IS NULL OR q.preferred_worker = $3)
           AND NOT EXISTS (
             SELECT 1 FROM work_queue r
              WHERE r.connector_key = q.connector_key AND r.status='running')
         ORDER BY q.priority DESC, q.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING *`,
    [WORKER_ID, SUPPORTED, WORKER_NAME],
  );
  return rows[0] ?? null;
}

async function finish(id, status, error = null) {
  const { rowCount } = await query(
    `UPDATE work_queue
        SET status=$2, finished_at=now(), last_error=$3, locked_at=NULL
      WHERE id=$1 AND worker_id=$4 AND status='running'`,
    [id, status, error, WORKER_ID],
  );
  if (!rowCount) throw new Error(`queue lease lost before finish: ${id}`);
}

async function renewLease(id) {
  touchProcessLock();
  const { rowCount } = await query(
    `UPDATE work_queue SET locked_at=now()
      WHERE id=$1 AND worker_id=$2 AND status='running'`,
    [id, WORKER_ID],
  );
  if (!rowCount) throw new Error(`queue lease lost: ${id}`);
}

async function runWithLease(job, handler) {
  let leaseError = null;
  const timer = setInterval(() => {
    void renewLease(job.id).catch((e) => { leaseError = e; });
  }, Math.max(5_000, LEASE_HEARTBEAT_MS));
  timer.unref?.();
  try {
    const result = await handler(job);
    if (leaseError) throw leaseError;
    return result;
  } finally {
    clearInterval(timer);
  }
}

async function retryOrFail(job, error) {
  const attempts = Number(job.attempts || 0) + 1;
  const maxAttempts = Math.max(1, Number(job.max_attempts || 3));
  if (attempts >= maxAttempts) {
    await query(
      `UPDATE work_queue
          SET status='error', attempts=$3, finished_at=now(), last_error=$4, locked_at=NULL
        WHERE id=$1 AND worker_id=$2 AND status='running'`,
      [job.id, WORKER_ID, attempts, error],
    );
    return false;
  }
  const delaySeconds = RETRY_BASE_SECONDS * (2 ** (attempts - 1));
  await query(
    `UPDATE work_queue
        SET status='queued', attempts=$3, worker_id=NULL, locked_at=NULL,
            available_at=now() + ($4 || ' seconds')::interval, last_error=$5
      WHERE id=$1 AND worker_id=$2 AND status='running'`,
    [job.id, WORKER_ID, attempts, String(delaySeconds), error],
  );
  return true;
}

async function reschedulePendingMeasurement(job) {
  const payload = { ...(job.payload || {}) };
  const checks = Number(payload.measure_checks || 0) + 1;
  if (checks >= MEASURE_MAX_CHECKS) {
    await query(
      `UPDATE recruit_campaigns
          SET status_note=$2, updated_at=now()
        WHERE id=$1 AND status='measuring'`,
      [job.ref_id, 'ยังมีข้อมูลไม่พอสำหรับสรุปผล กรุณาตรวจสอบการเก็บคอมเมนต์'],
    );
    await finish(job.id, 'error', 'measurement timed out waiting for collected results');
    return false;
  }
  payload.measure_checks = checks;
  await query(
    `UPDATE work_queue
        SET status='queued', worker_id=NULL, locked_at=NULL, payload=$3::jsonb,
            available_at=now() + ($4 || ' minutes')::interval, last_error=NULL
      WHERE id=$1 AND worker_id=$2 AND status='running'`,
    [job.id, WORKER_ID, JSON.stringify(payload), String(MEASURE_RETRY_MINUTES)],
  );
  return true;
}

async function runOne() {
  await heartbeat();
  await recoverStale();
  const job = await claimNext();
  if (!job) return false;
  console.log(`▶ [${WORKER_ID}] ${job.type} ${job.connector_key} (job ${job.id})`);
  try {
    const r = await runWithLease(job, HANDLERS[job.type]);
    if (job.type === 'measure' && r?.verdict === 'pending') {
      const scheduled = await reschedulePendingMeasurement(job);
      console.log(scheduled
        ? `  ↻ waiting for results; checking again in ${MEASURE_RETRY_MINUTES} minute(s)`
        : '  ✗ measurement stopped after reaching its waiting limit');
      return true;
    }
    const outcome = job.type === 'scrape' ? classifyScrapeTaskResult(r) : 'completed';
    // partial เป็นผลลัพธ์ terminal ที่ระบบทำงานจบแต่ตลาดให้คนไม่ครบ ไม่ใช่ done
    // และไม่ใช่ infrastructure error ที่ควร retry แบบเดิมซ้ำ ๆ.
    await finish(job.id, outcome === 'market_insufficient' ? 'partial' : 'done');
    console.log(`  ✓ done: ${JSON.stringify(r).slice(0, 200)}`);
  } catch (e) {
    const errMsg = String(e?.message ?? e).slice(0, 500);
    const retrying = await retryOrFail(job, errMsg);
    console.error(`  ✗ ${retrying ? 'retry scheduled' : 'error'}: ${e?.message ?? e}`);
    // แจ้งเตือนทันทีที่งานพัง (fail-soft — ไม่มี ALERT_WEBHOOK_URL = เงียบ)
    if (!retrying) {
      await sendAlert(`งาน ${job.type} ไม่สำเร็จบนเครื่อง ${WORKER_NAME}\nงาน: ${job.connector_key}\nสาเหตุ: ${errMsg}`);
    }
  }
  return true;
}

async function main() {
  const once = process.argv.includes('--once') || process.argv.includes('--selftest');
  const drain = process.argv.includes('--drain');
  const mode = once ? '--once' : drain ? '--drain' : `poll ${POLL_MS}ms`;
  if (!once && !drain && !acquireProcessLock()) {
    console.log('work-queue runner already active — exit');
    await closePool();
    return;
  }
  console.log(`work-queue runner up — id=${WORKER_ID} types=[${SUPPORTED}] (${mode})`);
  if (once) {
    const did = await runOne();
    if (!did) console.log('no runnable job');
    await closePool();
    return;
  }
  // --drain: process everything currently runnable, then exit (used by the web's
  // kickWorker for "run now" without needing a persistent worker pool).
  if (drain) {
    let n = 0;
    while (await runOne()) n += 1;
    console.log(`drained ${n} job(s)`);
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
  releaseProcessLock();
  console.log('runner stopped');
}

main().catch(async (e) => {
  console.error('runner fatal:', e.message);
  releaseProcessLock();
  await closePool();
  process.exit(1);
});
