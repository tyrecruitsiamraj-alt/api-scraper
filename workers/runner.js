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
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sleep } from '../src/config.js';
import { loadRuntime } from '../src/config.js';
import { query, closePool, getPool, withTransaction } from '../src/db/pool.js';
import { decryptSecret } from '../src/db/crypto.js';
import { syncJarvisPostOrders } from '../src/core/jarvis-post-sync.js';
import { JARVIS_BASE_DEFAULT, loadJarvisLeadsKey, sendCommentLeadsToJarvis } from '../src/core/jarvis-comment-leads.js';
import {
  countScrapedToday,
  fillCandidateContacts,
  finishRun,
  getConnector,
  getProviderCap,
  getTaskById,
  platformScrapedToday,
  recoverStaleRunningTasks,
  saveConnectorSession,
  startRun,
  touchRun,
} from '../src/db/repositories.js';
import { refreshJobthaiContacts } from '../src/core/jobthai-contact-refresh.js';
import { runConnector } from '../src/pipeline.js';
import { ocrBacklog, runTask } from '../src/tasks-worker.js';
import { aiStatus } from '../src/core/ai-models.js';
import { generateDraftForCampaign, regenerateImageForContent } from '../src/core/orchestrator-draft.js';
import { measureCampaign } from '../src/core/orchestrator-measure.js';
import { processResumeBatch } from '../src/db/resume-uploads.js';
import { sendAlert } from '../src/core/alert.js';
import { CLOSE_JARVIS_SCRAPE_SQL, CLOSED_JARVIS_RESULTS_SQL, FINISHED_JARVIS_SCRAPES_SQL, REFRESH_JARVIS_RESULT_SQL, REJECT_JARVIS_SCRAPE_SQL, REQUEUE_STUCK_SCRAPE_SQL, STUCK_JARVIS_SCRAPES_SQL, WAIT_JARVIS_SCRAPE_SQL, refreshedJarvisResult, rejectJarvisScrapeParams, scrapeOutcome, stuckScrapeAction } from '../src/core/jarvis-scrape-status.js';
import { classifyScrapeTaskResult, cooldownError, isNetworkError, networkRetryAt, offlineWaitExpired, requireSuccessfulScrapeTaskResult } from '../src/core/scrape-task-result.js';
import { imageGenerationCapability } from '../src/core/ai-image.js';
import { scraperSlotLockName } from '../src/core/worker-selection.js';

// ชื่อ Worker ต้องตรงกับ preferred_worker ใน Queue. เดิม heartbeat ใช้ hostname
// เสมอ แม้ launcher ตั้ง WORKER_NAME คนละ slot ทำให้หลาย process ทับสถานะกัน.
const WORKER_NAME = String(process.env.WORKER_NAME || os.hostname()).trim() || os.hostname();
const WORKER_ID = `${WORKER_NAME}#${process.pid}`;
const WORKER_SOURCE_SHA = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
// รุ่นโค้ดที่อยู่บนดิสก์จริงชนะค่าที่ตัวเปิดตั้งไว้: อัปเดตจากเว็บ (update_code) เปลี่ยนโค้ดแล้วเปิด runner ใหม่
// แต่ env ยังเป็นรุ่นตอนเปิดเครื่อง เว็บจึงขึ้น "ยังไม่อัปเดต" ทั้งที่อัปเดตแล้ว
const WORKER_BUILD_SHA = WORKER_SOURCE_SHA !== 'unknown'
  ? WORKER_SOURCE_SHA
  : String(process.env.WORKER_BUILD_SHA || '').trim() || WORKER_SOURCE_SHA;
