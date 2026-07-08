import * as cheerio from 'cheerio';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AUTH_DIR, envInt, requestGapMs, sleep } from '../../config.js';
import { detectSoftBan, fatal, withRetry } from '../../core/anti-ban.js';

const require = createRequire(import.meta.url);
const PROVINCES = require('./provinces.json');

const BASE = 'https://www.jobbkk.com';
const SEARCH_URL = `${BASE}/resumes/premium`;

const GENDER_CODE = { ชาย: '1901', หญิง: '1902' };

/** Error that signals the caller to force a fresh login and retry once. */
function reloginError(message) {
  const e = new Error(message);
  e.needsRelogin = true;
  return e;
}

/**
 * Only TRUE session loss — where a fresh login actually helps: the request bounced
 * to the login page, or the "logged in elsewhere" (single-session kick) dialog showed.
 *
 * NOTE: a masked contact block (`.ownerNoLogin` / "เพื่อดูข้อมูลการติดต่อ") is
 * deliberately NOT treated as auth-blocked. Testing showed even a clean, exclusive,
 * fresh login renders masked (JobBKK appears to soft-flag the account after frequent
 * logins), so relogging in on every masked resume does NOT recover it and only
 * amplifies the flagging. The caller records the public body as `partial` and moves on
 * instead — see isResumeMasked().
 */
