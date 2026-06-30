import * as cheerio from 'cheerio';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AUTH_DIR, requestGapMs, sleep } from '../../config.js';
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
  while (ids.length < need) {
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
    pushUnique(pageIds);
    pagesScanned += 1;
    if (runtime.debug) console.log(`  page ${pageNo}: +${pageIds.length} (total ${ids.length}/${need})`);
  }

  return { ids: ids.slice(0, need), totalAvailable, pagesScanned };
}

export function resumeDetailUrl(id) {
  return `${BASE}/resumes/preview_new/${id}`;
}

export async function fetchResumeHtml(request, id, runtime = {}) {
  return getText(request, resumeDetailUrl(id), runtime);
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