const CONTENT_PIPELINE_RELEASE = 'evidence-v1';
const POLL_MS = Number.parseInt(process.env.WORKER_POLL_MS ?? '3000', 10);
// ทุก handler ต่ออายุ lease ทุก 30 วินาทีอยู่แล้ว. ถ้า lock ไม่ขยับเกิน 2 นาที
// แปลว่า process หายจริงในทางปฏิบัติ; 30 นาทีเดิมทำให้หน้าจอค้าง "กำลังทำ"
// นานเกินกว่าจะใช้จริงหลัง Worker ถูกปิด/รีสตาร์ต.
const STALE_SECONDS = Number.parseInt(process.env.WORKER_STALE_SECONDS ?? '120', 10);
const LEASE_HEARTBEAT_MS = Number.parseInt(process.env.WORKER_LEASE_HEARTBEAT_MS ?? '30000', 10);
const RETRY_BASE_SECONDS = Number.parseInt(process.env.WORKER_RETRY_BASE_SECONDS ?? '30', 10);
const MEASURE_RETRY_MINUTES = Number.parseInt(process.env.MEASURE_RETRY_MINUTES ?? '30', 10);
const MEASURE_MAX_CHECKS = Number.parseInt(process.env.MEASURE_MAX_CHECKS ?? '96', 10);
// The pool intentionally starts multiple runner slots. A single global lock
// made those slots kill/restart one another forever. Keep one lock per slot;
// separate pool launchers still collide on the same slot names and fail safe.
const PROCESS_SLOT = scraperSlotLockName(process.env.WORKER_NAME);
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

