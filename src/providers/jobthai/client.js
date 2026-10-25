import * as cheerio from 'cheerio';
import { sleep, requestGapMs } from '../../config.js';
import { detectSoftBan, fatal, withRetry } from '../../core/anti-ban.js';
import { isDescendingLatest } from '../jobbkk/latest-sort.js';
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

function mapLevel(education) {
  const t = String(education ?? '').toLowerCase();
  if (!hasValue(t)) return '';
  if (/เอก|โท|doctor|ph\.?d|master|สูงกว่า/.test(t)) return '2';
  if (/ตรี|bachelor/.test(t)) return '3';
  if (/ปวส|ปวช|อนุปริญญา|diploma|vocational|ม\.?6|ม\.?3|มัธยม|high ?school|ต่ำกว่า/.test(t)) return '4';
  return '';
}

/**
 * ช่องเงินเดือนและอายุของ JobThai เลือกได้ช่องเดียว (ดูฟอร์ม findresume.php ต.ค. 2026)
 *   salary: 1 ≤10,000 · 2 10,001–15,000 · 3 15,001–20,000 · 4 20,001–30,000 · 5 30,001–50,000 · 6 50,001–100,000 · 7 >100,000
 *   age:    1 <20 · 2 20–25 · 3 25–30 · 4 30–35 · 5 >35
 * เดิมเอาค่าต่ำสุดไปเลือกช่อง เช่น อายุ 25–45 กลายเป็น "20–25" และเงินเดือน 10,000+ กลายเป็น "ไม่เกิน 10,000"
 * ผลค้นหาเลยเหลือ 0 ตอนนี้ส่งช่องนั้นเฉพาะเมื่อช่วงที่ขอทั้งช่วงอยู่ในช่องเดียว ไม่งั้นเว้นว่าง (ไม่จำกัด)
 * แล้วให้ตัวคัดโปรไฟล์ (core/candidate-match.js) คัดอายุจากโปรไฟล์จริงแทน
 */
const SALARY_BUCKETS = [
  ['1', 0, 10_000], ['2', 10_001, 15_000], ['3', 15_001, 20_000], ['4', 20_001, 30_000],
  ['5', 30_001, 50_000], ['6', 50_001, 100_000], ['7', 100_001, Infinity],
];
const AGE_BUCKETS = [['1', 0, 19], ['2', 20, 25], ['3', 25, 30], ['4', 30, 35], ['5', 36, Infinity]];

function bucketFor(buckets, minValue, maxValue) {
  const min = digits(minValue);
  const max = digits(maxValue);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return '';
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : Infinity;
  const hit = buckets.find(([, bLo, bHi]) => lo >= bLo && hi <= bHi);
  return hit ? hit[0] : '';
}

function mapSalary(salaryMin, salaryMax) {
  return bucketFor(SALARY_BUCKETS, salaryMin, salaryMax);
}

function mapAge(ageMin, ageMax) {
  return bucketFor(AGE_BUCKETS, ageMin, ageMax);
}

function mapGender(gender) {
  if (gender === 'ชาย' || gender === 'M') return 'M';
  if (gender === 'หญิง' || gender === 'F') return 'F';
  return '';
}

const LATEST_SORT_LABEL_RE = /วันที่\s*(?:แก้ไข|อัปเดต|อัพเดต|อัพเดท|ปรับปรุง)\s*ล่าสุด|(?:แก้ไข|อัปเดต|อัพเดต|อัพเดท)\s*ล่าสุด/u;

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sortSelects($) {
  return $('#mainsort, #mainsort2, #MainSort, select[name="sort"], select#sort, select[id*="sort" i], select[name*="sort" i]');
}

function selectedOption($sel) {
  const marked = $sel.find('option:selected').first();
  return marked.length ? marked : $sel.find('option').first();
}

export function describeJobThaiSortState(html) {
  const $ = cheerio.load(html);
  const selects = sortSelects($);
  if (!selects.length) return 'ไม่พบกล่องเรียงลำดับ (#mainsort/sort) ในหน้าผลค้นหา';
  const parts = [];
  selects.each((index, el) => {
    const $sel = $(el);
    const selected = selectedOption($sel);
    parts.push(
      `#${index + 1} id=${$sel.attr('id') || '-'} name=${$sel.attr('name') || '-'} `
      + `selected="${cleanText(selected.text())}" value="${String(selected.attr('value') ?? '')}"`,
    );
  });
  return parts.join(' · ');
}

export function isLatestUpdatedSortSelected(html) {
  const $ = cheerio.load(html);
  for (const el of sortSelects($).toArray()) {
    const selected = selectedOption($(el));
    if (!selected.length) continue;
    if (LATEST_SORT_LABEL_RE.test(cleanText(selected.text()))) return true;
  }
  const hidden = $('input[name="sort"]').first();
  if (hidden.length && String(hidden.attr('value') ?? '') === '') {
    if ($('option').toArray().some((opt) => LATEST_SORT_LABEL_RE.test(cleanText($(opt).text())))) {
      return true;
    }
  }
  return false;
}

