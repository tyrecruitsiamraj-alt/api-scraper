import { closePool } from './db/pool.js';
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
  saveExtraction,
  setTaskPhase,
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

async function runTask(t, runtime) {
  const connector = await getConnector(t.connector_id);
  if (!connector) {
    await finishTask(t.id, { status: 'error', phase: 'error', error: 'connector missing' });
    return;
  }

  const target = t.mode === 'count' ? t.target_count || connector.scrape_limit : connector.scrape_limit;
  const criteria = { ...(t.criteria || {}), maxCandidates: target, updatedSince: t.updated_since ?? undefined };

  // ---- phase 1: scrape ----
  await markTaskRunning(t.id, target);
  console.log(`▶ ${t.name} → ${connector.label} (scrape, target ${target})`);
  const r = await runConnector(connector, criteria, runtime, {
    taskId: t.id,
    onProgress: (got) => bumpTaskProgress(t.id, got),
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

async function main() {
  const runtime = loadRuntime();
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

main().catch(async (e) => {
  console.error('tasks-worker failed:', e.message);
  await closePool();
  process.exit(1);
});
