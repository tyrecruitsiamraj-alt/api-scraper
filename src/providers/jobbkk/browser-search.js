// Browser-driven JobBKK resume search — the ONLY flow that returns UNMASKED contact.
// Current path: Resume Search Talent at /resume/lists → Normal Search with every
// filter the request actually has → AI Search only when that set is short.
// /resumes/premium remains a verified fallback.
import { applyJobBkkFilters, clickSearchButton, waitForSearchResults } from './browser/jobbkk-filters.js';
import { ensureLatestUpdatedSort } from './latest-sort.js';
import { isTalentNormalUi, openResumeSearchTalent } from './resume-talent-entry.js';
import { runAiSearch } from './strategies/ai-search.js';
import { runNormalSearch } from './strategies/normal-search.js';
import { shouldSupplementWithAiSearch } from './talent-filter-plan.js';

const SEARCH_URL = 'https://www.jobbkk.com/resumes/premium';
const CARD_SELECTOR = 'article.bg-resume a.clickShowDetail[data-id], article.bg-resume a.read-profile[data-id]';

/** Next-page URL from the JobBKK results pagination, or null at the end. */
function nextPageUrl(page) {
  return page.evaluate(() => {
    const pagination = document.querySelector('ul.pagination');
    if (!pagination) return null;
    const gt = [...pagination.querySelectorAll('a.page-link')].find((a) => a.textContent.trim() === '>');
    if (gt) {
      const href = gt.getAttribute('href');
      if (href && href !== '#') return href.startsWith('http') ? href : new URL(href, window.location.href).href;
    }
    const active = pagination.querySelector('li.page-item.active');
    const nextLi = active?.nextElementSibling;
    const a = nextLi?.querySelector('a.page-link');
    const href = a?.getAttribute('href');
    if (!href || href === '#' || a.textContent.trim() === '>') return null;
    return href.startsWith('http') ? href : new URL(href, window.location.href).href;
  }).catch(() => null);
}

async function collectIds(page, seen, ids) {
  const pageIds = await page.evaluate((sel) => {
    const out = [];
    document.querySelectorAll(sel).forEach((a) => {
      const id = a.getAttribute('data-id');
      if (id && /^\d+$/.test(id)) out.push(id);
    });
    return out;
  }, CARD_SELECTOR);
  for (const id of pageIds) if (!seen.has(id)) { seen.add(id); ids.push(id); }
}

async function visibleCardIds(page) {
  return page.locator(CARD_SELECTOR).evaluateAll((els) => els
    .map((el) => el.getAttribute('data-id'))
    .filter(Boolean)).catch(() => []);
}

/**
 * Run the filtered browser search and paginate until we have enough resume ids.
 * Runs on the SAME page that logged in (session.page) — the premium UI depends on
 * per-page sessionStorage from login; a new tab would redirect back to login.
 * @param {{ context: import('playwright').BrowserContext, page: import('playwright').Page }} session
 * @returns {{ ids: string[], totalAvailable: number|null, pagesScanned: number }}
 */
async function runLegacyBrowserSearchResumeIds(page, criteria, runtime = {}) {
  const need = criteria.maxCandidates ?? 15;
  const ids = [];
  const seen = new Set();
  let pagesScanned = 1;

  if (runtime.debug) console.log(`  [JobBKK] page after login: ${page.url()}`);
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (runtime.debug) {
    const hasUI = await page.locator('#autoComplete-position').count().catch(() => 0);
    console.log(`  [JobBKK] after goto /premium → url=${page.url()} #autoComplete-position=${hasUI}`);
  }
  await applyJobBkkFilters(page, criteria, SEARCH_URL); // fills position autocomplete etc.
  const beforeSearchIds = await visibleCardIds(page);
  await clickSearchButton(page);
  await waitForSearchResults(page, 45_000, beforeSearchIds);
  const latestSort = await ensureLatestUpdatedSort(page);
  if (runtime.debug) console.log(`  [JobBKK] newest-first: ${latestSort.method}`);
  await collectIds(page, seen, ids);
  if (runtime.debug) console.log(`  [JobBKK] search page 1: ${ids.length} ids`);

  const MAX_PAGES = 40;
  while (ids.length < need && pagesScanned < MAX_PAGES) {
    const next = await nextPageUrl(page);
    if (!next) break;
    pagesScanned += 1;
    await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForSearchResults(page).catch(() => {});
    const before = ids.length;
    await collectIds(page, seen, ids);
    if (ids.length === before) break; // exhausted
    if (runtime.debug) console.log(`  [JobBKK] search page ${pagesScanned}: total ${ids.length}/${need}`);
  }

  return { ids: ids.slice(0, need), totalAvailable: null, pagesScanned };
}

/**
 * Same path as a recruiter: Resume Search Talent → Normal Search (all provided
 * filters) → AI Search only when that result set is short of target.
 */
export async function browserSearchResumeIds(session, criteria, runtime = {}) {
  const context = session?.context ?? session;
  const need = criteria.maxCandidates ?? 15;
  const page = session?.page ?? (await context.newPage());

  const entry = await openResumeSearchTalent(page).catch(() => ({ profile: 'unknown' }));
  if (entry.profile === 'current' || await isTalentNormalUi(page)) {
    const normal = await runNormalSearch(page, criteria, { need });
    let ai = { pool: [], warning: null };
    if (shouldSupplementWithAiSearch(normal.pool.length, need)) {
      console.log(`  [JobBKK] Normal Search ได้ ${normal.pool.length}/${need} — ใช้ AI Search เติมจำนวน`);
      try {
        ai = await runAiSearch(page, criteria);
      } catch (error) {
        ai.warning = error?.message || 'AI SEARCH unavailable';
        console.warn(`  [JobBKK] AI SEARCH unavailable; continue with Normal Search: ${ai.warning}`);
      }
    }
    const seen = new Set();
    const ids = [];
    for (const item of [...normal.pool, ...ai.pool]) {
      if (!item?.id || seen.has(item.id) || ids.length >= need) continue;
      seen.add(item.id);
      ids.push(item.id);
    }
    if (runtime.debug) {
      console.log(`  [JobBKK] Normal ${normal.pool.length} + AI ${ai.pool.length} → ${ids.length} unique Resume IDs`);
    }
    return {
      ids,
      totalAvailable: null,
      pagesScanned: normal.pagesScanned,
      contractVersion: entry.contractVersion,
      strategies: {
        ai: { resultCount: ai.pool.length, warning: ai.warning || null },
        normal: { resultCount: normal.pool.length, applied: normal.report.applied, skipped: normal.report.skipped },
      },
    };
  }

  if (runtime.debug) console.log('  [JobBKK] Talent Normal Search UI not ready — falling back to premium page');
  return runLegacyBrowserSearchResumeIds(page, criteria, runtime);
}
