// Browser-driven JobBKK resume search — the ONLY flow that returns UNMASKED contact.
// Ported from the proven demo (demo-scaping): the employer session is recognised
// (contact visible on preview_new) only after a real, FILTERED search on the
// Resume Search Talent page (/resumes/premium): fill the position autocomplete →
// click Search → collect result cards. An HTTP POST search or an unfiltered click
// yields the masked (.ownerNoLogin) variant. Requires a headful browser (headless
// login is blocked by JobBKK's bot-check).
import { applyJobBkkFilters, clickSearchButton, waitForSearchResults } from './browser/jobbkk-filters.js';

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

/**
 * Run the filtered browser search and paginate until we have enough resume ids.
 * Runs on the SAME page that logged in (session.page) — the premium UI depends on
 * per-page sessionStorage from login; a new tab would redirect back to login.
 * @param {{ context: import('playwright').BrowserContext, page: import('playwright').Page }} session
 * @returns {{ ids: string[], totalAvailable: number|null, pagesScanned: number }}
 */
export async function browserSearchResumeIds(session, criteria, runtime = {}) {
  const context = session?.context ?? session;
  const need = criteria.maxCandidates ?? 15;
  const page = session?.page ?? (await context.newPage());
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
  await clickSearchButton(page);
  await waitForSearchResults(page);
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
