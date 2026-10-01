import * as cheerio from 'cheerio';
import { extractLineId, validLineId } from '../../core/contacts.js';

const BASE = 'https://www.jobbkk.com';

const THAI_NAME_PREFIXES = [
  'นางสาว', 'Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'ดร.',
  'น.ส.', 'น.ส', 'ด.ช.', 'ด.ญ.', 'ดช.', 'ดญ.', 'นาย', 'นาง',
];

const CONTACT_ICON_MAP = {
  'phone.svg': 'phone',
  'mail.svg': 'email',
  'line.svg': 'line_id',
  'facebook.svg': 'facebook',
  'location.png': 'address',
};

const SITE_PHONE_BLACKLIST = new Set(['025147474', '025147447']);
const SITE_EMAIL_BLACKLIST = new Set(['help@jobbkk.com', 'sales@jobbkk.com']);

const clean = (v) => (v == null ? '' : String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim());

function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = String(text).match(p);
    if (m?.[1]) return clean(m[1]);
  }
  return '';
}

function toAbsolute(href) {
  try {
    return new URL(href, BASE).href;
  } catch {
    return href;
  }
}

function isSitePhone(p) {
  return SITE_PHONE_BLACKLIST.has(String(p ?? '').replace(/\D/g, ''));
}
function isSiteEmail(e) {
  return SITE_EMAIL_BLACKLIST.has(String(e ?? '').trim().toLowerCase());
}

/**
 * Strict email validation. Critical for dedupe: a non-email value (e.g. a
 * label or page-wide footer text) that slips into the email field would be
 * identical across resumes and wrongly merge distinct candidates.
 */
function validEmail(v) {
  const e = String(v ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) return '';
  if (isSiteEmail(e) || /@jobbkk\.com$/i.test(e)) return '';
  return e;
}

function normalizePhone(value) {
  const digits = clean(value).replace(/\D/g, '');
  if (isSitePhone(digits)) return '';
  return digits || clean(value);
}
const stripLeadingDash = (v) => clean(v).replace(/^[-–—]\s*/, '');

function splitThaiFullName(fullName) {
  let parts = clean(fullName).split(/\s+/).filter(Boolean);
  let prefix = '';
  if (parts.length) {
    const sorted = [...THAI_NAME_PREFIXES].sort((a, b) => b.length - a.length);
    for (const c of sorted) {
      if (parts[0] === c || parts[0].startsWith(c)) {
        prefix = parts.shift();
        break;
      }
    }
  }
  const first_name = parts[0] ?? '';
  const last_name = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const name = [prefix, first_name, last_name].filter(Boolean).join(' ');
  return { prefix, first_name, last_name, name };
}

function extractPhoneFromText(text) {
  return firstMatch(text, [/(?:เบอร์|โทร|Tel|Phone)\s*[:.]?\s*([0-9\-]{9,15})/iu, /\b(0\d[\d\-]{8,12})\b/]);
}
function extractEmailFromText(text) {
  const e = firstMatch(text, [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i]);
  return isSiteEmail(e) ? '' : e;
}
function extractLineFromText(text) {
  // strict: require an id-shaped token near a LINE context (no English-prose "Line")
  return extractLineId(text);
}
function extractAge(text) {
  const paren = String(text).match(/\((\d{1,2})\s*ปี\)/u);
  if (paren?.[1]) return paren[1];
  return firstMatch(text, [/(?:อายุ|Age)\s*[:\-]?\s*(\d{1,2})\s*(?:ปี|years?)?/iu]);
}
function extractBirthDate(text) {
  return firstMatch(text, [/(?:วันเกิด|Birth(?:day| Date)?)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/iu, /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/]);
}

function extractProvinceFromAddress(address) {
  const text = clean(address);
  if (!text) return '';
  const before = text.replace(/\s*ประเทศไทย\s*$/u, '').trim();
  const m = before.match(/([ก-๙a-zA-Z][ก-๙a-zA-Z\s./-]*?)\s+(\d{5})\s*$/u);
  if (m?.[1]) {
    const parts = m[1].trim().split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    if (last && last !== 'ประเทศไทย') return last;
  }
  return firstMatch(text, [/จังหวัด\s*([^\s,]+)/u, /([ก-๙]+มหานคร)/u]);
}

function emptyRecord() {
  return {
    prefix: '', name: '', first_name: '', last_name: '',
    profile_image_url: '', profile_image_local: '', profile_image_download_status: 'pending',
    phone: '', email: '', line_id: '', facebook: '', address: '', intro: '',
    desired_positions: '', desired_work_area: '', job_type: '', expected_salary: '', available_start: '',
    education: [], work_experience: [], education_summary: '', experience_summary: '',
    gender: '', age: '', birth_date: '', nationality: '', religion: '', height: '', weight: '',
    marital_status: '', military_status: '', vehicle: '', driving_license: '', driving_ability: '',
    hard_skills: [], soft_skills: [], language_skills: [], typing_skills: '',
    attachments: [], province: '', raw_text: '',
  };
}

// ---- section helpers (cheerio) ----
function listText($, sel) {
  const out = [];
  $(sel).each((_, el) => {
    const t = clean($(el).text());
    if (t) out.push(t);
  });
  return out;
}

function extractContactsByIcon($) {
  const contacts = { phone: '', email: '', line_id: '', facebook: '', address: '' };
  $('.contact-detail .data-member-detail').each((_, row) => {
    const src = ($(row).find('img').first().attr('src') ?? '').toLowerCase();
    const text = clean($(row).text());
    for (const [icon, field] of Object.entries(CONTACT_ICON_MAP)) {
      if (src.includes(icon.toLowerCase()) && !contacts[field]) {
        contacts[field] = field === 'phone' ? normalizePhone(text) : field === 'address' ? stripLeadingDash(text) : text;
      }
    }
  });
  return contacts;
}

/** Label/value map from #rsm-info boxes (.js-info-detail-box: <p>label</p><div><p>value</p></div>). */
function infoMap($) {
  const map = {};
  $('#rsm-info .js-info-detail-box').each((_, box) => {
    const label = clean($(box).find('p').first().text()).replace(/:$/, '');
    const value = clean($(box).find('div').last().text());
    if (label) map[label] = value;
  });
  return map;
}

/**
 * Find a label element inside `scopeSel` whose own text equals `label`
 * (with/without trailing ":") and return the next sibling's text.
 * Handles both <p>label</p><p>value</p> and <span>label</span><span>value</span>.
 */
