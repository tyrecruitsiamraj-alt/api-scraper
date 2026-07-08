import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUTPUT_DIR, loadCriteria, loadRuntime, requestGapMs, sleep } from './config.js';
import { getJobbkkSession, logoutJobbkk } from './providers/jobbkk/session.js';
import { fetchResumeHtml, isResumeAuthBlocked, isResumeMasked, resumeDetailUrl } from './providers/jobbkk/client.js';
import { browserSearchResumeIds } from './providers/jobbkk/browser-search.js';
import { dedupeKey, parseResumeHtml } from './providers/jobbkk/parser.js';
import { downloadAssets } from './providers/jobbkk/assets.js';
import { buildReadableMarkdown, writeCsv, writeJsonl } from './export.js';

async function main() {
  const runtime = loadRuntime();
  const criteria = loadCriteria();
  const runAt = new Date().toISOString();

  console.log('\n=== api-scraper MVP — JobBKK (headful: login → filtered browser search → browser-rendered detail) ===');
  console.log(`Criteria: position="${criteria.position}" keyword="${criteria.keyword}" max=${criteria.maxCandidates}`);
  console.log(`Headless: ${runtime.headless} | request gap ${runtime.delayMin}-${runtime.delayMax}ms\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log('[1/4] Acquiring session...');
  // JobBKK must run headful — headless login is bot-blocked and detail renders masked.
  let sess = await getJobbkkSession({ headless: false, debug: runtime.debug });

  const candidates = [];
  const errors = [];
  let totalAvailable = null;
  let foundIds = 0;
  let relogins = 0;
  const MAX_RELOGINS = 5;

  // The resume detail renders a masked (contact-hidden) variant whenever the server
  // doesn't recognise the session as a logged-in employer (stale/kicked session). When
  // that happens, force a fresh login that re-claims the session and retry — same
  // self-heal the DB pipeline does.
  const relogin = async (reason) => {
    if (relogins >= MAX_RELOGINS) throw new Error(`relogin_exhausted: ${reason}`);
    relogins += 1;
    console.warn(`  ↻ ${reason} → fresh login (${relogins}/${MAX_RELOGINS})`);
    await sess.browser.close().catch(() => {});
    sess = await getJobbkkSession({ headless: false, debug: runtime.debug, forceLogin: true });
  };

  try {
    console.log('[2/4] Browser search on Resume Search Talent (filtered)...');
    const search = await browserSearchResumeIds(sess, criteria, runtime);
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
        let html = await fetchResumeHtml(sess, id, runtime);
        // Only relogin on TRUE session loss (login redirect / kicked). A masked contact
        // is NOT fixed by relogin — record the partial and move on (see client.js).
        if (isResumeAuthBlocked(html, url)) {
          await relogin(`id ${id}: session lost (login page)`);
          html = await fetchResumeHtml(sess, id, runtime);
        }
        if (isResumeMasked(html)) console.warn(`  [${i + 1}] id ${id}: contact masked (public body only)`);
        const parsed = parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });

        const key = dedupeKey(parsed);
        if (seen.has(key)) {
          if (runtime.debug) console.log(`  [${i + 1}] duplicate (${key}) — skip`);
          continue;
        }
        seen.add(key);

        const no = String(saved + 1).padStart(3, '0');
        await downloadAssets(sess.request, parsed, no, OUTPUT_DIR);
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
    // Log out so JobBKK frees the single active session — otherwise the next run's
    // login collides and the resume detail renders masked (contact hidden).
    await logoutJobbkk(sess.context, { debug: runtime.debug }).catch(() => {});
    await sess.browser.close().catch(() => {});
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
