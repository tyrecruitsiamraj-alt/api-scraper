import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUTPUT_DIR, loadCriteria, loadRuntime, requestGapMs, sleep } from './config.js';
import { getJobbkkSession } from './providers/jobbkk/session.js';
import { fetchResumeHtml, resumeDetailUrl, searchResumeIds } from './providers/jobbkk/client.js';
import { dedupeKey, parseResumeHtml } from './providers/jobbkk/parser.js';
import { downloadAssets } from './providers/jobbkk/assets.js';
import { buildReadableMarkdown, writeCsv, writeJsonl } from './export.js';

async function main() {
  const runtime = loadRuntime();
  const criteria = loadCriteria();
  const runAt = new Date().toISOString();

  console.log('\n=== api-scraper MVP — JobBKK (hybrid: browser login → HTTP scrape) ===');
  console.log(`Criteria: position="${criteria.position}" keyword="${criteria.keyword}" max=${criteria.maxCandidates}`);
  console.log(`Headless: ${runtime.headless} | request gap ${runtime.delayMin}-${runtime.delayMax}ms\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log('[1/4] Acquiring session...');
  const { browser, context, request } = await getJobbkkSession({ headless: runtime.headless, debug: runtime.debug });

  const candidates = [];
  const errors = [];
  let totalAvailable = null;
  let foundIds = 0;

  try {
    console.log('[2/4] Searching (POST) + paginating (GET)...');
    const search = await searchResumeIds(request, criteria, runtime);
    totalAvailable = search.totalAvailable;
    foundIds = search.ids.length;
    console.log(`  Found ${foundIds} resume ids across ${search.pagesScanned} page(s). Site total ~${totalAvailable ?? '?'}`);
    if (totalAvailable != null && totalAvailable < criteria.maxCandidates) {
      console.warn(`  ⚠ site has ~${totalAvailable} results — fewer than requested ${criteria.maxCandidates}`);
    }

    console.log('[3/4] Fetching + parsing detail pages...');
    const seen = new Set();
    let saved = 0;
    for (let i = 0; i < search.ids.length && saved < criteria.maxCandidates; i += 1) {
      const id = search.ids[i];
      const url = resumeDetailUrl(id);
      try {
        const html = await fetchResumeHtml(request, id);
        const parsed = parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });

        const key = dedupeKey(parsed);
        if (seen.has(key)) {
          if (runtime.debug) console.log(`  [${i + 1}] duplicate (${key}) — skip`);
          continue;
        }
        seen.add(key);

        const no = String(saved + 1).padStart(3, '0');
        await downloadAssets(request, parsed, no, OUTPUT_DIR);
        candidates.push(parsed);
        saved += 1;
        console.log(`  [${saved}/${criteria.maxCandidates}] ${parsed.name || '(no name)'} — ${parsed.parse_status} | ☎ ${parsed.phone || '-'} | 📎 ${parsed.attachments?.length || 0}`);
      } catch (e) {
        errors.push({ id, url, error: e.message });
        console.error(`  [${i + 1}] id ${id} failed: ${e.message}`);
      }
      if (saved < criteria.maxCandidates && i < search.ids.length - 1) await sleep(requestGapMs(runtime));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  console.log('[4/4] Exporting...');
  const summary = {
    run_at: runAt, platform: 'jobbkk', search_criteria: criteria,
    requested: criteria.maxCandidates, found_ids: foundIds, total_available_estimate: totalAvailable,
    scraped_success: candidates.length, scraped_failed: errors.length, errors,
  };
  await writeFile(join(OUTPUT_DIR, 'candidates.jsonl'), '', 'utf8');
  await writeJsonl(join(OUTPUT_DIR, 'candidates.jsonl'), candidates);
  await writeCsv(join(OUTPUT_DIR, 'candidates.csv'), candidates);
  await writeFile(
    join(OUTPUT_DIR, 'candidates-readable.md'),
    buildReadableMarkdown({ runAt, position: criteria.position, keyword: criteria.keyword, requested: criteria.maxCandidates, found: foundIds }, candidates),
    'utf8',
  );
  await writeFile(join(OUTPUT_DIR, 'run_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\nDone. Scraped ${candidates.length}/${criteria.maxCandidates} (failed ${errors.length}).`);
  console.log(`Output: ${OUTPUT_DIR}`);
  if (candidates.length === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('\nScrape failed:', e.message);
  process.exit(1);
});
