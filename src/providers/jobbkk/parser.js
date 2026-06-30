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
  const e = firstMatch(text, [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i]);
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
    if (item.company || item.position) out.push(item);
  });
  return out;
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

/** preview_new layout work: .skills .timeline-2 .content-2 (h2 = year). */
function extractWorkPreviewNew($) {
  const out = [];
  $('.skills .timeline-2 .content-2').each((_, block) => {
    const item = {
      year: clean($(block).find('h2').first().text()),
      company: readFieldIn($, block, ['ข้อมูลบริษัท', 'บริษัท']),
      business_type: readFieldIn($, block, ['ประเภทธุรกิจ']),
      position: readFieldIn($, block, ['ตำแหน่งงาน']),
      period: readFieldIn($, block, ['ระยะเวลา']),
      salary: readFieldIn($, block, ['เงินเดือน']),
      responsibilities: readFieldIn($, block, ['รายละเอียดงาน'], true),
    };
    if (item.company || item.position || item.year) out.push(item);
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
  $('a[href*="download_attach"], a[href*="download_professional_license"]').each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const url = toAbsolute(href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    let title = clean($(a).text()) || clean($(a).attr('title') ?? '');
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
    const afterLabel = (label) => {
      let val = '';
      header.find('h5').each((_, h) => {
        if (val) return;
        if (clean($(h).text()).includes(label)) {
          val = stripLeadingDash($(h).nextAll('p').first().text());
        }
      });
      return val;
    };
    record.address = afterLabel('ที่อยู่ปัจจุบัน');
    record.phone = normalizePhone(afterLabel('เบอร์โทรศัพท์'));
    record.email = afterLabel('อีเมล');
    record.line_id = afterLabel('Line');
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

  // Layout-agnostic text fallbacks — fill fields the preview_new branch (which
  // lacks the classic #rsm-info / #rsm-request boxes) leaves empty. Only set when
  // still missing, so the classic selector values always win.
  // rawText has NO newlines (clean() collapses all whitespace), so bound each
  // value at the NEXT known label instead of relying on \n.
  const STOP = '(?=\\s*(?:ตำแหน่ง|พื้นที่ที่ต้องการ|เงินเดือน|ระยะเวลาเริ่มงาน|งานที่ต้องการ|ประวัติ|เพศ|สถานภาพ|ส่วนสูง|น้ำหนัก)|$)';
  if (!record.gender) record.gender = firstMatch(rawText, [/เพศ\s*[:：]\s*(ชาย|หญิง)/u]);
  if (!record.age) record.age = extractAge(rawText);
  if (!record.expected_salary) record.expected_salary = firstMatch(rawText, [/เงินเดือนที่ต้องการ\s*[:：]?\s*([\d,][\d,\s-]*\d)/u]);
  if (!record.desired_work_area) record.desired_work_area = firstMatch(rawText, [new RegExp(`พื้นที่ที่ต้องการทำงาน\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]);
  if (!record.available_start) record.available_start = firstMatch(rawText, [new RegExp(`ระยะเวลาเริ่มงาน\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]);
  if (!record.military_status) record.military_status = firstMatch(rawText, [new RegExp(`สถานภาพทางทหาร\\s*[:：]?\\s*(.+?)${STOP}`, 'u')]);
  if (!record.desired_positions) {
    const sec = rawText.match(/งานที่ต้องการ([\s\S]*?)ประวัติการศึกษา/u);
    if (sec?.[1]) {
      const positions = [...sec[1].matchAll(new RegExp(`ตำแหน่ง\\s*[:：]\\s*(.+?)${STOP}`, 'gu'))]
        .map((m) => clean(m[1]))
        .filter(Boolean);
      if (positions.length) record.desired_positions = [...new Set(positions)].join(', ');
    }
  }

  record.attachments = extractAttachments($);

  return {
    index,
    scraped_at: new Date().toISOString(),
    focus_position: focusPosition,
    source: 'jobbkk_api',
    platform: 'jobbkk',
    source_url: sourceUrl,
    ...record,
    raw_text: rawText,
    raw_text_preview: rawText.slice(0, 500),
    parse_status: parseStatus(record, rawText),
  };
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
