import 'server-only';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

let busy = false;
let rerun = false;

function workerLockPath(root: string) {
  const output = path.join(root, 'output');
  // runner.js uses runner-${WORKER_NAME}.lock. Keep compatibility with the
  // old runner.lock so queued work is not kicked twice after an upgrade.
  const candidates = ['runner-standalone.lock', 'runner.lock'];
  try {
    const discovered = readdirSync(output).filter((name) => /^runner-.+\.lock$/i.test(name));
    candidates.push(...discovered);
  } catch {
    // output may not exist on a fresh install; the caller creates it below.
  }
  const fresh = candidates
    .map((name) => path.join(output, name))
    .filter((file, index, all) => all.indexOf(file) === index)
    .filter((file) => existsSync(file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return fresh ?? path.join(output, 'runner-standalone.lock');
}

// A worker is "alive" only if its lock file is fresh. Judging by mtime (not by
// process.kill(pid,0)) avoids false positives when the OS reuses a dead worker's
// PID for an unrelated process — the old check made the web refuse to start a
// worker, so queued tasks hung forever. Kept in sync with tasks-worker.js.
const LOCK_STALE_MS = 60_000;
function isWorkerAlive(root: string): boolean {
  const lock = workerLockPath(root);
  if (!existsSync(lock)) return false;
  if (Date.now() - statSync(lock).mtimeMs < LOCK_STALE_MS) return true;
  try {
    unlinkSync(lock); // stale (crashed/abandoned worker) → reclaim
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Start tasks-worker as a background child process.
 * Logs to output/worker.log for debugging stuck scrapes.
 */
async function startWorkerProcess(): Promise<void> {
  const root = path.resolve(process.cwd(), '..');
  if (isWorkerAlive(root)) return;
  const logDir = path.join(root, 'output');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(path.join(logDir, 'worker.log'), 'a');
  // Drain the unified work_queue (scrape jobs enqueued by the task actions). The
  // per-connector DB lock — not this coarse worker.lock — is what prevents an
  // account from running twice, so several drains can safely overlap.
  const child = spawn(process.execPath, ['workers/runner.js'], {
    cwd: root,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  child.unref();
}

async function drain() {
  if (busy) {
    rerun = true;
    return;
  }
  busy = true;
  try {
    do {
      rerun = false;
      await startWorkerProcess();
      // Brief pause so a burst of queue clicks coalesce into one worker run.
      await new Promise((r) => setTimeout(r, 400));
    } while (rerun);
  } catch (e) {
    console.error('kickWorker failed:', e);
  } finally {
    busy = false;
  }
}

/** Fire-and-forget: start the worker without blocking the server action. */
export function kickWorker() {
  void drain();
}

/** รัน worker แบบจำกัดสิทธิ์ให้รับเฉพาะ selftest หนึ่งงาน ไม่แตะคิวงานจริงและไม่โพสต์ Facebook. */
export async function runSafeWorkflowSelfTest(): Promise<void> {
  const root = path.resolve(process.cwd(), '..');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['workers/runner.js', '--selftest', '--once'], {
      cwd: root,
      stdio: 'ignore',
      env: process.env,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('การทดสอบใช้เวลานานเกิน 30 วินาที'));
    }, 30_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`เครื่องทดสอบจบด้วยรหัส ${code ?? 'ไม่ทราบ'}`));
    });
  });
}