function fieldByLabel($, scopeSel, label) {
  let val = '';
  $(`${scopeSel} p, ${scopeSel} span, ${scopeSel} li`).each((_, el) => {
    if (val) return;
    const t = clean($(el).text()).replace(/:$/, '');
    if (t === label) {
      const nx = $(el).next();
      if (nx.length) val = clean(nx.text());
    }
  });
  return val;
}

const LANG_LEVELS = ['ดีมาก', 'ดี', 'พอใช้', 'เบื้องต้น', 'เล็กน้อย', 'ไม่ได้'];

/**
 * JobBKK renders the language table as one flat blob:
 *   "ทักษะทางภาษา การพูด การฟัง การอ่าน การเขียน ไทย ดีมาก ดีมาก ดีมาก ดีมาก อังกฤษ …"
 * Turn it into one readable entry per language.
 */
export function parseLanguageSkills(raw) {
  const text = clean(raw).replace(/^ทักษะทางภาษา\s*(?:การพูด\s*การฟัง\s*การอ่าน\s*การเขียน\s*)?/u, '');
  if (!text) return [];
  const toks = text.split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < toks.length) {
    if (LANG_LEVELS.includes(toks[i])) { i += 1; continue; }
    const lang = toks[i];
    i += 1;
    const lv = [];
    while (i < toks.length && LANG_LEVELS.includes(toks[i]) && lv.length < 4) { lv.push(toks[i]); i += 1; }
    out.push(lv.length ? `${lang} (พูด:${lv[0] || '-'} ฟัง:${lv[1] || '-'} อ่าน:${lv[2] || '-'} เขียน:${lv[3] || '-'})` : lang);
  }
  return out;
}

/** Desired positions from #rsm-request list (each <li>: <p>ตำแหน่ง:</p><p>value</p>). */
function desiredPositions($) {
  const out = [];
  $('#rsm-request .list-style-number > li').each((_, li) => {
    $(li).find('p').each((__, p) => {
      if (clean($(p).text()).replace(/:$/, '') === 'ตำแหน่ง') {
        // cut off the next field that sometimes bleeds in ("… 2. สาขาอาชีพ : …")
        const v = clean($(p).next('p').text()).split(/\s+\d+\.\s|\s*สาขาอาชีพ|\s*ระดับเงินเดือน|\s*ระดับ\b/u)[0].trim();
        if (v) out.push(v);
      }
    });
  });
  return out.join(', ');
}

function extractEducation($) {
  const out = [];
  $('.education-data').each((_, block) => {
    const $b = $(block);
    const acad = clean($b.find('.academic-name p, .academic-name').first().text());
    let graduation_year = '';
    let institution = acad;
    const m = acad.match(/^(\d{4})\s*-\s*(.+)$/);
    if (m) { graduation_year = m[1]; institution = clean(m[2]); }
    const tail = clean($b.find('.con-ios').last().text()); // "เกรดเฉลี่ย 2.32 - ปริญญาตรี"
    const gpa = (tail.match(/เกรดเฉลี่ย\s*([\d.]+)/) || [])[1] || '';
    const degree = (tail.match(/-\s*([^-]+)$/) || [])[1]?.trim() || '';
    // faculty/major scoped to THIS block (label span → value span)
    const pairs = {};
    $b.find('span').each((__, el) => {
      const t = clean($(el).text()).replace(/:$/, '');
      if (t === 'คณะ' || t === 'สาขา') pairs[t] = clean($(el).next().text());
    });
    const item = {
      institution,
      graduation_year,
      degree,
      faculty: pairs['คณะ'] || '',
      major: pairs['สาขา'] || '',
      gpa,
    };
    if (item.institution || item.degree || item.major) out.push(item);
  });
  return out;
}

function extractWork($) {
  const out = [];
  $('.sub-experience').each((_, block) => {
    const $b = $(block);
    const grid = {};
    $b.find('ul.exp-grid li.font-DB-HeaventRounded-Bold').each((__, lbl) => {
      const key = clean($(lbl).text()).replace(/:$/, '');
      grid[key] = clean($(lbl).next('li').text());
    });
    const period = clean($b.find('.company-work-start').first().text());
    const item = {
      company: clean($b.find('.company-name p, .company-name').first().text()),
      position: grid['ตำแหน่งงาน'] || '',
      salary: grid['เงินเดือน(บาท)'] || grid['เงินเดือน'] || '',
      business_type: grid['ประเภทธุรกิจ'] || '',
      period,
      year: (period.match(/(\d{4})/) || [])[1] || '',
      responsibilities: $b
        .find('.list-style-disc li')
        .map((__, li) => clean($(li).text()))
        .get()
        .filter(Boolean)
        .join('\n'),
    };
    if ((item.company || item.position) && !isJunkWorkRow(item)) out.push(item);
  });
  return out;
}

/** JobBKK login/register i18n + footer chrome that must never become work history. */
const JOBBKK_SITE_CHROME_RE = /register_page|username_hint|max_case|no_html|no_symbols|symbol_casepassword|invalid_characters_password|invalid_email|must_be_greater_than|register_success|register_failed|employer_login|data_enter_system|data_company|help@jobbkk\.com|sales@jobbkk\.com|บริษัท\s*จัดหางาน\s*จ๊อบบีเคเค|JOBBKK\.COM|ไม่อนุญาตให้ใช้|คุณจะไม่สามารถเข้าสู่ระบบ|สมัครสมาชิกไม่สำเร็จ|สำหรับผู้ประกอบการเท่านั้น|Resume\s*-\s*View\s*Credit|Credit\s*ที่ใช้แล้ว|สามารถดูหรือติดต่อได้/iu;

