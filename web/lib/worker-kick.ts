import 'server-only';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { hasStaleQueuedTasks } from './repo';

let busy = false;
let rerun = false;

function workerLockPath(root: string) {
  return path.join(root, 'output', 'worker.lock');
}

function killWorkerProcess(root: string) {
  const lock = workerLockPath(root);
  if (!existsSync(lock)) return;
  try {
    process.kill(Number.parseInt(readFileSync(lock, 'utf8'), 10));
  } catch {
    /* already dead */
  }
  try {
    unlinkSync(lock);
  } catch {
    /* ignore */
  }
}

// A worker is "alive" only if its lock file is fresh. Judging by mtime (not by
// process.kill(pid,0)) avoids false positives when the OS reuses a dead worker's
// PID for an unrelated process — the old check made the web refuse to start a
// worker, so queued tasks hung forever. Kept in sync with tasks-worker.js.
const LOCK_STALE_MS = 10 * 60_000; // 10 min — longer than any normal run
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
  if (isWorkerAlive(root) && (await hasStaleQueuedTasks(90))) {
    console.warn('kickWorker: queued tasks waiting — restarting stuck worker');
    killWorkerProcess(root);
  }
  if (isWorkerAlive(root)) return;
  const logDir = path.join(root, 'output');
  mkdirSync(logDir, { recursive: true });
  const logFd = openSync(path.join(logDir, 'worker.log'), 'a');
  // Drain the unified work_queue (scrape jobs enqueued by the task actions). The
  // per-connector DB lock — not this coarse worker.lock — is what prevents an
  // account from running twice, so several drains can safely overlap.
  const child = spawn(process.execPath, ['workers/runner.js', '--drain'], {
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
