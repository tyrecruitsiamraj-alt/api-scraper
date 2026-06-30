import { closePool } from './db/pool.js';
import { getAssetContent, listPendingExtractions, saveExtraction } from './db/repositories.js';
import { extractAttachment } from './core/ollama.js';
import { envInt, sleep } from './config.js';

/**
 * Decoupled OCR/extraction worker. Processes attachment assets with
 * extract_status='pending' through Ollama (typhoon-ocr) and stores the
 * extracted text — kept separate from scraping so OCR latency never slows
 * the scrape pipeline.
 *
 *   node src/extract-worker.js          # one batch
 */
async function main() {
  const batch = await listPendingExtractions(envInt('EXTRACT_BATCH', 20));
  console.log(`\n=== extraction worker: ${batch.length} pending attachment(s) ===`);
  let ok = 0;
  let fail = 0;
  for (const a of batch) {
    const row = await getAssetContent(a.id);
    if (!row?.content) {
      await saveExtraction(a.id, { status: 'skipped:no_content' });
      continue;
    }
    const t0 = Date.now();
    const { text, status } = await extractAttachment(row.content, row.file_type);
    await saveExtraction(a.id, { text, structured: text ? { chars: text.length, model: 'typhoon-ocr' } : null, status });
    const sec = Math.round((Date.now() - t0) / 1000);
    console.log(`  ${a.file_type.padEnd(4)} ${a.id} -> ${status} (${text.length} chars, ${sec}s)`);
    status === 'success' ? (ok += 1) : (fail += 1);
    await sleep(300);
  }
  console.log(`done. extracted ${ok}, failed/skipped ${fail}`);
  await closePool();
}

main().catch(async (e) => {
  console.error('extract-worker failed:', e.message);
  await closePool();
  process.exit(1);
});
