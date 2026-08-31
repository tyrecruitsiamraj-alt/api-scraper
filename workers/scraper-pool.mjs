// Scraper pool launcher — เปิด "runner" ให้พอดีกับจำนวนบัญชี scraper อัตโนมัติ
// (runner 1 ตัว = 1 slot = scrape ได้ทีละงาน; ขนาน = หลาย runner, มี lock ต่อบัญชีกันชน)
//
// นับบัญชี jobbkk/jobthai ที่ enabled → เปิด runner เท่านั้น (ขั้นต่ำ SCRAPER_POOL_MIN,
// เพดาน SCRAPER_POOL_MAX กัน RAM). เช็คซ้ำทุก 60s → เพิ่มบัญชีแล้วขยาย runner เองไม่ต้องแก้อะไร.
// respawn อัตโนมัติถ้า runner ตัวไหนตาย.
//
//   node workers/scraper-pool.mjs
import { spawn } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(__dirname, 'runner.js');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const MIN = Math.max(1, Number.parseInt(process.env.SCRAPER_POOL_MIN ?? '2', 10) || 2);
const MAX = Math.max(MIN, Number.parseInt(process.env.SCRAPER_POOL_MAX ?? '8', 10) || 8);
const RECHECK_MS = Math.max(15_000, Number.parseInt(process.env.SCRAPER_POOL_RECHECK_MS ?? '60000', 10) || 60_000);

const children = new Map(); // slot number -> child process
const restartTimers = new Map(); // slot number -> one pending restart only
let stopping = false;

async function countScraperAccounts() {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS n FROM connectors WHERE enabled = true AND platform IN ('jobbkk','jobthai')`
  );
  return rows[0]?.n ?? 0;
}

function launch(slot) {
  // scale() and an exit timer can fire at nearly the same time.  Without this
  // guard they overwrite the same Map entry; the losing child exits on the
  // process lock and schedules another restart forever.
  if (stopping || children.has(slot)) return;
  const env = { ...process.env, WORKER_NAME: `scraper-${slot}` };
  const child = spawn(process.execPath, [RUNNER], { stdio: 'inherit', env });
  children.set(slot, child);
  child.on('exit', (code) => {
    if (children.get(slot) === child) children.delete(slot);
    releaseExitedChildLock(slot, child.pid);
    if (stopping) return;
    console.log(`[pool] runner #${slot} exited (code ${code}) — restart ใน 3s`);
    scheduleRestart(slot);
  });
}

function releaseExitedChildLock(slot, pid) {
  // A force-killed runner cannot execute its finally handler.  Remove only
  // the slot lock whose recorded PID is the child that just exited; never
  // touch a lock owned by another launcher/process.
  const lockPath = path.join(OUTPUT_DIR, `runner-scraper-${slot}.lock`);
  try {
    const owner = readFileSync(lockPath, 'utf8').trim().split(/\s+/, 1)[0];
    if (owner === String(pid)) unlinkSync(lockPath);
  } catch {
    // Missing/already replaced lock is safe; runner.js remains the final guard.
  }
}

function scheduleRestart(slot) {
  if (stopping || children.has(slot) || restartTimers.has(slot)) return;
  const timer = setTimeout(() => {
    restartTimers.delete(slot);
    launch(slot);
  }, 3000);
  restartTimers.set(slot, timer);
}

async function scale() {
  let cnt;
  try {
    cnt = await countScraperAccounts();
  } catch (e) {
    console.error(`[pool] นับบัญชีไม่ได้ (${e.message}) — คงจำนวน runner เดิม`);
    return;
  }
  const target = Math.min(MAX, Math.max(MIN, cnt));
  for (let slot = 1; slot <= target; slot += 1) {
    if (!children.has(slot) && !restartTimers.has(slot)) {
      console.log(`[pool] เปิด runner #${slot} (บัญชี scraper=${cnt}, เป้า ${target}, เพดาน ${MAX})`);
      launch(slot);
    }
  }
  if (cnt > MAX) {
    console.log(`[pool] เตือน: มีบัญชี ${cnt} แต่เพดาน runner=${MAX} — เพิ่ม SCRAPER_POOL_MAX ถ้าอยากขนานมากกว่านี้`);
  }
}

function shutdown() {
  stopping = true;
  console.log('[pool] กำลังปิด runner ทั้งหมด...');
  for (const timer of restartTimers.values()) clearTimeout(timer);
  restartTimers.clear();
  for (const c of children.values()) c.kill();
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`scraper pool launcher up — MIN=${MIN} MAX=${MAX} recheck=${RECHECK_MS}ms`);
await scale();
setInterval(scale, RECHECK_MS);
