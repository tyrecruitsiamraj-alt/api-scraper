import * as cheerio from 'cheerio';
import { sleep, requestGapMs } from '../../config.js';
import { detectSoftBan, fatal, withRetry } from '../../core/anti-ban.js';

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
function mapLevel(education) {
  const t = String(education ?? '').toLowerCase();
  if (!t) return '';
  if (/เอก|doctor|ph\.?d/.test(t)) return '6';
  if (/โท|master/.test(t)) return '5';
  if (/ตรี|bachelor/.test(t)) return '4';
  if (/ปวส|อนุปริญญา|diploma/.test(t)) return '3';
  if (/ปวช|vocational/.test(t)) return '2';
  if (/ม\.?6|มัธยม|high ?school/.test(t)) return '1';
  return '';
}

/** Build the resume_list.php search URL from criteria. */
export function buildSearchUrl(criteria, page = 1) {
  const kw = [criteria.position, criteria.keyword].filter(Boolean).join(' ').trim();
  const p = new URLSearchParams({
    'search-section': 'general-search',
    StepSearch: '1',
    search: 'Y',
    jobtype: '',
    level: mapLevel(criteria.education),
    region: '',
    KeyWord: kw,
    fieldsearch: 'All',
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