/** Drop login/register chrome that sometimes lands inside body.innerText. */
export function stripJobbkkSiteChrome(text) {
  let out = String(text ?? '');
  if (!out) return '';
  // Key/value i18n pairs: "max_case":"{name} ต้องไม่เกิน..."
  out = out.replace(/\\?"[a-z_][a-z0-9_]*\\?"\s*:\s*\\?"(?:[^"\\]|\\.){0,400}\\?"/giu, ' ');
  // Nested register_page / login_page objects
  // Only the object opener — never scan forward with [^}] (unclosed JSON would eat the resume).
  out = out.replace(/\\?"(?:register_page|login_page|section_subtitle)\\?"\s*:\s*\{\s*,?\s*/giu, ' ');
  out = out.replace(/\{\s*\\?"(?:register_page|max_case|username_hint|login_page)\\?"\s*:\s*/giu, ' ');
  out = out.replace(/\b(?:register_page|username_hint|max_case|no_html|no_symbols|symbol_casepassword|invalid_email|register_success|register_failed|employer_login|data_enter_system|data_company)\b/giu, ' ');
  out = out.replace(/ที่กำหนด\s*คุณจะไม่สามารถเข้าสู่ระบบได้/giu, ' ');
  // Footer only — do not span past the JobBKK contact line into resume body.
  out = out.replace(/บริษัท\s*จัดหางาน\s*จ๊อบบีเคเค[^.]{0,240}?(?:help@jobbkk\.com|sales@jobbkk\.com)/giu, ' ');
  out = out.replace(/(?:help|sales)@jobbkk\.com/giu, ' ');
  out = out.replace(/ฝ่ายบริการลูกค้า\s*:[^\n]{0,200}/giu, ' ');
  out = out.replace(/สร้างเรซูเม่ สำหรับสมัครงานฟรี[^\n]{0,120}/giu, ' ');
  out = out.replace(/ลงประกาศรับสมัครงาน สำหรับผู้ประกอบการเท่านั้น[^\n]{0,200}/giu, ' ');
  // Employer resume-credit meter leaked into body/work text.
  out = out.replace(/สามารถดูหรือติดต่อได้\s*[:：]?[\s\S]*$/iu, ' ');
  out = out.replace(/Resume\s*-\s*View\s*Credit[\s\S]*$/iu, ' ');
  out = out.replace(/Credit\s*ที่ใช้แล้ว[^\n]{0,200}/giu, ' ');
  out = out.replace(/[{}\[\]]+/g, ' ');
  out = out.replace(/\\+"/g, ' ');
  return clean(out);
}

export function isJobbkkSiteChromeText(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return false;
  const stripped = stripJobbkkSiteChrome(raw);
  const chromeHits = JOBBKK_SITE_CHROME_RE.test(raw)
    || (raw.match(/\\?"[a-z_]+\\?"\s*:\s*\\?"/g) || []).length >= 3;
  if (!chromeHits) return false;
  // Mixed blobs: after strip, if almost nothing left (or no real job markers), treat as chrome.
  if (stripped.length < 24) return true;
  if (!/(?:ข้อมูลบริษัท|(?<!ข้อมูล)บริษัท\s*[:：]|ตำแหน่ง(?:งาน)?\s*[:：])/u.test(stripped)
      && stripped.length < Math.max(40, raw.length * 0.45)) {
    return true;
  }
  // Still contains chrome markers after strip → reject
  return JOBBKK_SITE_CHROME_RE.test(stripped);
}

/** True when company/position still contain glued labels or credit-meter chrome. */
export function isMangledWorkRow(item) {
  const company = clean(item?.company);
  const position = clean(item?.position);
  const responsibilities = clean(item?.responsibilities);
  const head = `${company} ${position}`.trim();
  if (!head) return false;
  if (/Resume\s*-\s*View\s*Credit|Credit\s*ที่ใช้แล้ว|สามารถดูหรือติดต่อได้/i.test(head)) return true;
  if (/Resume\s*-\s*View\s*Credit|Credit\s*ที่ใช้แล้ว|สามารถดูหรือติดต่อได้/i.test(responsibilities)) return true;
  // Field labels that belong in other columns leaked into company/position.
  if (/เงินเดือน\s*\(?บาท\)?\s*[:：]?|ประเภทธุรกิจ\s*[:：]|รายละเอียดงาน|หน้าที่-ผลงาน|ระยะเวลา\s*[:：]/u.test(head)) return true;
  if (/ตำแหน่ง(?:งาน)?\s*[:：]/u.test(company) || /^ตำแหน่ง(?:งาน)?\s+/u.test(company)) return true;
  // Duties dumped into company (long prose, no company cue near the start).
  if (company.length > 140 && !/(?:บริษัท|จำกัด|มหาชน|Co\.?\s*Ltd|Limited|Inc\.?)/i.test(company.slice(0, 48))) {
    return true;
  }
  // Position swallowed the whole job block.
  if (position.length > 160 && /(?:หน้าที่|รายละเอียด|เงินเดือน|ประเภทธุรกิจ)/u.test(position)) return true;
  return false;
}

/**
 * Rebuild one mangled work row by re-splitting glued labels from company/position text.
 * Returns null when nothing useful remains.
 */
export function normalizeWorkRow(item) {
  if (!item || typeof item !== 'object') return null;
  const parts = [
    item.company, item.position, item.period, item.salary,
    item.business_type, item.responsibilities, item.year,
  ].map(clean).filter(Boolean);
  let blob = parts.join(' ');
  blob = stripJobbkkSiteChrome(blob);
  if (!blob) return null;
  // Insert separators so label regexes can cut glued Thai/ASCII blocks.
  blob = blob
    .replace(/ตำแหน่ง(?:งาน)?\s*[:：]?/gu, ' ตำแหน่งงาน : ')
    .replace(/ข้อมูลบริษัท\s*[:：]?/gu, ' ข้อมูลบริษัท : ')
    .replace(/(?<!ข้อมูล)บริษัท\s*[:：]/gu, ' บริษัท : ')
    .replace(/เงินเดือน\s*\(?บาท\)?\s*[:：]?/gu, ' เงินเดือน : ')
    .replace(/ประเภทธุรกิจ\s*[:：]?/gu, ' ประเภทธุรกิจ : ')
    .replace(/ระยะเวลา\s*[:：]?/gu, ' ระยะเวลา : ')
    .replace(/รายละเอียดงาน/gu, ' รายละเอียดงาน ')
    .replace(/หน้าที่-ผลงาน/gu, ' รายละเอียดงาน ')
    .replace(/ที่อยู่\s*[:：]?/gu, ' ที่อยู่ : ');
  blob = clean(blob);
  // Text before ตำแหน่งงาน is usually the employer when labels were glued without ข้อมูลบริษัท.
  const unlabeledCompany = clean(blob.match(/^(.*?)(?=\s*ตำแหน่ง(?:งาน)?\s*[:：])/u)?.[1] || '')
    .replace(/^(?:ข้อมูลบริษัท|บริษัท)\s*[:：]?\s*/u, '');
  const parsed = parseOneWorkChunk(
    unlabeledCompany && !/(?:ข้อมูลบริษัท|(?<!ข้อมูล)บริษัท\s*[:：])/u.test(blob)
      ? `ข้อมูลบริษัท : ${unlabeledCompany} ${blob}`
      : blob,
  );
  if (parsed && !isMangledWorkRow(parsed) && !isJunkWorkRow(parsed)) {
    if (!clean(parsed.company) && unlabeledCompany && unlabeledCompany.length <= 120) {
      parsed.company = unlabeledCompany;
    }
    if (!isMangledWorkRow(parsed)) return parsed;
  }
  // Fallback: keep short company/position heads before the first glued label.
  let company = clean(item.company)
    .replace(/ตำแหน่ง(?:งาน)?\s*[:：]?[\s\S]*$/u, '')
    .replace(/เงินเดือน[\s\S]*$/u, '')
    .replace(/ประเภทธุรกิจ[\s\S]*$/u, '')
    .replace(/รายละเอียดงาน[\s\S]*$/u, '')
    .replace(/หน้าที่-ผลงาน[\s\S]*$/u, '');
  let position = clean(item.position)
    .replace(/สามารถดูหรือติดต่อได้[\s\S]*$/iu, '')
    .replace(/Resume\s*-\s*View\s*Credit[\s\S]*$/iu, '')
    .replace(/เงินเดือน[\s\S]*$/u, '')
    .replace(/ประเภทธุรกิจ[\s\S]*$/u, '')
    .replace(/รายละเอียดงาน[\s\S]*$/u, '')
    .replace(/หน้าที่-ผลงาน[\s\S]*$/u, '')
    .replace(/ระยะเวลา[\s\S]*$/u, '');
  // "Trainee โรงแรมอครา … ตำแหน่ง Trainee" → company from mid text, short position.
  const posLabel = position.match(/^(.*?)\s+ตำแหน่ง\s+(.+)$/u);
  if (posLabel) {
    const before = clean(posLabel[1]);
    const after = clean(posLabel[2]);
    if (after && after.length <= 80) position = after;
    if (!company && before) company = before.replace(/^ตำแหน่ง\s+/u, '');
  }
  if (!company && unlabeledCompany && unlabeledCompany.length <= 120) company = unlabeledCompany;
  // "เสิร์ฟ โอโตยะ" / "ตำแหน่ง ผู้จัดการโรงงาน" leftovers
  company = clean(company).replace(/^ตำแหน่ง(?:งาน)?\s+/u, '');
  position = clean(position);
  if (!position && company && company.length <= 60) {
    // company field held only a position label
    const maybePos = clean(item.company).match(/^ตำแหน่ง(?:งาน)?\s+(.+)$/u)?.[1];
    if (maybePos && maybePos.length <= 80) {
      position = clean(maybePos).replace(/เงินเดือน[\s\S]*$/u, '');
      company = '';
    }
  }
  const out = {
    year: clean(item.year) || '',
    company,
    position,
    period: clean(item.period) || '',
    salary: clean(item.salary) || firstMatch(blob, [/เงินเดือน\s*[:：]?\s*([\d,]+)/u]) || '',
    business_type: clean(item.business_type)
      || firstMatch(blob, [/ประเภทธุรกิจ\s*[:：]?\s*(.+?)(?=\s*(?:ระยะเวลา|เงินเดือน|รายละเอียดงาน|ที่อยู่|$))/u])
      || '',
    responsibilities: clean(item.responsibilities)
      || firstMatch(blob, [/รายละเอียดงาน\s*(.+)$/u])
      || '',
  };
  if (!out.company && !out.position) return null;
  if (isMangledWorkRow(out) || isJunkWorkRow(out)) return null;
  return out;
}

/** Normalize mangled rows; drop chrome-only rows. */
export function sanitizeWorkExperience(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    let next = row;
    if (isMangledWorkRow(row)) next = normalizeWorkRow(row);
    if (!next || isJunkWorkRow(next) || isMangledWorkRow(next)) continue;
    const company = clean(next.company);
    const position = clean(next.position);
    if (!company && !position) continue;
    const key = `${company}|${position}|${clean(next.year)}|${clean(next.period)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

export function isJunkWorkRow(item) {
  const company = clean(item?.company);
  const position = clean(item?.position);
  const responsibilities = clean(item?.responsibilities);
  const blob = [company, position, responsibilities].filter(Boolean).join(' ');
  if (!blob) return true;
  if (isJobbkkSiteChromeText(blob)) return true;
  if (/จ๊อบบีเคเค|jobbkk\.com/i.test(company)) return true;
  if (/Resume\s*-\s*View\s*Credit|Credit\s*ที่ใช้แล้ว|สามารถดูหรือติดต่อได้/i.test(`${company} ${position}`)) return true;
  // Position/company that is clearly a validation sentence, not a job title
  if (/ต้องไม่เกิน|ต้องมากกว่า|รูปแบบอีเมล|รหัสผ่านต้อง|ไม่อนุญาต/u.test(`${company} ${position}`)) return true;
  return false;
}

/** True when at least one work row has a company or position the desk can show. */
export function hasUsefulWorkExperience(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  return sanitizeWorkExperience(rows).some((item) => {
    const company = clean(item?.company);
    const position = clean(item?.position);
    return Boolean(company || position);
  });
}

export function isJunkEducationRow(item) {
  const blob = [item?.institution, item?.faculty, item?.major, item?.degree]
    .map(clean).filter(Boolean).join(' ');
  if (!blob) return true;
  if (/JOBBKK\.COM|JOBBKK\s*TEST|เทสระบบสมัครงาน/i.test(blob)) return true;
  if (/register_page|username_hint|max_case|help@jobbkk/i.test(blob)) return true;
  return false;
}

/** True when education rows have institution/degree/major. */
export function hasUsefulEducation(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.some((item) => {
    if (isJunkEducationRow(item)) return false;
    return Boolean(clean(item?.institution) || clean(item?.degree) || clean(item?.major));
  });
}

const WORK_FIELD_STOP = '(?=\\s*(?:ข้อมูลบริษัท|ประเภทธุรกิจ|ตำแหน่ง(?:งาน)?|ระยะเวลา|เงินเดือน|รายละเอียดงาน|Hard Skills|Soft Skills|ทักษะความรู้|ข้อมูลการฝึกอบรม|$))';

function parseOneWorkChunk(chunk) {
  const text = stripJobbkkSiteChrome(chunk);
  if (!text || isJobbkkSiteChromeText(text)) return null;
  if (/ไม่มีประสบการณ์/u.test(text)) {
    return {
      year: '', company: '', position: 'ไม่มีประสบการณ์', period: '', salary: '', business_type: '', responsibilities: '',
    };
  }
  const position = firstMatch(text, [
    new RegExp(`ตำแหน่ง(?:งาน)?\\s*[:：]?\\s*(.+?)${WORK_FIELD_STOP}`, 'u'),
  ]);
  const company = firstMatch(text, [
    new RegExp(`ข้อมูลบริษัท\\s*[:：]?\\s*(.+?)${WORK_FIELD_STOP}`, 'u'),
    new RegExp(`(?<!ข้อมูล)บริษัท\\s*[:：]?\\s*(.+?)${WORK_FIELD_STOP}`, 'u'),
  ]);
  const companyClean = clean(company).replace(/^[:：]+/, '');
  if (!position && !companyClean) return null;
  if (!position && companyClean.length < 2) return null;
  const row = {
    year: firstMatch(text, [/\b(20\d{2}|25\d{2})\b/]) || '',
    company: companyClean || '',
    position: position || '',
    period: firstMatch(text, [new RegExp(`ระยะเวลา\\s*[:：]?\\s*(.+?)${WORK_FIELD_STOP}`, 'u')]) || '',
    salary: firstMatch(text, [/เงินเดือน\s*[:：]?\s*([\d,]+)/u]) || '',
    business_type: firstMatch(text, [new RegExp(`ประเภทธุรกิจ\\s*[:：]?\\s*(.+?)${WORK_FIELD_STOP}`, 'u')]) || '',
    responsibilities: firstMatch(text, [/รายละเอียดงาน\s*[:：]?\s*(.+)$/u]) || '',
  };
  return isJunkWorkRow(row) ? null : row;
}

function splitWorkChunks(work) {
  const labeled = work.split(/(?=ข้อมูลบริษัท\s*[:：]?)/u).map(clean).filter((chunk) => chunk.length >= 6);
  if (labeled.length > 1) return labeled;
  const byYear = work
    .split(/(?=\b(?:20\d{2}|25\d{2})\b\s+(?:ข้อมูลบริษัท|(?<!ข้อมูล)บริษัท)\s*[:：]?)/u)
    .map(clean)
    .filter((chunk) => chunk.length >= 6);
  if (byYear.length > 1) return byYear;
  return [work];
}

/** Split a JobBKK work section into one-or-more structured rows. */
export function parseWorkEntriesFromText(workText) {
  const work = stripJobbkkSiteChrome(workText);
  if (!work || work.length < 4) return [];
  // Whole section was login/register chrome (no recoverable job markers).
  if (isJobbkkSiteChromeText(workText) && !/(?:ข้อมูลบริษัท|(?<!ข้อมูล)บริษัท\s*[:：]|ตำแหน่ง(?:งาน)?\s*[:：])/u.test(work)) {
    return [];
  }
  if (/ไม่มีประสบการณ์/u.test(work) && !/(?:ข้อมูลบริษัท|(?<!ข้อมูล)บริษัท|ตำแหน่ง)/u.test(work)) {
    return [parseOneWorkChunk(work)].filter(Boolean);
  }
  const rows = splitWorkChunks(work).map(parseOneWorkChunk).filter(Boolean);
  // Dedupe identical company+position pairs while keeping order.
  const seen = new Set();
  return rows.filter((row) => {
    if (isJunkWorkRow(row)) return false;
    const key = `${row.company}|${row.position}|${row.year}|${row.period}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Read a labelled value inside a preview_new timeline block.
 * Handles "label: value", "<span>label</span> value", and (detail) next <p>.
 */
function readFieldIn($, block, labels, detail = false) {
  let val = '';
  $(block).find('p').each((_, p) => {
    if (val) return;
    const text = clean($(p).text());
    for (const label of labels) {
      if (!text.includes(label)) continue;
      if (detail) {
        const sib = $(p).next('p');
        if (sib.length) { val = clean(sib.text()); return; }
      }
      const spanText = clean($(p).find('span').first().text());
      if (spanText && spanText.includes(label)) {
        const v = text.replace(spanText, '').replace(/^[\s:：]+/, '').trim();
        if (v) { val = v; return; }
      }
      const m = text.match(new RegExp(`${label}\\s*[:：]\\s*(.+)`));
      if (m?.[1]) { val = clean(m[1]); return; }
    }
  });
  return val;
}

/** preview_new layout education: .education .timeline-2 .content-2 (h5 = institution). */
function extractEducationPreviewNew($) {
  const out = [];
  $('.education .timeline-2 .content-2').each((_, block) => {
    const item = {
      institution: clean($(block).find('h5').first().text()),
      graduation_year: readFieldIn($, block, ['ปีที่จบการศึกษา', 'ปีที่จบ']),
      degree: readFieldIn($, block, ['วุฒิการศึกษา']),
      faculty: readFieldIn($, block, ['คณะวิชา', 'คณะ']),
      major: readFieldIn($, block, ['สาขา']),
      gpa: readFieldIn($, block, ['เกรด']),
    };
    if (item.institution || item.degree || item.major) out.push(item);
  });
  return out;
}

/** preview_new layout work: .skills / .experience timeline (h2 = year). */
function extractWorkPreviewNew($) {
  // preview_new timeline blocks under .experience / .work-experience

  const out = [];
  $('.skills .timeline-2 .content-2, .experience .timeline-2 .content-2, .work-experience .timeline-2 .content-2').each((_, block) => {
    const item = {
      year: clean($(block).find('h2').first().text()),
      company: readFieldIn($, block, ['ข้อมูลบริษัท', 'บริษัท']),
      business_type: readFieldIn($, block, ['ประเภทธุรกิจ']),
      position: readFieldIn($, block, ['ตำแหน่งงาน', 'ตำแหน่ง']),
      period: readFieldIn($, block, ['ระยะเวลา']),
      salary: readFieldIn($, block, ['เงินเดือน']),
      responsibilities: readFieldIn($, block, ['รายละเอียดงาน'], true),
    };
    // Year alone is not useful on the desk — it rendered as "—" and blocked text repair.
    if ((item.company || item.position) && !isJunkWorkRow(item)) out.push(item);
  });
  return out;
}

function summarizeEducation(edu) {
  return edu
    .map((i) => [i.institution, i.graduation_year && `ปีที่จบ ${i.graduation_year}`, i.degree, i.faculty, i.major, i.gpa && `เกรด ${i.gpa}`].filter(Boolean).join(' | '))
    .join(' || ');
}
function summarizeExperience(work) {
  return work
    .map((i) => [i.year, i.company && `บริษัท ${i.company}`, i.position && `ตำแหน่ง ${i.position}`, i.period].filter(Boolean).join(' '))
    .join(' || ');
}

function extractAttachments($) {
  const items = [];
  const seen = new Set();
  const selectors = [
    'a[href*="download_attach"]',
    'a[href*="download_professional_license"]',
    'a[href*="download_file"]',
    'a[href*="/resumes/download"]',
    'a[href*="attach"][href*="download"]',
  ].join(', ');
  $(selectors).each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const url = toAbsolute(href);
    if (!url || seen.has(url)) return;
    // Skip obvious non-file navigation.
    if (/login|logout|javascript:/i.test(url)) return;
    seen.add(url);
    let title = clean($(a).text()) || clean($(a).attr('title') ?? '') || clean($(a).attr('download') ?? '');
    if (!title) title = `attachment-${items.length + 1}`;
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    items.push({ title, source_url: url, file_id: parts[parts.length - 1] || 'file' });
  });
  return items;
}

function parseStatus(record, rawText) {
  if (!rawText) return 'failed';
  const hasContact = clean(record.phone) || clean(record.email);
  if (clean(record.name) && hasContact) return 'success';
  return 'partial';
}

/** True when the snapshot looks like a JobBKK shell — name only, missing profile body. */
export function isResumeProfileThin(parsed = {}) {
  const text = clean(parsed.raw_text);
  const hasName = clean(parsed.name) || clean(parsed.full_name);
  if (!hasName) return true;
  const hasContact = clean(parsed.phone) || clean(parsed.email);
  const hasGenderOrAge = clean(parsed.gender) || clean(parsed.age);
  const hasEdu = (Array.isArray(parsed.education) && parsed.education.length > 0) || clean(parsed.education_summary);
  const hasWork = hasUsefulWorkExperience(parsed.work_experience)
    || clean(parsed.experience_summary)
    || /ไม่มีประสบการณ์/u.test(text);
  if (hasContact && (hasEdu || hasWork || hasGenderOrAge)) return false;
  // Page text itself is still a shell
  if (text.length < 120) return true;
  return !(hasContact || hasGenderOrAge) || !(hasEdu || hasWork);
}

/**
 * Fill blank resume fields from stored / collapsed body text.
 * Safe to re-run on existing candidates — never overwrites a non-empty value.
 */
export function fillMissingFromRawText(record, rawText) {
  const text = stripJobbkkSiteChrome(rawText);
  if (!record || !text) return record || emptyRecord();

  const STOP = '(?=\\s*(?:ตำแหน่ง|พื้นที่ที่ต้องการ|เงินเดือน(?:ที่ต้องการ)?|ระยะเวลาเริ่มงาน|งานที่ต้องการ|ประวัติการศึกษา|ประวัติการทำงาน|เพศ|สถานภาพ|ส่วนสูง|น้ำหนัก|สัญชาติ|ศาสนา|Hard Skills|Soft Skills)|$)';
  const set = (key, value) => {
    if (clean(record[key])) return;
    const next = clean(value);
    if (next) record[key] = next;
  };

  set('phone', normalizePhone(extractPhoneFromText(text)));
  set('email', validEmail(extractEmailFromText(text)));
  if (!clean(record.line_id)) record.line_id = validLineId(extractLineFromText(text));
  set('gender', firstMatch(text, [/เพศ\s*[:：]?\s*(ชาย|หญิง)/u]));
  set('age', extractAge(text));
  set('birth_date', extractBirthDate(text));
  set('nationality', firstMatch(text, [new RegExp(`สัญชาติ\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('religion', firstMatch(text, [new RegExp(`ศาสนา\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('height', firstMatch(text, [/ส่วนสูง\s*[:：]?\s*([\d.]+)/u]));
  set('weight', firstMatch(text, [/น้ำหนัก\s*[:：]?\s*([\d.]+)/u]));
  set('marital_status', firstMatch(text, [new RegExp(`สถานะ(?:ภาพ)?(?:สมรส)?\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('military_status', firstMatch(text, [new RegExp(`สถานภาพทางทหาร\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('expected_salary', firstMatch(text, [/เงินเดือนที่ต้องการ\s*[:：]?\s*([\d,][\d,\s-]*\d)/u]));
  set('desired_work_area', firstMatch(text, [new RegExp(`พื้นที่ที่ต้องการทำงาน\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('available_start', firstMatch(text, [new RegExp(`ระยะเวลาเริ่มงาน\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('address', firstMatch(text, [new RegExp(`ที่อยู่ปัจจุบัน\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));
  set('job_type', firstMatch(text, [new RegExp(`(?:รูปแบบงาน|ประเภทงาน)\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]));

  if (!clean(record.desired_positions)) {
    const sec = text.match(/งานที่ต้องการ([\s\S]*?)ประวัติการศึกษา/u);
    if (sec?.[1]) {
      const positions = [...sec[1].matchAll(new RegExp(`ตำแหน่ง\\s*[:：]\\s*(.+?)${STOP}`, 'gu'))]
        .map((m) => clean(m[1]))
        .filter(Boolean);
      if (positions.length) record.desired_positions = [...new Set(positions)].join(', ');
    }
  }

  // Always materialize jsonb arrays when empty/weak — UI/PDF read arrays, not *_summary.
  // Year-only work stubs must be replaced; otherwise the desk shows "—" forever.
  if (!hasUsefulEducation(record.education)) {
    const edu = clean(record.education_summary)
      || firstMatch(text, [/ประวัติการศึกษา\s*([\s\S]*?)(?=ประวัติการทำงาน|ข้อมูลการฝึกอบรม|ทักษะ|$)/u]);
    if (edu && edu.length >= 8) {
      if (!clean(record.education_summary)) record.education_summary = edu;
      const degree = firstMatch(edu, [/(ปริญญาเอก|ปริญญาโท|ปริญญาตรี|ปวส\.?\/?อนุปริญญา|ปวช\.?|มัธยมศึกษาตอนปลาย|มัธยมศึกษาตอนต้น)/u]);
      const rows = [{
        institution: firstMatch(edu, [/(มหาวิทยาลัย[^\s]+|วิทยาลัย[^\s]+|โรงเรียน[^\s]+)/u]) || '',
        degree: degree || '',
        major: firstMatch(edu, [/สาขา(?:วิชา)?\s*[:：]?\s*([^\s]+)/u]) || '',
        faculty: firstMatch(edu, [/คณะ(?:วิชา)?\s*[:：]?\s*([^\s]+)/u]) || '',
        graduation_year: firstMatch(edu, [/(?:ปีที่จบ(?:การศึกษา)?|จบ)\s*[:：]?\s*(\d{4})/u, /\b(20\d{2}|25\d{2})\b/]) || '',
        gpa: firstMatch(edu, [/เกรด(?:เฉลี่ย)?\s*[:：]?\s*([\d.]+)/u]) || '',
      }].filter((item) => item.institution || item.degree || item.major);
      if (rows.length) record.education = rows;
    }
  }
  // Drop site-chrome / normalize glued company+position rows.
  if (Array.isArray(record.education) && record.education.length) {
    record.education = record.education.filter((row) => !isJunkEducationRow(row));
  }
  const hadMangledWork = Array.isArray(record.work_experience)
    && record.work_experience.some((row) => isMangledWorkRow(row));
  if (Array.isArray(record.work_experience) && record.work_experience.length) {
    record.work_experience = sanitizeWorkExperience(record.work_experience);
  }
  if (isJobbkkSiteChromeText(record.experience_summary)) {
    record.experience_summary = '';
  } else if (clean(record.experience_summary)) {
    record.experience_summary = stripJobbkkSiteChrome(record.experience_summary);
  }

  if (!hasUsefulWorkExperience(record.work_experience) || hadMangledWork) {
    const workRaw = clean(record.experience_summary)
      || firstMatch(text, [
        /ประวัติการทำงาน(?:\/ฝึกงาน)?\s*([\s\S]*?)(?=ข้อมูลการฝึกอบรม|ทักษะความรู้|Hard Skills|Soft Skills|$)/u,
        /ประวัติการทำงาน(?:\/ฝึกงาน)?\s*([\s\S]*?)(?=ทักษะ|Hard Skills|Soft Skills|$)/u,
      ]);
    const work = stripJobbkkSiteChrome(workRaw);
    if (work && work.length >= 4 && !isJobbkkSiteChromeText(work)) {
      if (!clean(record.experience_summary) || isJobbkkSiteChromeText(record.experience_summary)) {
        record.experience_summary = work;
      }
      const rows = parseWorkEntriesFromText(work);
      if (rows.length) {
        const cleaned = sanitizeWorkExperience(rows);
        if (cleaned.length && (!hasUsefulWorkExperience(record.work_experience) || hadMangledWork)) {
          record.work_experience = cleaned;
        }
      }
    }
  }

  if (clean(record.address) && !clean(record.province)) {
    record.province = extractProvinceFromAddress(record.address);
  }
  if (!clean(record.province) && clean(record.desired_work_area)) {
    record.province = firstMatch(record.desired_work_area, [/([ก-๙]+มหานคร|[ก-๙]+)/u]);
  }

  return record;
}

function labeledHeaderValues($, root) {
  const map = {};
  root.find('h5, .label, dt, th').each((_, el) => {
    const label = clean($(el).text()).replace(/:$/, '');
    if (!label) return;
    let value = stripLeadingDash($(el).nextAll('p, dd, td, span').first().text());
    if (!value) {
      const parentText = clean($(el).parent().text());
      value = stripLeadingDash(parentText.replace(label, '').replace(/^[\s:：]+/, ''));
    }
    if (value && !map[label]) map[label] = value;
  });
  return map;
}

/**
 * Parse a JobBKK resume detail HTML into a candidate record.
 * Handles both the classic (.rsm-name) and preview_new (h3.jobseeker-name) layouts.
 */
export function parseResumeHtml(html, { sourceUrl, index, focusPosition = '-' }) {
  const $ = cheerio.load(html);
  const rawText = clean($('body').text());
  const record = emptyRecord();

  const classicName = clean($('.rsm-name span').first().text());

  if (classicName) {
    record.name = classicName;
    record.profile_image_url = $('.img-profile').first().attr('src') ?? '';
    Object.assign(record, extractContactsByIcon($));
    record.intro = clean($('#introduce_yourself p:last-child, #rsm-introduce p').first().text());

    const info = infoMap($);
    record.gender = info['เพศ'] || '';
    record.nationality = info['สัญชาติ'] || '';
    record.religion = info['ศาสนา'] || '';
    record.height = info['ส่วนสูง'] || '';
    record.weight = info['น้ำหนัก'] || '';
    record.marital_status = info['สถานะ'] || '';
    record.military_status = info['สถานภาพทางทหาร'] || '';
    record.vehicle = info['ยานพาหนะที่มี'] || '';
    record.driving_license = info['ใบขับขี่'] || '';
    record.driving_ability = info['ความสามารถในการขับขี่'] || '';
    record.birth_date = extractBirthDate(info['วันเดือนปีเกิด'] || '');
    record.age = extractAge(info['วันเดือนปีเกิด'] || rawText);

    record.desired_positions = desiredPositions($);
    record.desired_work_area = fieldByLabel($, '#rsm-request', 'พื้นที่ที่ต้องการทำงาน');
    record.expected_salary = fieldByLabel($, '#rsm-request', 'เงินเดือน');
    record.job_type = fieldByLabel($, '#rsm-request', 'รูปแบบงาน') || fieldByLabel($, '#rsm-request', 'ประเภทงาน');
    record.available_start = fieldByLabel($, '#rsm-request', 'ระยะเวลาเริ่มงาน');

    record.hard_skills = listText($, '.hard-skill li, #rsm-hard-skill li');
    record.soft_skills = listText($, '.soft-skill li, #rsm-soft-skill li');
    record.language_skills = parseLanguageSkills(listText($, '.lang-skill, .language-skill li, .language-skill').join(' '));
    record.typing_skills = clean($('.lang-skill-score').first().text());
  } else {
    // preview_new layout
    const jsName = clean($('h3.jobseeker-name').first().text());
    if (jsName) record.name = jsName;
    const header = $('.header-name').first();
    const labeled = labeledHeaderValues($, header.length ? header : $('body'));
    const pick = (...labels) => labels.map((label) => labeled[label]).find(Boolean) || '';
    record.address = pick('ที่อยู่ปัจจุบัน') || record.address;
    record.phone = normalizePhone(pick('เบอร์โทรศัพท์', 'โทรศัพท์')) || record.phone;
    record.email = pick('อีเมล', 'Email') || record.email;
    record.line_id = pick('Line', 'LINE', 'ไลน์') || record.line_id;
    record.gender = pick('เพศ') || record.gender;
    record.age = extractAge(pick('อายุ', 'วันเดือนปีเกิด') || '') || record.age;
    record.birth_date = extractBirthDate(pick('วันเดือนปีเกิด') || '') || record.birth_date;
    record.nationality = pick('สัญชาติ') || record.nationality;
    record.religion = pick('ศาสนา') || record.religion;
    record.height = pick('ส่วนสูง') || record.height;
    record.weight = pick('น้ำหนัก') || record.weight;
    record.marital_status = pick('สถานะ', 'สถานภาพ') || record.marital_status;
    record.military_status = pick('สถานภาพทางทหาร') || record.military_status;
    record.desired_work_area = pick('พื้นที่ที่ต้องการทำงาน') || record.desired_work_area;
    record.expected_salary = pick('เงินเดือน', 'เงินเดือนที่ต้องการ') || record.expected_salary;
    record.available_start = pick('ระยะเวลาเริ่มงาน') || record.available_start;
    record.job_type = pick('รูปแบบงาน', 'ประเภทงาน') || record.job_type;
    record.intro = clean($('.header-name .flex-column p.break_word, .introduce p').first().text()) || record.intro;
    record.profile_image_url = $('.pic-profile img, .main-name img').first().attr('src') ?? '';
    record.hard_skills = listText($, '.hard-skill li');
    record.soft_skills = listText($, '.soft-skill li');
  }

  // text fallbacks
  if (!record.phone) record.phone = normalizePhone(extractPhoneFromText(rawText));
  record.email = validEmail(record.email) || validEmail(extractEmailFromText(rawText));
  if (!record.line_id) record.line_id = extractLineFromText(rawText);
  record.line_id = validLineId(record.line_id); // reject phone/CSS-class/error leakage from any source

  // name split
  const split = splitThaiFullName(record.name);
  record.prefix = split.prefix;
  record.first_name = record.first_name || split.first_name;
  record.last_name = record.last_name || split.last_name;
  record.name = split.name || record.name;

  // province
  if (record.address && !record.province) record.province = extractProvinceFromAddress(record.address);
  if (!record.province && record.desired_work_area) {
    record.province = firstMatch(record.desired_work_area, [/([ก-๙]+มหานคร|[ก-๙]+)/u]);
  }

  // Classic JobBKK keeps prose blobs in #education_page1 / #experience_page1.
  const eduPage = clean($('#education_page1').text());
  const expPage = clean($('#experience_page1').text());
  if (eduPage && !clean(record.education_summary)) record.education_summary = eduPage;
  if (expPage && !clean(record.experience_summary)) record.experience_summary = expPage;

  // structured education / work — classic selectors first, preview_new as fallback
  let education = extractEducation($);
  if (!education.length) education = extractEducationPreviewNew($);
  if (education.length) {
    record.education = education;
    record.education_summary = summarizeEducation(education);
  }
  let work = extractWork($);
  if (!work.length) work = extractWorkPreviewNew($);
  if (work.length) {
    record.work_experience = work;
    record.experience_summary = summarizeExperience(work);
  }

  fillMissingFromRawText(record, rawText);

  record.attachments = extractAttachments($);

  return finalizeCandidateRecord({
    index,
    scraped_at: new Date().toISOString(),
    focus_position: focusPosition,
    source: 'jobbkk_api',
    platform: 'jobbkk',
    source_url: sourceUrl,
    ...record,
    raw_text: rawText,
    raw_text_preview: rawText.slice(0, 500),
  });
}

/** Re-run text recovery and refresh parse_status — used by live scrape and offline repair. */
export function finalizeCandidateRecord(record = {}) {
  const next = { ...record };
  if (!Array.isArray(next.education)) next.education = [];
  if (!Array.isArray(next.work_experience)) next.work_experience = [];
  if (!Array.isArray(next.hard_skills)) next.hard_skills = [];
  if (!Array.isArray(next.soft_skills)) next.soft_skills = [];
  if (!Array.isArray(next.language_skills)) next.language_skills = [];
  next.raw_text = stripJobbkkSiteChrome(next.raw_text || '');
  if (Array.isArray(next.education)) {
    next.education = next.education.filter((row) => !isJunkEducationRow(row));
  }
  if (Array.isArray(next.work_experience)) {
    next.work_experience = sanitizeWorkExperience(next.work_experience);
  }
  if (isJobbkkSiteChromeText(next.experience_summary)) next.experience_summary = '';
  else if (clean(next.experience_summary)) next.experience_summary = stripJobbkkSiteChrome(next.experience_summary);
  // Test-resume placeholders must not stay on the desk.
  if (/JOBBKK\s*TEST|เทสระบบสมัครงาน|เรซูเม่นี้สำหรับใช้ทดสอบระบบ/i.test(clean(next.address))) {
    next.address = '';
  }
  if (/JOBBKK\s*TEST|เทสระบบสมัครงาน|เรซูเม่นี้สำหรับใช้ทดสอบระบบ/i.test(clean(next.desired_positions))) {
    next.desired_positions = '';
  }
  if (/^JOBBKK(\s+DOT\s+COM)?$/i.test(clean(next.name || next.full_name))) {
    // keep name visible as-is; education/address already scrubbed above
  }
  fillMissingFromRawText(next, next.raw_text || '');
  next.parse_status = parseStatus(next, next.raw_text || '');
  return next;
}

export function dedupeKey(candidate) {
  const m = String(candidate.source_url ?? '').match(/\/preview(?:_new)?\/(\d+)/i);
  if (m?.[1]) return `jobbkk:resume:${m[1]}`;
  const phone = String(candidate.phone ?? '').replace(/\D/g, '');
  if (phone) return `phone:${phone}`;
  const email = String(candidate.email ?? '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return `name:${candidate.name ?? Math.random()}`;
}
