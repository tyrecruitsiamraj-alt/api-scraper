/* eslint-disable no-console */
/**
 * ห่อ post-remote-worker.js — ถ้า worker ล้ม (crash / OOM / Playwright ดึงโปรเซสล้ม)
 * จะรอแล้วสปอว์นใหม่ จนกว่าจะกด Ctrl+C หรือได้ SIGTERM
 *
 * ตั้ง WORKER_SUPERVISOR_RESTART_MS (ms) ได้ — default 5000
 * รันแบบไม่มี supervisor: npm run worker:post:raw
 */
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const WORKER_SCRIPT = path.join(__dirname, 'post-remote-worker.js');
const RESTART_MS = Math.max(1000, Number(process.env.WORKER_SUPERVISOR_RESTART_MS) || 5000);

let child = null;
let shuttingDown = false;

function requestShutdown() {
  shuttingDown = true;
  if (!child || child.killed) return;
  try {
    child.kill('SIGINT');
  } catch (_) {
    /* ignore */
  }
}

process.on('SIGINT', requestShutdown);
process.on('SIGTERM', requestShutdown);

function runOnce() {
  return new Promise((resolve) => {
    child = spawn(process.execPath, [WORKER_SCRIPT], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      child = null;
      resolve({ code: code == null ? null : code, signal: signal || null });
    });
    child.on('error', (err) => {
      console.error('[post-worker-supervisor] spawn error:', err.message || err);
      child = null;
      resolve({ code: 1, signal: null });
    });
  });
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(
    `[post-worker-supervisor] โหมดกันปิดเอง — worker ล้มจะรีสตาร์ทหลัง ${RESTART_MS}ms (Ctrl+C หยุด)`
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { code, signal } = await runOnce();
    if (shuttingDown) {
      process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : code ?? 0);
    }
    if (signal === 'SIGINT' || signal === 'SIGTERM') {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
    console.warn(
      `[post-worker-supervisor] worker จบ code=${code} signal=${signal || '-'} — รีสตาร์ทใน ${RESTART_MS}ms`
    );
    await sleep(RESTART_MS);
    if (shuttingDown) {
      process.exit(0);
    }
  }
}

main().catch((e) => {
  console.error('[post-worker-supervisor]', e.message || e);
  process.exit(1);
});
