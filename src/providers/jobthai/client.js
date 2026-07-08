import * as cheerio from 'cheerio';
import { sleep, requestGapMs } from '../../config.js';
import { detectSoftBan, fatal, withRetry } from '../../core/anti-ban.js';
import { regionCode } from './regions.js';

export const BASE = 'https://www3.jobthai.com';
const SEARCH = `${BASE}/findresume/resume_list.php`;

function reloginError(message) {
  const e = new Error(message);
  e.needsRelogin = true;
  return e;
}

function assertAuthed(url, body = '') {
  if (/jobthai\.com\/th\/jobpost|auth\.jobthai\.com/i.test(url)) {
    throw reloginError('session_expired: redirected away from resume area');
  }
  const head = body.slice(0, 8000);
  if (/login-form-username|login_company|เข้าสู่ระบบสำหรับบริษัท/i.test(head)) {
    throw reloginError('session_expired: login page in response');
  }
}
function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '' && v !== 'ไม่ระบุ';
}

function digits(v) {
  const d = String(v ?? '').replace(/[^\d]/g, '');
  return d ? Number.parseInt(d, 10) : NaN;
}

// Advanced-search #level_adv codes: 1=ทุกระดับ, 2=สูงกว่าปริญญาตรี, 3=ปริญญาตรี, 4=ต่ำกว่าปริญญาตรี
function mapLevel(education) {
  const t = String(education ?? '').toLowerCase();
  if (!hasValue(t)) return '';
  if (/เอก|โท|doctor|ph\.?d|master|สูงกว่า/.test(t)) return '2';
  if (/ตรี|bachelor/.test(t)) return '3';
  if (/ปวส|ปวช|อนุปริญญา|diploma|vocational|ม\.?6|ม\.?3|มัธยม|high ?school|ต่ำกว่า/.test(t)) return '4';
  return '';
}

// #salary_field brackets keyed by the desired monthly salary (baht).
function mapSalary(salaryMin, salaryMax) {
  const min = digits(salaryMin);
  const max = digits(salaryMax);
  const ref = Number.isFinite(min) ? min : Number.isFinite(max) ? max : NaN;
  if (!Number.isFinite(ref)) return '';
  if (ref <= 10_000) return '1';
  if (ref <= 15_000) return '2';
  if (ref <= 20_000) return '3';
  if (ref <= 30_000) return '4';
  if (ref <= 50_000) return '5';
  if (ref <= 100_000) return '6';
  return '7';
}

// #age_adv brackets: 1=<20, 2=20-25, 3=25-30, 4=30-35, 5=>35
function mapAge(ageMin, ageMax) {
  const min = digits(ageMin);
  const max = digits(ageMax);
  const ref = Number.isFinite(min) ? min : Number.isFinite(max) ? max : NaN;
  if (!Number.isFinite(ref)) return '';
  if (ref < 20) return '1';
  if (ref <= 25) return '2';
  if (ref <= 30) return '3';
  if (ref <= 35) return '4';
  return '5';
}

function mapGender(gender) {
  if (gender === 'ชาย' || gender === 'M') return 'M';
  if (gender === 'หญิง' || gender === 'F') return 'F';
  return '';
}

/** Build the resume_list.php advanced-search URL from criteria. */
export function buildSearchUrl(criteria, page = 1) {
  const p = new URLSearchParams({
    'search-section': 'advance-search',
    StepSearch: '1',
    l: 'th',
    typesearch: 'Adv',
    search: 'Y',
    jobtype: '',
    position_field: hasValue(criteria.position) ? String(criteria.position).trim() : '',
    salary: mapSalary(criteria.salaryMin, criteria.salaryMax),
    level: mapLevel(criteria.education),
    age: mapAge(criteria.ageMin, criteria.ageMax),
    gender: mapGender(criteria.gender),
    region: hasValue(criteria.province) ? regionCode(criteria.province) : '',
    amphoe: 'All',
    KeyWord: hasValue(criteria.keyword) ? String(criteria.keyword).trim() : '',
    KWType: '2',
  });
  if (page > 1) p.set('page', String(page));
  return `${SEARCH}?${p.toString()}`;
}

