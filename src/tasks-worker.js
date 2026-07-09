import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { closePool } from './db/pool.js';
import { PROJECT_ROOT } from './config.js';
import {
  bumpTaskProgress,
  candidatesForRun,
  dueTasks,
  extractedTextForCandidate,
  fillCandidateContacts,
  finishTask,
  getAssetContent,
  getConnector,
  markTaskRunning,
  pendingExtractionsForRun,
  recoverStaleRunningTasks,
  saveExtraction,
  setTaskPhase,
  setTaskProgressTarget,
  touchTask,
} from './db/repositories.js';
import { loadRuntime } from './config.js';
import { runConnector } from './pipeline.js';
import { extractAttachment } from './core/ollama.js';
import { contactsFromText } from './core/contacts.js';

/**
 * Tasks worker — runs queued/due tasks as a full auto pipeline with live phases:
 *   scraping → ocr (AI extract attachments) → enrich (fill missing data) → done
 * Each phase reports progress via scrape_tasks.phase + progress_got/target so the
 * web UI can narrate ("กำลังดึง 7/15" → "กำลัง OCR 2/3" → "เติมข้อมูล 5/5" → เสร็จ).
 *
 * Scheduling (no cron lib): schedule_cron = "every:<sec>" | "@hourly" | "@daily".
 */
function nextRunFrom(cron) {
  if (!cron) return null;
  let sec = null;
  const m = String(cron).match(/^every:(\d+)$/);
  if (m) sec = Number.parseInt(m[1], 10);
  else if (cron === '@hourly') sec = 3600;
  else if (cron === '@daily') sec = 86400;
  if (!sec) return null;
  return new Date(Date.now() + sec * 1000).toISOString();
}

export async function runTask(t, runtime) {
  const connector = await getConnector(t.connector_id);
  if (!connector) {
    await finishTask(t.id, { status: 'error', phase: 'error', error: 'connector missing' });
    return;
  }

  const target = t.mode === 'count' ? t.target_count || connector.scrape_limit : connector.scrape_limit;
  const criteria = { ...(t.criteria || {}), maxCandidates: target, updatedSince: t.updated_since ?? undefined };
  const resumeFrom = t.progress_got > 0 && t.status === 'queued' ? t.progress_got : 0;

  // ---- phase 1: scrape ----
  await markTaskRunning(t.id, target, { resume: resumeFrom > 0 });
  console.log(`▶ ${t.name} → ${connector.label} (scrape, target ${target}${resumeFrom ? `, resume @${resumeFrom}` : ''})`);
  const r = await runConnector(connector, criteria, runtime, {
    taskId: t.id,
    resumeFrom,
    onTarget: (n) => setTaskProgressTarget(t.id, n),
    onProgress: (got) => bumpTaskProgress(t.id, got),
    onHeartbeat: () => touchTask(t.id),
    onPhase: (phase) => setTaskPhase(t.id, phase, 0),
  });

  if (r.status === 'failed' || r.status === 'cooldown') {
    await finishTask(t.id, {
      status: 'error',
      phase: 'error',
      runId: r.runId,
      error: r.error ?? 'run failed',
      nextRunAt: nextRunFrom(t.schedule_cron),
    });
    console.log(`  ${t.name}: ${r.status} (${r.error ?? ''})`);
    return;
  }

  // ---- phase 2: OCR attachments scraped by this run ----
  const pending = await pendingExtractionsForRun(r.runId);
  await setTaskPhase(t.id, 'ocr', pending.length);
  console.log(`  OCR: ${pending.length} attachment(s)`);
  let oc = 0;
  for (const a of pending) {
    const row = await getAssetContent(a.id);
    if (row?.content) {
      const { text, status } = await extractAttachment(row.content, row.file_type);
      await saveExtraction(a.id, { text, structured: text ? { chars: text.length, model: 'typhoon-ocr' } : null, status });
    } else {
      await saveExtraction(a.id, { status: 'skipped:no_content' });
    }
    await bumpTaskProgress(t.id, (oc += 1));
  }

  // ---- phase 3: enrich — fill missing candidate contacts from the OCR text ----
  const cands = await candidatesForRun(r.runId);
  await setTaskPhase(t.id, 'enrich', cands.length);
  console.log(`  enrich: ${cands.length} candidate(s)`);
  let i = 0;
  let filled = 0;
  for (const c of cands) {
    if (!c.email || !c.phone || !c.line_id) {
      const text = await extractedTextForCandidate(c.id);
      if (text) {
        const found = contactsFromText(text);
        const patch = {};
        if (!c.email && found.email) patch.email = found.email;
        if (!c.phone && found.phone) patch.phone = found.phone;
        if (!c.line_id && found.line_id) patch.line_id = found.line_id;
        if (Object.keys(patch).length && (await fillCandidateContacts(c.id, patch))) filled += 1;
      }
    }
    await bumpTaskProgress(t.id, (i += 1));
  }

  await finishTask(t.id, {
    status: 'done',
    phase: 'done',
    runId: r.runId,
    error: null,
    nextRunAt: nextRunFrom(t.schedule_cron),
  });
  console.log(`  ${t.name}: done | new ${r.newCount}/upd ${r.updatedCount} | ocr ${pending.length} | enriched ${filled}`);
}

/**
 * Run all queued/due tasks once. Exported for the web UI (no subprocess spawn).
 *
 * Concurrency guard = a lock FILE judged stale by mtime (not PID). The old check
 * used process.kill(pid,0), which gave false positives when the OS reused the dead
 * worker's PID for an unrelated process → the worker refused to run and tasks hung
 * forever. Here a lock older than LOCK_STALE_MS is treated as abandoned (crashed
 * worker) and reclaimed. No PID match, no DB connection held — nothing to leak.
 */
const LOCK_STALE_MS = 10 * 60_000; // 10 min — longer than any normal run
export async function runDueTasksOnce() {
  const lockPath = resolve(PROJECT_ROOT, 'output', 'worker.lock');
  mkdirSync(resolve(PROJECT_ROOT, 'output'), { recursive: true });
  if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs < LOCK_STALE_MS) {
    console.log('tasks-worker: another instance is running — exit');
    return;
  }
  writeFileSync(lockPath, `${process.pid} ${new Date().toISOString()}`);
  try {
    await runDueTasksOnceInner();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

async function runDueTasksOnceInner() {
  const runtime = loadRuntime();
  const recovered = await recoverStaleRunningTasks(10);
  for (const t of recovered) console.log(`  ↻ recovered stale task: ${t.name}`);
  const tasks = await dueTasks();
  console.log(`\n=== tasks-worker: ${tasks.length} task(s) due ===`);
  for (const t of tasks) {
    try {
      await runTask(t, runtime);
    } catch (e) {
      await finishTask(t.id, { status: 'error', phase: 'error', error: String(e.message).slice(0, 200) });
      console.error(`  ${t.name} failed: ${e.message}`);
    }
  }
  await closePool();
}

function isCliMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isCliMain()) {
  runDueTasksOnce().catch(async (e) => {
    console.error('tasks-worker failed:', e.message);
    await closePool();
    process.exit(1);
  });
}