export function isResumeAuthBlocked(html, finalUrl = '') {
  if (/employer_login|\/login\//i.test(finalUrl)) return true;
  const s = String(html ?? '');
  if (/ถูกใช้งานอยู่ในระบบ|ใช้งานอยู่ในระบบ/u.test(s.slice(0, 12000))) return true; // logged-in-elsewhere / kick
  return false;
}

/**
 * The resume rendered the masked variant — logged-in body is public but name/contact
 * are hidden behind `.ownerNoLogin` ("กรุณา ล็อคอิน เพื่อดูข้อมูลการติดต่อ"). Distinct
 * from isResumeAuthBlocked: this is NOT recovered by relogin (suspected rate/anti-abuse),
 * so callers should log it and keep the partial record rather than storm the login.
 */
export function isResumeMasked(html) {
  const s = String(html ?? '');
  return /class=["'][^"']*\bownerNoLogin\b/.test(s) || /เพื่อดูข้อมูลการติดต่อ/u.test(s);
}

/** Resolve a province name (or id) to JobBKK's internal province id. */
export function resolveProvinceId(input) {
  const v = String(input ?? '').trim();
  if (!v) return '';
  if (/^\d+$/.test(v)) return v; // already an id
  if (PROVINCES.nameToId[v]) return PROVINCES.nameToId[v];
  const hit = Object.entries(PROVINCES.provinces).find(([, name]) => name.includes(v) || v.includes(name));
  return hit ? hit[0] : '';
}

/**
 * Map popup-style criteria → JobBKK premium search POST body.
 * Field names + value codes reverse-engineered from the live form.
 */
export function buildSearchForm(criteria) {
  const form = {
    position_search: criteria.position || '',
    keyword_search: criteria.keyword || '',
  };
  if (criteria.salaryMin) form.salary_min = String(criteria.salaryMin).replace(/\D/g, '');
  if (criteria.salaryMax) form.salary_max = String(criteria.salaryMax).replace(/\D/g, '');
  if (criteria.ageMin) form.age_min = String(criteria.ageMin).replace(/\D/g, '');
  if (criteria.ageMax) form.age_max = String(criteria.ageMax).replace(/\D/g, '');
  const g = GENDER_CODE[String(criteria.gender || '').trim()];
  if (g) form.gender = g;
  const provinceId = resolveProvinceId(criteria.province);
  if (provinceId) form['province[]'] = provinceId;
  return form;
}

function extractResumeIds(html) {
  const $ = cheerio.load(html);
  const ids = [];
  const seen = new Set();
  // JobBKK dropped the `article.bg-resume` wrapper — match the resume links
  // directly (clickShowDetail / read-profile / any preview_new link) and keep
  // only numeric resume ids. Robust to the surrounding card markup changing.
  $('a.clickShowDetail[data-id], a.read-profile[data-id], a[href*="/resumes/preview_new/"][data-id]').each((_, el) => {
    const id = $(el).attr('data-id');
    if (id && /^\d+$/.test(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });
  return ids;
}

function extractTotalAvailable(html) {
  // "ผลการค้นหาพบ : 1,329,469 เรซูเม่"
  const m = html.match(/ผลการค้นหาพบ[\s\S]{0,40}?([\d,]+)\s*เร[ซ]ูเม่/u);
  if (m) return Number.parseInt(m[1].replace(/,/g, ''), 10);
  return null;
}

async function getText(request, url, runtime = {}) {
  return withRetry(
    async () => {
      const res = await request.get(url, { maxRedirects: 5, timeout: 60_000 });
      const body = await res.text();
      const ban = detectSoftBan({ status: res.status(), finalUrl: res.url(), body });
      if (ban.banned) throw fatal(`soft_ban:${ban.reason}`);
      if (!res.ok()) throw new Error(`HTTP ${res.status()} for ${url}`);
      return body;
    },
    { debug: runtime.debug, label: 'GET', retries: 3 },
  );
}

/**
 * Run the search (POST) and paginate (GET /resumes/premium/{n}) until we have
 * enough resume ids. Returns { ids, totalAvailable, pagesScanned }.
 */
export async function searchResumeIds(request, criteria, runtime) {
  const need = criteria.maxCandidates;
  const form = buildSearchForm(criteria);

  const firstRes = await request.post(SEARCH_URL, { form, maxRedirects: 5, timeout: 90_000 });
  const firstHtml = await firstRes.text();
  const ban = detectSoftBan({ status: firstRes.status(), finalUrl: firstRes.url(), body: firstHtml });
  if (ban.banned) throw fatal(`soft_ban_on_search:${ban.reason}`);
  if (!firstRes.ok()) throw new Error(`Search POST failed: HTTP ${firstRes.status()}`);

  const totalAvailable = extractTotalAvailable(firstHtml);
  const ids = [];
  const seen = new Set();
  const pushUnique = (list) => {
    for (const id of list) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  };
  pushUnique(extractResumeIds(firstHtml));

  // Page 1 had no resume cards — don't silently report "0 results". Classify the
  // page so the real reason surfaces (login redirect / "logged in elsewhere"
  // dialog / genuine empty / unrecognised page) instead of a misleading success.
  if (ids.length === 0) {
    if (totalAvailable === 0) {
      return { ids: [], totalAvailable: 0, pagesScanned: 1 }; // genuine zero results
    }
    const finalUrl = firstRes.url();
    const head = firstHtml.slice(0, 12000);
    const onLogin = /employer_login|\/login\//i.test(finalUrl) || /name=["']?username_emp/i.test(head);
    const elsewhere = /ถูกใช้งานอยู่ในระบบ|ใช้งานอยู่ในระบบ/u.test(head);
    if (onLogin) {
      throw reloginError('search_not_authenticated: ได้หน้า login แทนผลค้นหา — จะ login สดแล้วลองใหม่');
    }
    if (elsewhere) {
      throw reloginError('search_blocked_already_logged_in: เจอกล่อง "บัญชีถูกใช้งานอยู่ในระบบ" — จะ login สดเพื่อยึด session แล้วลองใหม่');
    }
    // Unrecognised page (no cards, not a known 0-results page). Save it to inspect,
    // and still attempt one fresh-login retry (covers transient blocks / interstitials).
    const dump = join(AUTH_DIR, 'jobbkk-search-empty.html');
    await writeFile(dump, firstHtml).catch(() => {});
    throw reloginError(
      `search_no_cards: ได้หน้าที่ไม่มี resume card และไม่ใช่หน้า "0 ผลลัพธ์" (totalAvailable=${totalAvailable ?? 'null'}) — เซฟไว้ที่ ${dump}, จะ login สดแล้วลองใหม่`,
    );
  }

  let pagesScanned = 1;
  let pageNo = 1;
  const MAX_PAGES = 40; // hard safety cap — never paginate forever
  while (ids.length < need && pagesScanned < MAX_PAGES) {
    pageNo += 1;
    await sleep(requestGapMs(runtime));
    let html;
    try {
      html = await getText(request, `${SEARCH_URL}/${pageNo}?`, runtime);
    } catch (e) {
      if (e.fatal) throw e; // soft ban → bubble up, don't keep hammering
      if (runtime.debug) console.log(`  page ${pageNo}: ${e.message}`);
      break;
    }
    const pageIds = extractResumeIds(html);
    if (pageIds.length === 0) break;
    const before = ids.length;
    pushUnique(pageIds);
    pagesScanned += 1;
    // JobBKK repeats the last page's cards past the real end, so a page can return
    // 15 ids that are all duplicates. Stop when a page adds NO new ids (results
    // exhausted) instead of looping forever chasing an unreachable target.
    if (ids.length === before) {
      if (runtime.debug) console.log(`  page ${pageNo}: no new ids — results exhausted at ${ids.length}/${need}`);
      break;
    }
    if (runtime.debug) console.log(`  page ${pageNo}: +${pageIds.length} (total ${ids.length}/${need})`);
  }

  return { ids: ids.slice(0, need), totalAvailable, pagesScanned };
}

export function resumeDetailUrl(id) {
  return `${BASE}/resumes/preview_new/${id}`;
}

const RESUME_GOTO_TIMEOUT_MS = () => envInt('JOBBKK_RESUME_GOTO_TIMEOUT_MS', 45_000);
const RESUME_READY_TIMEOUT_MS = () => envInt('JOBBKK_RESUME_READY_TIMEOUT_MS', 20_000);

/**
 * True once the resume detail has SETTLED into one of its two end states, so we can
 * stop waiting and snapshot:
 *   - recognised employer → the name/contact is populated (real TEXT). Gate on text,
 *     NOT a container element or the login-form modal — both exist in the initial
 *     shell regardless of auth state and would fire too early (empty snapshot).
 *   - not recognised → the masked `.ownerNoLogin` contact block rendered.
 * Both are injected by client XHR after the shell paints. Runs in the page context.
 *
 * On the masked outcome the caller's isResumeAuthBlocked triggers a fresh-login retry.
 */
function resumeSettled() {
  const txt = (s) => {
    const el = document.querySelector(s);
    return el && el.textContent ? el.textContent.trim() : '';
  };
  const populated =
    txt('.rsm-name span').length > 0 ||
    txt('h3.jobseeker-name').length > 0 ||
    document.querySelectorAll('.contact-detail .data-member-detail').length > 0;
  const masked = !!document.querySelector('.ownerNoLogin');
  return populated || masked;
}

/**
 * Fetch a resume detail page as FULLY-RENDERED HTML.
 *
 * JobBKK loads the resume body client-side (JS/XHR once the browser is recognised
 * as a logged-in employer), so a plain HTTP GET of /resumes/preview_new/{id}
 * returns only a shell — homepage title + login form, no candidate data. So we
 * open the URL in the authenticated browser context, let the client JS populate
 * the DOM, then read the resulting HTML. The existing cheerio parser handles the
 * rest (it already knows the preview_new layout).
 *
 * Takes the session (or a raw BrowserContext) — it needs the browser context,
 * not the request context, so it can render.
 *
 * @param {{ context: import('playwright').BrowserContext } | import('playwright').BrowserContext} session
 */
export async function fetchResumeHtml(session, id, runtime = {}) {
  const context = session?.context ?? session; // accept a session object or a raw context
  const url = resumeDetailUrl(id);
  return withRetry(
    async () => {
      const page = await context.newPage();
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RESUME_GOTO_TIMEOUT_MS() });
        const status = res?.status() ?? 200;

        // NB: do NOT run dismissOverlays here — the resume preview itself renders inside
        // a modal/overlay, and the generic "press Escape / click .close" heuristics tear
        // it down before the data paints. A cookie banner doesn't block DOM extraction.

        // Wait for the profile to be genuinely populated (name/contact has TEXT). The
        // XHR that fills it lands after the shell paints. If it never populates (stale
        // session), this times out and we snapshot anyway so isResumeAuthBlocked can
        // trigger a relogin.
        const populated = await page
          .waitForFunction(resumeSettled, null, { timeout: RESUME_READY_TIMEOUT_MS(), polling: 300 })
          .then(() => true)
          .catch(() => false);

        // let remaining sub-sections (skills / attachments) settle
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
        await sleep(populated ? 400 : 500);

        const html = await page.content();
        const finalUrl = page.url();

        // Bounced to login / "logged in elsewhere": NOT a soft ban — let the
        // pipeline's isResumeAuthBlocked → relogin path handle it. Return as-is.
        if (isResumeAuthBlocked(html, finalUrl)) return html;

        // Genuine ban signals (429/403/captcha/blocked) → stop + cooldown.
        const ban = detectSoftBan({ status, finalUrl, body: html });
        if (ban.banned && ban.reason !== 'redirected_to_login') throw fatal(`soft_ban_on_resume:${ban.reason}`);
        return html;
      } finally {
        await page.close().catch(() => {});
      }
    },
    { debug: runtime.debug, label: `render_resume_${id}`, retries: 2 },
  );
}

/** Download a binary asset (profile image / attachment) using the session. */
export async function fetchAsset(request, url, referer = BASE) {
  const res = await request.get(url, {
    timeout: 90_000,
    maxRedirects: 5,
    headers: { Referer: referer, Accept: '*/*' },
  });
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  return {
    buffer: await res.body(),
    contentType: res.headers()['content-type'] ?? '',
    disposition: res.headers()['content-disposition'] ?? '',
  };
}
