/* eslint-disable no-console */
require('dotenv').config();
const { spawn } = require('child_process');

/**
 * ที่อยู่เต็มของ cmd.exe — เรียกแค่ 'cmd.exe' ต้องพึ่ง PATH ถ้า PATH ของหน้าต่างไม่มีโฟลเดอร์ System32 ของ Windows
 * จะได้ "spawn cmd.exe ENOENT" แล้วงานล้มทันที (เกิดบน RM009 28 ต.ค. 2569)
 */
function windowsCmd() {
  const comspec = String(process.env.ComSpec || process.env.COMSPEC || '').trim();
  if (comspec) return comspec;
  return require('path').join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'cmd.exe');
}

const os = require('os');
const fs = require('fs');
const path = require('path');

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
      }).unref();
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  } catch (e) {
    console.error('[collect-worker] killProcessTree:', e.message || e);
  }
}

const API_BASE = String(process.env.WORKER_API_BASE || '').replace(/\/$/, '');
const TOKEN = String(process.env.POST_WORKER_TOKEN || '').trim();
const INTERVAL_MS = Math.max(2000, Number(process.env.WORKER_POLL_MS) || 5000);
const CONCURRENCY = Math.min(16, Math.max(1, Number(process.env.WORKER_COLLECT_CONCURRENCY) || 4));
const PROJECT_ROOT = process.cwd();
const JOB_MAX_MS = Math.min(
  12 * 60 * 60 * 1000,
  Math.max(10 * 60 * 1000, Number(process.env.WORKER_COLLECT_JOB_MAX_MS) || 6 * 60 * 60 * 1000)
);
const AUTO_COLLECT_ENABLED = process.env.AUTO_COLLECT_ENABLED === '1';
const AUTO_COLLECT_TZ = String(process.env.AUTO_COLLECT_TZ || 'Asia/Bangkok').trim() || 'Asia/Bangkok';
const AUTO_COLLECT_HOUR = Math.min(23, Math.max(0, Number(process.env.AUTO_COLLECT_HOUR) || 7));
const AUTO_COLLECT_MINUTE = Math.min(59, Math.max(0, Number(process.env.AUTO_COLLECT_MINUTE) || 15));
const AUTO_COLLECT_STATE_PATH = path.join(PROJECT_ROOT, 'data', '.collect-auto-last-date.txt');
/**
 * เก็บถี่ (ตอบคอมเมนต์ทันใจ): ตั้ง AUTO_COLLECT_EVERY_MINUTES เช่น 120 = ทุก 2 ชม.
 * เก็บโพสต์ย้อนหลัง AUTO_COLLECT_LOOKBACK_DAYS วัน (default 3) — ใช้แทนรอบวันละครั้ง
 */
const AUTO_COLLECT_EVERY_MINUTES = Math.max(0, Number(process.env.AUTO_COLLECT_EVERY_MINUTES) || 0);
const AUTO_COLLECT_LOOKBACK_DAYS = Math.min(14, Math.max(1, Number(process.env.AUTO_COLLECT_LOOKBACK_DAYS) || 3));

if (!API_BASE) {
  console.error('[collect-worker] missing WORKER_API_BASE');
  process.exit(1);
}
if (!TOKEN) {
  console.error('[collect-worker] missing POST_WORKER_TOKEN');
  process.exit(1);
}

const workerId = `${os.hostname()}-${process.pid}`;
let activeJobs = 0;
let claiming = false;

async function callApi(pathname, body) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': TOKEN,
      'x-worker-id': workerId,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${pathname} ${res.status}`);
  return data;
}

function formatDateByTz(d, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value || '0000';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const dd = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${dd}`;
}