async function getText(request, url, runtime = {}) {
  return withRetry(
    async () => {
      try {
        const res = await request.get(url, { maxRedirects: 5, timeout: 60_000 });
        const body = await res.text();
        const ban = detectSoftBan({ status: res.status(), finalUrl: res.url(), body });
        if (ban.banned) throw fatal(`soft_ban:${ban.reason}`);
        if (!res.ok()) throw new Error(`HTTP ${res.status()} for ${url}`);
        assertAuthed(res.url(), body);
        return body;
      } catch (e) {
        if (e.needsRelogin || e.fatal) throw e;
        if (/Max redirect/i.test(e.message)) throw reloginError('session_redirect_loop');
        throw e;
      }
    },
    { debug: runtime.debug, label: 'GET', retries: 3 },
  );
}

function extractIdsFromList(html) {
  const $ = cheerio.load(html);
  const ids = [];
  const seen = new Set();
  const add = (raw) => {
    const m = String(raw).match(/\/resume\/\d+,(\d+)/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  };
  $('[onclick]').each((_, el) => {
    const oc = $(el).attr('onclick') || '';
    if (/\/resume\/\d+,\d+/.test(oc)) add(oc);
  });
  $('a[href*="/resume/"]').each((_, el) => add($(el).attr('href') || ''));
  return ids;
}

function nextPageUrl(html) {
  const $ = cheerio.load(html);
  const a = $('a[ga-name="resume_list_pagination"][ga-value="top_next"], a[ga-name="resume_list_pagination"][ga-value="bottom_next"]').first();
  const href = a.attr('href');
  if (!href || href === '#') return null;
  return href.startsWith('http') ? href : new URL(href, BASE).href;
}

/** Search + paginate until we have enough resume ids. */
export async function searchResumeIds(session, criteria, runtime) {
  const request = session?.request ?? session; // accept a session object or a raw request context
  const need = criteria.maxCandidates;
  const ids = [];
  const seen = new Set();
  let url = buildSearchUrl(criteria);
  let pagesScanned = 0;

  while (ids.length < need && url) {
    pagesScanned += 1;
    const html = await getText(request, url, runtime);
    for (const id of extractIdsFromList(html)) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
        if (ids.length >= need) break;
      }
    }
    if (ids.length >= need) break;
    const next = nextPageUrl(html);
    if (!next) break;
    url = next;
    await sleep(requestGapMs(runtime));
  }

  return { ids: ids.slice(0, need), totalAvailable: null, pagesScanned };
}

export function resumeDetailUrl(id) {
  return `${BASE}/resume/0,${id}.html`;
}

export async function fetchResumeHtml(session, id, runtime = {}) {
  // JobThai serves the resume body in the HTTP response, so a plain GET via the
  // request context is enough (no browser render needed). Accept a session object
  // or a raw request context.
  const request = session?.request ?? session;
  return getText(request, resumeDetailUrl(id), runtime);
}

/**
 * Reveal a masked contact via the AJAX endpoint (plain-text response).
 * type: mobile | email | line. Costs view quota — call only for kept candidates.
 */
export async function revealContact(request, resumecode, type) {
  try {
    const res = await request.get(`${BASE}/common/ajaxCheckViewStatusV2.php?resumecode=${resumecode}&type=${type}`, {
      maxRedirects: 5,
      timeout: 30_000,
      headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: resumeDetailUrl(resumecode) },
    });
    if (!res.ok()) return '';
    return (await res.text()).trim();
  } catch {
    return '';
  }
}

export async function fetchAsset(request, url, referer = BASE) {
  const res = await request.get(url, { timeout: 90_000, maxRedirects: 5, headers: { Referer: referer, Accept: '*/*' } });
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  return { buffer: await res.body(), contentType: res.headers()['content-type'] ?? '', disposition: res.headers()['content-disposition'] ?? '' };
}