// ตัวเฝ้าบนแผงสวิตช์ดูเวลาไฟล์นี้ — คุยกับฐานไม่ได้เกิน 10 นาที = ปิดเปิด Scrap ใหม่ (ตั้ง WORKER_ALIVE_DIR ใน launcher)
function markAlive() {
  const dir = process.env.WORKER_ALIVE_DIR;
  if (!dir) return;
  try { writeFileSync(resolve(dir, 'alive-scrape.txt'), new Date().toISOString()); } catch { /* ตัวเฝ้าเห็นว่าเงียบเอง */ }
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
    const meta = {
      pid: process.pid,
      worker_id: WORKER_ID,
      build_sha: WORKER_BUILD_SHA,
      source_sha: WORKER_SOURCE_SHA,
      machine_name: os.hostname(),
      platform: process.platform, // เว็บใช้ตัดสินว่าสั่งอัปเดตครั้งเดียวต่อเครื่อง (Mac) หรือทุก slot
      content_pipeline: CONTENT_PIPELINE_RELEASE,
      types: SUPPORTED,
      image_generation: imageGenerationCapability(),
      ai: await aiStatus().catch(() => null), // หน้าเว็บบอกได้ว่าแปลงเนื้องาน/อ่านไฟล์แนบใช้ได้ไหม
    };
    await query(
      `INSERT INTO workers (name, kind, last_seen, meta)
       VALUES ($1, 'scraper', now(), $2::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         last_seen = now(),
         meta = EXCLUDED.meta || jsonb_build_object(
           'processes',
           COALESCE(workers.meta->'processes', '{}'::jsonb) ||
           jsonb_build_object($3::text, jsonb_build_object('worker_id', $4::text, 'last_seen', now()))
         )`,
      [WORKER_NAME, JSON.stringify(meta), String(process.pid), WORKER_ID],
    );
    markAlive();
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
    if (r.status === 'cooldown' && r.cooldownUntil) throw cooldownError(r.error || 'connector cooling down', r.cooldownUntil);
    if (r.status === 'failed' || r.status === 'cooldown') throw new Error(r.error || `run ${r.status}`);
    return r;
  },
  // ดึงเบอร์คืนให้ผู้สมัคร JobThai ที่ค้าง "ต้องตรวจเพิ่ม" เพราะไม่มีช่องทางติดต่อ (24 พ.ย. 2569)
  // connector_key = 'jobthai:<connectorId>' — ล็อกบัญชีเดียวกับงานค้น ไม่รันซ้อนกัน · payload.externalIds = รหัสเรซูเม่
  async contact_refresh(job) {
    const { platform, id: connectorId } = splitConnectorKey(job.connector_key);
    if (platform !== 'jobthai') throw new Error(`contact_refresh รองรับเฉพาะ JobThai (ได้ ${platform})`);
    const connector = await getConnector(connectorId);
    if (!connector) throw new Error(`connector not found: ${job.connector_key}`);
    const ids = Array.isArray(job.payload?.externalIds) ? job.payload.externalIds.map(String) : [];
    return refreshJobthaiContacts(connector, ids, {
      query, runtime: loadRuntime(), fillCandidateContacts, startRun, finishRun, touchRun, saveConnectorSession,
      countScrapedToday, getProviderCap, platformScrapedToday,
    });
  },
  // Content Orchestrator draft: AI คิด caption + รูป + brief สำหรับ 1 campaign
  // (ใบขอที่หาคนไม่ได้) → เก็บ campaign_contents (draft) → campaign 'pending_approval'.
  // ไม่ต้องใช้ browser (แค่เรียก API Claude/OpenAI) — connector_key = 'orchestrator:<campaignId>'
  // ทำให้ campaign เดียวกันมี draft job วิ่งทีละงาน (per-campaign lock).
  async draft(job) {
    if (!job.ref_id) throw new Error('draft job missing ref_id (campaign id)');
    return generateDraftForCampaign(job.ref_id);
  },
  // เปลี่ยนเฉพาะภาพคน/ฉากของร่างเดิม โดยคง Caption และ Text/Logo Layer ไว้
  // งานนี้ไม่เกี่ยวกับ Facebook และไม่สร้าง campaign/content ซ้ำ.
  async regenerate_image(job) {
    if (!job.ref_id) throw new Error('regenerate_image job missing ref_id (content id)');
    return regenerateImageForContent(job.ref_id);
  },
  // Content Orchestrator วัดผล (เฟส 4): อ่าน engagement จาก post_logs → verdict →
  // regen (คนสนใจน้อย) / บันทึกแนวที่เวิร์ค (เยอะ). ไม่ต้อง browser (อ่าน DB).
  async measure(job) {
    if (!job.ref_id) throw new Error('measure job missing ref_id (campaign id)');
    return measureCampaign(job.ref_id);
  },
  // อัปโหลดเรซูเม่ (หน้าผู้สมัคร): อ่านไฟล์ → AI ของบริษัทแยกช่อง → บันทึกคนใหม่ / รอเลือกช่องถ้ามีคนนี้แล้ว
  // ไม่ใช้ browser · connector_key = 'upload:<batchId>' หนึ่งรอบอัปโหลดทำทีละงาน
  async resume_upload(job) {
    if (!job.ref_id) throw new Error('resume_upload job missing ref_id (batch id)');
    return processResumeBatch(job.ref_id);
  },
  // Plumbing self-test — zero cost, no browser. Proves claim/lock/status transitions.
  async selftest(job) {
    await sleep(400);
    return { ok: true, echo: job.payload ?? null };
  },
  // Remote Update Code: git reset to origin/main then exit so scraper-pool respawns
  // with the new runner.js from disk. Enqueued via POST /api/update-workers.
  async update_code(job) {
    const cwd = process.cwd();
    const run = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const macLib = resolve(cwd, 'scripts', 'so-worker-mac-lib.sh');
    if (process.platform === 'darwin' && existsSync(macLib)) {
      // Mac: ให้แผงสวิตช์อัปเดตทั้งเครื่อง (ปิด Scrap + Autopost → ดึงโค้ด → เปิดตัวที่เคยเปิดกลับ).
      // รอ 5 วินาทีให้งานนี้ปิดก่อน และแยก process ออกไปให้ launchd ดูแล ไม่งั้นโดนปิดตามตอนปิด Scrap
      const log = resolve(cwd, '.run', 'remote-update.log');
      mkdirSync(dirname(log), { recursive: true });
      const script = `sleep 5; date; /bin/bash ${JSON.stringify(macLib)} update`;
      spawn('/bin/bash', ['-c', `nohup /bin/bash -c ${JSON.stringify(script)} >> ${JSON.stringify(log)} 2>&1 &`], {
        cwd,
        detached: true,
        stdio: 'ignore',
      }).unref();
      return { ok: true, sha: 'pending', whole_machine: true };
    }
    run(['fetch', 'origin', 'main']);
    try { run(['checkout', '-B', 'main', 'origin/main']); } catch { /* reset below */ }
    run(['reset', '--hard', 'origin/main']);
    const sha = run(['rev-parse', '--short', 'HEAD']);
    const restart = job?.payload?.restart !== false;
    if (restart) {
      // Finish the job first; exit after reply so pool launches a fresh process.
      setTimeout(() => {
        try { releaseProcessLock(); } catch { /* ignore */ }
        process.exit(0);
      }, 800);
    }
    return { ok: true, sha, restart };
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
  const recoveredTasks = await recoverStaleRunningTasks(10, { requeue: false });
  for (const task of recoveredTasks) console.log(`  ↻ recovered stale scrape task: ${task.name}`);
}

/**
 * Atomically claim the next runnable job:
 *  - status queued, type we can handle
 *  - respects preferred_worker pin (account -> this worker), else unpinned
 *  - the job's account (connector_key) has NO job currently running  ← per-account lock
 */