function getNowInTz(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const month = Number(parts.find((p) => p.type === 'month')?.value || 1);
  const day = Number(parts.find((p) => p.type === 'day')?.value || 1);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { year, month, day, hour, minute, dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

function getYesterdayByTz(timeZone) {
  const now = new Date();
  const dateStr = formatDateByTz(now, timeZone);
  const [y, m, d] = dateStr.split('-').map((x) => Number(x));
  const utcMid = new Date(Date.UTC(y, m - 1, d));
  utcMid.setUTCDate(utcMid.getUTCDate() - 1);
  return formatDateByTz(utcMid, 'UTC');
}

function readLastAutoCollectDate() {
  try {
    if (!fs.existsSync(AUTO_COLLECT_STATE_PATH)) return '';
    return String(fs.readFileSync(AUTO_COLLECT_STATE_PATH, 'utf8') || '').trim();
  } catch {
    return '';
  }
}

function saveLastAutoCollectDate(dateStr) {
  try {
    fs.mkdirSync(path.dirname(AUTO_COLLECT_STATE_PATH), { recursive: true });
    fs.writeFileSync(AUTO_COLLECT_STATE_PATH, String(dateStr || '').trim(), 'utf8');
  } catch (e) {
    console.error('[collect-worker] save auto state failed:', e.message || e);
  }
}

function daysAgoByTz(days, timeZone) {
  const [y, m, d] = formatDateByTz(new Date(), timeZone).split('-').map((x) => Number(x));
  const utcMid = new Date(Date.UTC(y, m - 1, d));
  utcMid.setUTCDate(utcMid.getUTCDate() - days);
  return formatDateByTz(utcMid, 'UTC');
}

async function enqueueDailyCollectForYesterday(range) {
  const yesterday = getYesterdayByTz(AUTO_COLLECT_TZ);
  const startDate = range?.start || yesterday;
  const endDate = range?.end || yesterday;
  console.log(`[collect-worker] auto-collect: preparing jobs for ${startDate}..${endDate} (${AUTO_COLLECT_TZ})`);
  // ใช้ worker token — /api/users และ /api/run/collect-comments ต้องล็อกอินคอนโซล worker เรียกไม่ได้
  const out = await callApi('/api/worker/collect/enqueue-recent', { start_date: startDate, end_date: endDate });
  const queued = Array.isArray(out?.queued) ? out.queued : [];
  const busy = (Array.isArray(out?.skipped) ? out.skipped : []).filter((s) => s.reason === 'busy').length;
  const queuedPosts = queued.reduce((sum, q) => sum + (Number(q.posts) || 0), 0);
  if (queued.length === 0) {
    console.log(`[collect-worker] auto-collect: no posts to collect${busy ? ` (${busy} บัญชียังเก็บรอบก่อนไม่เสร็จ)` : ''}`);
  } else {
    console.log(`[collect-worker] auto-collect: queued ${queuedPosts} posts across ${queued.length} users`);
  }
  return { queuedUsers: queued.length, queuedPosts, date: endDate };
}

let autoCollectRunning = false;
let lastIntervalCollectAt = 0;
async function tickAutoDailySchedule() {
  if (!AUTO_COLLECT_ENABLED) return;
  if (autoCollectRunning) return;
  if (AUTO_COLLECT_EVERY_MINUTES > 0) {
    if (Date.now() - lastIntervalCollectAt < AUTO_COLLECT_EVERY_MINUTES * 60_000) return;
    autoCollectRunning = true;
    lastIntervalCollectAt = Date.now();
    try {
      const start = daysAgoByTz(AUTO_COLLECT_LOOKBACK_DAYS, AUTO_COLLECT_TZ);
      const end = daysAgoByTz(0, AUTO_COLLECT_TZ);
      console.log(`[collect-worker] auto-interval: posts ${start}..${end}`);
      await enqueueDailyCollectForYesterday({ start, end });
    } catch (e) {
      console.error('[collect-worker] auto-interval failed:', e.message || e);
    } finally {
      autoCollectRunning = false;
    }
    return;
  }
  const now = getNowInTz(AUTO_COLLECT_TZ);
  const due = now.hour > AUTO_COLLECT_HOUR || (now.hour === AUTO_COLLECT_HOUR && now.minute >= AUTO_COLLECT_MINUTE);
  if (!due) return;
  const last = readLastAutoCollectDate();
  if (last === now.dateStr) return;
  autoCollectRunning = true;
  try {
    await enqueueDailyCollectForYesterday();
    saveLastAutoCollectDate(now.dateStr);
  } catch (e) {
    console.error('[collect-worker] auto-daily failed:', e.message || e);
  } finally {
    autoCollectRunning = false;
  }
}

async function runPlaywrightForJob(job) {
  const tmpDir = path.join(PROJECT_ROOT, 'data');
  fs.mkdirSync(tmpDir, { recursive: true });
  const planPath = path.join(tmpDir, `.collect-worker-plan-${job.id}-${Date.now()}.json`);
  const plan = {
    user_id: String(job.user_id || ''),
    posts: Array.isArray(job.posts) ? job.posts : [],
  };
  fs.writeFileSync(planPath, JSON.stringify(plan), 'utf8');

  const forceHeaded = process.env.COLLECT_FORCE_HEADED === '1';
  const args = forceHeaded
    ? ['playwright', 'test', 'collectComments', '--headed', '--project=GoogleChrome']
    : ['playwright', 'test', 'collectComments', '--project=ChromiumCollect'];
  const env = {
    ...process.env,
    FORCE_COLOR: '1',
    RUN_ID: String(job.run_id || ''),
    RUN_LOG_API_URL: API_BASE,
    COLLECT_PLAN_PATH: planPath,
    COLLECT_WORKER_TOKEN: TOKEN,
    COLLECT_USE_HEADED: forceHeaded ? '1' : '0',
  };
  const isWin = process.platform === 'win32';
  return await new Promise((resolve, reject) => {
    const child = isWin
      ? spawn(windowsCmd(), ['/d', '/c', 'npx', ...args], {
          cwd: PROJECT_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
          shell: false,
          windowsHide: false,
        })
      : spawn('npx', args, {
          cwd: PROJECT_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
          shell: false,
          windowsHide: false,
        });
    // เก็บท้าย output ไว้สรุปสาเหตุตอนล้มเหลว (ยังพิมพ์ออกหน้าจอเหมือนเดิม)
    let outputTail = '';
    const rememberOutput = (chunk, stream) => {
      const text = String(chunk || '');
      if (stream === 'stderr') process.stderr.write(text);
      else process.stdout.write(text);
      outputTail = `${outputTail}${text}`
        .replace(/((?:password|token|secret|api[_-]?key)\s*[=:]\s*)\S+/gi, '$1[redacted]')
        .slice(-12000);
    };
    child.stdout?.on('data', (chunk) => rememberOutput(chunk, 'stdout'));
    child.stderr?.on('data', (chunk) => rememberOutput(chunk, 'stderr'));
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killProcessTree(child);
      reject(new Error(`WORKER_COLLECT_JOB_MAX_MS exceeded (${JOB_MAX_MS}ms)`));
    }, JOB_MAX_MS);

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        fs.unlinkSync(planPath);
      } catch {}
      if (err) reject(err);
      else resolve();
    };
    child.on('close', (code) => {
      if (code === 0) return finish(null);
      const { describeWorkerFailure } = require('../server/worker-diagnostic');
      finish(new Error(describeWorkerFailure(code, outputTail)));
    });
    child.on('error', finish);
  });
}