export function extractJobThaiUpdateLabels(html) {
  const $ = cheerio.load(html);
  const labels = [];
  const seen = new Set();
  $('a[href*="/resume/"]').each((_, el) => {
    const $el = $(el);
    const href = String($el.attr('href') || '');
    const id = (href.match(/\/resume\/\d+,(\d+)/) || [])[1] || href;
    if (!id || seen.has(id)) return;
    seen.add(id);

    // Prefer a card/row that contains exactly this resume link, so we do not
    // collapse the whole result page into one label.
    let scope = $el.closest('tr, li, article, .resume, .card');
    if (!scope.length) {
      let cur = $el.parent();
      for (let i = 0; i < 6 && cur.length; i += 1) {
        const links = cur.find('a[href*="/resume/"]').length;
        if (links === 1) {
          scope = cur;
          break;
        }
        if (links > 1) break;
        cur = cur.parent();
      }
    }
    const text = cleanText((scope.length ? scope : $el).text());
    const match = text.match(/(?:แก้ไข|อัปเดต|อัพเดท|ปรับปรุง)\s*[:：]?\s*[^\s].{0,40}/u)
      || text.match(/\d{1,2}\s*[ก-๙.]+\.?\s*\d{2,4}/u)
      || text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    if (match) labels.push(match[0]);
  });
  return labels;
}

export function listLooksNewestFirst(html) {
  const labels = extractJobThaiUpdateLabels(html);
  return labels.length >= 2 && isDescendingLatest(labels);
}

export function confirmLatestUpdatedOrder(html) {
  if (isLatestUpdatedSortSelected(html)) return { ok: true, via: 'sort_control' };
  if (listLooksNewestFirst(html)) return { ok: true, via: 'list_dates' };
  return { ok: false, via: 'none', detail: describeJobThaiSortState(html) };
}

export function normalizeUpdatedSince(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`updatedSince ต้องเป็น YYYY-MM-DD แต่ได้รับ "${text}"`);
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`updatedSince ไม่ใช่วันที่จริง: "${text}"`);
  }
  return text;
}

/** ช่อง "อัปเดตภายใน" ของ JobThai รับได้แค่ค่าเหล่านี้ (วัน) — ไม่ส่งเลยเว็บจะใช้ 1 สัปดาห์ */
const TIME_WINDOWS = [3, 7, 30, 90, 180, 365];
const DEFAULT_TIME_WINDOW_DAYS = 30;

export function timeWindowValue(days) {
  const n = digits(days);
  const want = Number.isFinite(n) && n > 0 ? n : DEFAULT_TIME_WINDOW_DAYS;
  return String(TIME_WINDOWS.find((w) => w >= want) ?? TIME_WINDOWS[TIME_WINDOWS.length - 1]);
}

/** ใบงานบางใบใส่หลายตำแหน่งในช่องเดียว (ขึ้นบรรทัดใหม่, จุลภาค, "หรือ") — ค้นทีละตำแหน่ง */
export function splitPositions(position) {
  if (!hasValue(position)) return [''];
  const parts = String(position)
    .split(/\r?\n|,|，|\s+หรือ\s+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)] : [''];
}

export function buildSearchUrl(criteria, page = 1) {
  const updatedSince = normalizeUpdatedSince(criteria.updatedSince);
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
    sort: '',
  });
  if (updatedSince) {
    p.set('time', '65535');
    p.set('theDate', updatedSince);
  } else {
    p.set('time', timeWindowValue(criteria.updatedWithinDays));
  }
  if (page > 1) p.set('page', String(page));
  return `${SEARCH}?${p.toString()}`;
}

async function getText(request, url, runtime = {}) {
  return withRetry(async () => {
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
  }, { debug: runtime.debug, label: 'GET', retries: 3 });
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

export async function searchResumeIds(session, criteria, runtime) {
  const request = session?.request ?? session;
  const need = criteria.maxCandidates;
  const ids = [];
  const seen = new Set();
  let pagesScanned = 0;
  const positions = splitPositions(criteria.position);

  for (const position of positions) {
    if (ids.length >= need) break;
    let url = buildSearchUrl({ ...criteria, position });
    let pagesForPosition = 0;
    while (ids.length < need && url) {
      pagesScanned += 1;
      pagesForPosition += 1;
      const html = await getText(request, url, runtime);
      if (pagesForPosition === 1) {
        const order = confirmLatestUpdatedOrder(html);
        if (!order.ok) {
          // Web runs must still return cards. We already request JobThai's default
          // latest sort (`sort=`). Missing #mainsort must not abort the job.
          console.warn(`[jobthai] sort unverified (${order.detail}); continuing with requested default latest sort`);
        } else if (order.via === 'list_dates' && runtime?.debug) {
          console.warn('[jobthai] sort control unclear; accepted newest-first list dates');
        }
      }
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
    if (ids.length < need && positions.length > 1) await sleep(requestGapMs(runtime));
  }

  return { ids: ids.slice(0, need), totalAvailable: null, pagesScanned };
}

export function resumeDetailUrl(id) {
  return `${BASE}/resume/0,${id}.html`;
}

export async function fetchResumeHtml(session, id, runtime = {}) {
  const request = session?.request ?? session;
  return getText(request, resumeDetailUrl(id), runtime);
}

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