async function claimNext() {
  const machineName = os.hostname();
  const { rows } = await query(
    `UPDATE work_queue SET status='running', worker_id=$1, locked_at=now(),
            started_at=COALESCE(started_at, now())
      WHERE id = (
        SELECT q.id FROM work_queue q
         WHERE q.status='queued'
           AND q.type = ANY($2)
           AND q.available_at <= now()
           AND (
             q.preferred_worker IS NULL
             OR q.preferred_worker = $3
             OR lower(q.preferred_worker) = lower($4)
           )
           AND NOT EXISTS (
             SELECT 1 FROM work_queue r
              WHERE r.connector_key = q.connector_key AND r.status='running')
           -- บัญชีเว็บหางานเดียวกันห้ามรันซ้อน (JobBKK ให้ล็อกอินที่เดียว) — ดูจากงาน Scrap ที่รันอยู่จริงด้วย
           -- เพราะคิวอาจหลุดล็อกระหว่างงานยังวิ่ง (เจอ 30 ต.ค. 2569: 2 งานรันบัญชีเดียวกันพร้อมกัน)
           AND NOT EXISTS (
             SELECT 1 FROM scrape_tasks rt
              WHERE q.type = 'scrape'
                AND rt.connector_id::text = split_part(q.connector_key, ':', 2)
                AND rt.status = 'running'
                AND rt.updated_at > now() - interval '10 minutes'
                AND rt.id::text <> COALESCE(q.ref_id, ''))
           -- งานที่คนกดปิดแล้ว ห้ามเริ่ม
           AND NOT EXISTS (
             SELECT 1 FROM scrape_tasks st
              WHERE q.type = 'scrape' AND st.id::text = q.ref_id AND st.enabled = false)
         ORDER BY q.priority DESC, q.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1)
      RETURNING *`,
    [WORKER_ID, SUPPORTED, WORKER_NAME, machineName],
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
  markAlive();
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

async function retryOrFail(job, error, retryAt = null, { waiting = false, final = false } = {}) {
  // รอโควต้าวันถัดไป (waiting) ไม่ใช่งานล้ม: เข้าคิวรอถึงเวลานั้นโดยไม่นับรอบลองใหม่ และไม่ตีกลับใบใน Jarvis
  // 20 พ.ย. 2569: โควต้าเต็มแล้วลองซ้ำ 3 รอบทุกใบ (688 แถวเปล่า) แล้วตีกลับ 229 คำสั่ง
  if (waiting && retryAt) {
    const waitSeconds = Math.max(60, Math.ceil((retryAt.getTime() - Date.now()) / 1000));
    await query(
      `UPDATE work_queue
          SET status='queued', worker_id=NULL, locked_at=NULL,
              available_at=now() + ($3 || ' seconds')::interval, last_error=$4
        WHERE id=$1 AND worker_id=$2 AND status='running'`,
      [job.id, WORKER_ID, String(waitSeconds), error],
    );
    if (job.type === 'scrape' && job.ref_id) {
      await query(WAIT_JARVIS_SCRAPE_SQL, [String(job.ref_id), error.slice(0, 500)]).catch((e) => console.warn(`  จดเหตุรอคิวลง Jarvis ไม่ได้: ${e.message}`));
    }
    return true;
  }
  const maxAttempts = Math.max(1, Number(job.max_attempts || 3));
  // final = ลองซ้ำไม่มีประโยชน์ (เช่น โควต้าค้นหาวันนี้เต็ม) → จบคิวและตีกลับ Jarvis ทันที
  const attempts = final ? Math.max(maxAttempts, Number(job.attempts || 0) + 1) : Number(job.attempts || 0) + 1;
  if (attempts >= maxAttempts) {
    await query(
      `UPDATE work_queue
          SET status='error', attempts=$3, finished_at=now(), last_error=$4, locked_at=NULL
        WHERE id=$1 AND worker_id=$2 AND status='running'`,
      [job.id, WORKER_ID, attempts, error],
    );
    // Queue จบด้วย error แต่ campaign ค้างคำว่า "กำลังทำ" ทำให้หน้า Web ไม่มี
    // ปุ่มลองใหม่และผู้ใช้ต้องมาบอกผ่านแชต. เปลี่ยนเฉพาะ draft ที่ lease นี้ถืออยู่
    // เพื่อให้ Action Center อธิบายสาเหตุและเปิด retry ตามเส้นทางปกติ.
    if (job.type === 'draft' && job.ref_id) {
      await query(
        `UPDATE recruit_campaigns
            SET status='draft_error', status_note=$2, updated_at=now()
          WHERE id=$1 AND status IN ('researching','drafting')`,
        [job.ref_id, `สร้างสื่อไม่สำเร็จ: ${error}`.slice(0, 520)],
      );
    }
    // งาน Scrap จาก Jarvis ล้มจนหมดรอบ: บอก Jarvis ว่าไม่สำเร็จ ไม่ปล่อยค้าง "กำลังทำ" (Jarvis เปิดปุ่มสั่งใหม่ให้)
    if (job.type === 'scrape' && job.ref_id) {
      try {
        const { rows } = await query(REJECT_JARVIS_SCRAPE_SQL, rejectJarvisScrapeParams(job.ref_id, error));
        if (rows?.length) console.log(`  ↩ Jarvis ${rows[0].request_no}: ไม่สำเร็จ`);
      } catch (e) {
        console.warn(`  เขียนสถานะไม่สำเร็จกลับ Jarvis ไม่ได้: ${e.message}`);
      }
    }
    return false;
  }
  // บัญชีถูกพัก: รอจนพ้นเวลาพัก (+1 นาที) แทน backoff ปกติ — ล็อกอินระหว่างพักเสี่ยงโดนแบน
  const delaySeconds = retryAt
    ? Math.max(60, Math.ceil((retryAt.getTime() - Date.now()) / 1000) + 60)
    : RETRY_BASE_SECONDS * (2 ** (attempts - 1));
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

// Jarvis ไม่ถามสถานะเอง — เครื่องนี้เปลี่ยนสถานะใบสั่งโพสต์และใบ Scrap ที่จบแล้วให้ทุก 5 นาที
// (หลาย runner ในเครื่อง/หลายเครื่อง ใช้ advisory lock ให้ทำทีละตัว)
const JARVIS_SYNC_MS = 5 * 60 * 1000;
let lastJarvisSync = 0;
// งาน Scrap จาก Jarvis ที่ค้นจบแล้ว → ปิดใบใน Jarvis ตามผลจริง เสร็จ / เจอบางส่วน / ไม่สำเร็จ (ไม่ต้องรอคนตรวจรับ)
async function completeJarvisScrapes() {
  try {
    const { rows } = await query(FINISHED_JARVIS_SCRAPES_SQL);
    for (const row of rows) {
      const out = scrapeOutcome(row);
      const done = await query(CLOSE_JARVIS_SCRAPE_SQL, [row.request_no, out.status, out.notes]);
      if (done.rows?.length) console.log(`  ✓ Jarvis ${row.request_no}: ${out.label} (${out.notes})`);
    }
  } catch (e) {
    console.warn(`  เขียนผล Scrap กลับ Jarvis ไม่ได้: ${e?.message ?? e}`);
  }
}

// ใบ Scrap ที่ Jarvis ยัง "กำลังทำ" แต่ไม่มีงานค้นในคิว → ส่งเข้าคิวให้เอง 1 ครั้ง ค้างซ้ำ = ตีกลับพร้อมเหตุ (เจ้าของ 26 พ.ย. 2569)
async function recoverStuckJarvisScrapes() {
  try {
    await withTransaction(async (client) => {
      const lock = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext('jarvis-stuck-scrapes')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      const { rows } = await client.query(STUCK_JARVIS_SCRAPES_SQL);
      for (const row of rows) {
        const plan = stuckScrapeAction(row);
        if (plan.action === 'requeue') {
          const ins = await client.query(REQUEUE_STUCK_SCRAPE_SQL, plan.params);
          if (!ins.rows[0]) continue;
          await client.query(`UPDATE scrape_tasks SET status='queued', phase='idle', last_error=$2, updated_at=now() WHERE id=$1 AND status <> 'running'`, [row.task_id, plan.notes]);
          await client.query(WAIT_JARVIS_SCRAPE_SQL, [row.task_id, plan.notes]);
          console.log(`  ↻ Jarvis ${row.request_no}: งานค้นหลุดจากคิว ส่งค้นใหม่ให้แล้ว`);
        } else {
          await client.query(REJECT_JARVIS_SCRAPE_SQL, [row.task_id, plan.notes]);
          console.log(`  ✗ Jarvis ${row.request_no}: ${plan.notes}`);
        }
      }
    });
  } catch (e) {
    console.warn(`  กู้ใบ Scrap ที่ค้างใน Jarvis ไม่ได้: ${e?.message ?? e}`);
  }
}

// ใบ Scrap ที่ปิดแล้ว: ผลในใบ Jarvis ต้องตรงกับจำนวนจริงเสมอ จำนวนเปลี่ยนทีหลังก็เขียนใหม่ (เจ้าของ 26 พ.ย. 2569)
async function refreshJarvisResults() {
  try {
    const { rows } = await query(CLOSED_JARVIS_RESULTS_SQL);
    for (const row of rows) {
      const out = refreshedJarvisResult(row);
      if (!out) continue;
      const done = await query(REFRESH_JARVIS_RESULT_SQL, [row.req_id, out.status, out.notes, row.notes]);
      if (done.rows?.length) console.log(`  ↻ Jarvis ${row.request_no}: ${row.notes} → ${out.notes}`);
    }
  } catch (e) {
    console.warn(`  อัปเดตผล Scrap ใน Jarvis ให้ตรงจำนวนจริงไม่ได้: ${e?.message ?? e}`);
  }
}

async function syncJarvisIfDue() {
  if (Date.now() - lastJarvisSync < JARVIS_SYNC_MS) return;
  lastJarvisSync = Date.now();
  await completeJarvisScrapes();
  await recoverStuckJarvisScrapes();
  await refreshJarvisResults();
  try {
    await withTransaction(async (client) => {
      const lock = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext('jarvis-post-sync')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      const r = await syncJarvisPostOrders((sql, params) => client.query(sql, params).then((x) => x.rows), {
        autopostSchema: process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper',
      });
      if (r.posted.length || r.rejected.length) {
        console.log(`  Jarvis: โพสต์แล้ว ${r.posted.join(', ') || '-'} · ตีกลับ ${r.rejected.join(', ') || '-'}`);
      }
    });
  } catch (e) {
    console.warn(`  Jarvis: อัปเดตสถานะใบสั่งโพสต์ไม่สำเร็จ — ${e?.message ?? e}`);
  }
}

// คนคอมเมนต์ทิ้งเบอร์ → Jarvis ทุก 5 นาที (เจ้าของ 26 พ.ย. 2569) · ทำเบื้องหลัง · สองช่องบนเครื่องเดียวกันส่งทีละช่อง (advisory lock)
// ล็อกแบบ session บน connection ว่าง (ไม่เปิด transaction ค้างระหว่างรอ Jarvis ตอบ)
const COMMENT_SEND_MS = 5 * 60 * 1000;
let lastCommentSend = 0;
let commentSendRunning = false;
async function sendCommentLeadsIfDue() {
  if (commentSendRunning || Date.now() - lastCommentSend < COMMENT_SEND_MS) return;
  lastCommentSend = Date.now();
  commentSendRunning = true;
  let client = null;
  try {
    const rowsOf = (sql, params) => query(sql, params).then((x) => x.rows);
    const apiKey = await loadJarvisLeadsKey(rowsOf, decryptSecret);
    if (!apiKey) return;
    client = await getPool().connect();
    const lock = await client.query(`SELECT pg_try_advisory_lock(hashtext('jarvis-comment-leads')) AS ok`);
    if (!lock.rows[0]?.ok) return;
    try {
      const r = await sendCommentLeadsToJarvis({
        rowsOf,
        apiKey,
        baseUrl: process.env.JARVIS_BASE_URL || JARVIS_BASE_DEFAULT,
        autopostSchema: process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper',
      });
      if (r.sent || r.rejected || r.aiAdded || r.aiSkipped) {
        console.log(`  คอมเมนต์ → Jarvis: ส่งแล้ว ${r.sent} · Jarvis ไม่รับ ${r.rejected} · AI โทร ${r.aiAdded} · AI ข้าม ${r.aiSkipped}`);
      }
      if (r.stopped || r.retry) console.warn(`  คอมเมนต์ → Jarvis: ${r.stopped || r.retry}`);
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('jarvis-comment-leads'))`).catch(() => {});
    }
  } catch (e) {
    console.warn(`  ส่งคอมเมนต์เข้า Jarvis ไม่สำเร็จ — ${e?.message ?? e}`);
  } finally {
    client?.release();
    commentSendRunning = false;
  }
}

// ไฟล์แนบที่ค้าง "รออ่าน" (เซิร์ฟเวอร์ AI ไม่มีโมเดล OCR / เครื่องไม่มีตัวแปลง PDF) — อ่านย้อนทุก 10 นาทีเมื่อพร้อม
const OCR_BACKLOG_MS = 10 * 60 * 1000;
let lastOcrBacklog = 0;
let ocrBacklogRunning = false;
async function readOcrBacklogIfDue() {
  if (ocrBacklogRunning || Date.now() - lastOcrBacklog < OCR_BACKLOG_MS) return;
  lastOcrBacklog = Date.now();
  ocrBacklogRunning = true;
  try {
    await withTransaction(async (client) => {
      const lock = await client.query(`SELECT pg_try_advisory_xact_lock(hashtext('ocr-backlog')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      const r = await ocrBacklog({ limit: 20 });
      if (r.read || r.tried) console.log(`  OCR ย้อนหลัง: อ่านได้ ${r.read}/${r.tried} ไฟล์`);
    });
  } catch (e) {
    console.warn(`  OCR ย้อนหลังไม่สำเร็จ — ${e?.message ?? e}`);
  } finally {
    ocrBacklogRunning = false;
  }
}

async function runOne() {
  await heartbeat();
  await recoverStale();
  if (!process.argv.includes('--selftest')) {
    await syncJarvisIfDue();
    // ทำเบื้องหลัง ไม่ให้การอ่านไฟล์ย้อนหลังหน่วงการรับงาน Scrap
    readOcrBacklogIfDue();
    sendCommentLeadsIfDue();
  }
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
    // Draft ที่หยุดตาม Fact/Research Gate ไม่ใช่งานสำเร็จ: ผู้ใช้ต้องเห็นว่า
    // "ต้องให้ช่วย" และสามารถกดแก้/ลองใหม่ได้จาก Web โดยไม่เข้าใจว่า Queue done.
    const needsInput = job.type === 'draft' && r?.status === 'needs_input';
    // คนกดปิดงานระหว่างรัน: จบคิวโดยไม่ลองใหม่
    const status = needsInput ? 'needs_input' : outcome === 'stopped' ? 'error' : outcome === 'market_insufficient' ? 'partial' : 'done';
    const detail = needsInput
      ? (r?.issues ?? []).join(' · ') || 'ต้องยืนยันข้อมูลก่อนสร้างสื่อ'
      : outcome === 'stopped' ? 'หยุดแล้ว คนกดปิดงานนี้'
      : outcome === 'already_running' ? 'งานนี้กำลังรันอยู่แล้วในอีกช่อง ไม่รันซ้ำ' : null;
    await finish(job.id, status, detail);
    console.log(`  ✓ done: ${JSON.stringify(r).slice(0, 200)}`);
    if (job.type === 'scrape') await completeJarvisScrapes();
  } catch (e) {
    const errMsg = String(e?.message ?? e).slice(0, 1500);
    // เครื่องเข้าเว็บไม่ได้ (ทุกชนิดงาน เช่น ดึงเบอร์คืน): รอคิวลองใหม่ทุก 30 นาทีจนครบ 3 วัน ไม่ใช้รอบลองใหม่ 3 รอบจนตีกลับ
    const offline = (e?.offline === true || isNetworkError(errMsg)) && !offlineWaitExpired(job.created_at);
    const thrownAt = e?.retryAt instanceof Date && !Number.isNaN(e.retryAt.getTime()) ? e.retryAt : null;
    const retryAt = thrownAt ?? (offline ? networkRetryAt() : null);
    const waiting = Boolean(retryAt) && (offline || (e?.waiting === true && e?.offline !== true));
    const final = e?.final === true;
    const retrying = await retryOrFail(job, errMsg, retryAt, { waiting: !final && waiting, final });
    console.error(`  ✗ ${waiting ? 'waiting for quota' : retrying ? 'retry scheduled' : 'error'}: ${e?.message ?? e}`);
    // แจ้งเตือนทันทีที่งานพัง (fail-soft — ไม่มี ALERT_WEBHOOK_URL = เงียบ)
    if (!retrying && !final) {
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