async function processJob(job) {
  activeJobs += 1;
  console.log(
    `[collect-worker] picked job ${job.id} run_id=${job.run_id || '-'} user=${job.user_id || '-'} posts=${(job.post_log_ids || []).length} active=${activeJobs}/${CONCURRENCY}`
  );
  try {
    try {
      await runPlaywrightForJob(job);
      await callApi('/api/worker/collect/complete', {
        job_id: job.id,
        run_id: job.run_id,
        ok: true,
        message: 'Collect worker run completed',
      });
      console.log(`[collect-worker] job ${job.id} completed`);
    } catch (e) {
      await callApi('/api/worker/collect/complete', {
        job_id: job.id,
        run_id: job.run_id,
        ok: false,
        message: 'Collect worker run failed',
        error: e.message || String(e),
      });
      console.error(`[collect-worker] job ${job.id} failed: ${e.message || e}`);
    }
  } catch (e) {
    console.error(`[collect-worker] process job error: ${e.message || e}`);
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

/** ตอนเปิดเครื่อง/เปิดสวิตช์ใหม่: ปิดงานค้างของ process เก่าบนเครื่องนี้ก่อนรับงานใหม่ */
let startupReleased = false;
async function releaseOrphansOnce() {
  try {
    const out = await callApi('/api/worker/release-orphans', { kind: 'collect', worker_id: workerId });
    const ids = Array.isArray(out?.released) ? out.released : [];
    if (ids.length) console.warn(`[collect-worker] ปิดงานที่ค้างจากรอบก่อนเครื่องเริ่มใหม่ ${ids.length} งาน: ${ids.join(', ')}`);
  } catch (e) {
    console.error(`[collect-worker] release-orphans: ${e.message || e}`);
  } finally {
    startupReleased = true;
  }
}

async function tick() {
  if (!startupReleased) return;
  if (claiming) return;
  if (activeJobs >= CONCURRENCY) return;
  claiming = true;
  try {
    while (activeJobs < CONCURRENCY) {
      const claimed = await callApi('/api/worker/collect/claim', { worker_id: workerId });
      const job = claimed?.job || null;
      if (!job) break;
      processJob(job).catch((e) => console.error(`[collect-worker] unhandled process job error: ${e.message || e}`));
    }
  } catch (e) {
    console.error(`[collect-worker] tick error: ${e.message || e}`);
  } finally {
    claiming = false;
  }
}

const SWEEP_MS = Math.max(60_000, Number(process.env.WORKER_SWEEP_INTERVAL_MS) || 120_000);
async function sweepStale() {
  try {
    const maxMin = Math.min(24 * 60, Math.max(15, Number(process.env.COLLECT_RUN_STALE_MINUTES) || 180));
    const out = await callApi('/api/worker/collect/sweep-stale', { max_age_minutes: maxMin });
    if (out.failed_stale_count > 0) {
      console.warn(`[collect-worker] sweep-stale: ปิดงานค้าง ${out.failed_stale_count} รายการ (running > ${maxMin} min)`);
    }
  } catch (e) {
    console.error(`[collect-worker] sweep-stale: ${e.message || e}`);
  }
}

console.log('[collect-worker] started');
console.log(`[collect-worker] api=${API_BASE}`);
console.log(`[collect-worker] worker_id=${workerId}`);
console.log(`[collect-worker] concurrency=${CONCURRENCY}`);
console.log(`[collect-worker] job max duration ${Math.round(JOB_MAX_MS / 60000)} min (WORKER_COLLECT_JOB_MAX_MS)`);
if (AUTO_COLLECT_ENABLED && AUTO_COLLECT_EVERY_MINUTES > 0) {
  console.log(`[collect-worker] auto-interval every ${AUTO_COLLECT_EVERY_MINUTES} min, posts from last ${AUTO_COLLECT_LOOKBACK_DAYS} days`);
} else if (AUTO_COLLECT_ENABLED) {
  console.log(
    `[collect-worker] auto-daily enabled at ${String(AUTO_COLLECT_HOUR).padStart(2, '0')}:${String(AUTO_COLLECT_MINUTE).padStart(2, '0')} (${AUTO_COLLECT_TZ})`
  );
}
setInterval(sweepStale, SWEEP_MS);
sweepStale();
setInterval(tick, INTERVAL_MS);
releaseOrphansOnce().then(() => tick());
setInterval(tickAutoDailySchedule, 60_000);
tickAutoDailySchedule();
