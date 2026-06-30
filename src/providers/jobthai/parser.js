import * as cheerio from 'cheerio';

const THAI_NAME_PREFIXES = ['นางสาว', 'น.ส.', 'นาย', 'นาง', 'ดร.', 'Mr.', 'Mrs.', 'Miss', 'Ms.'];
const clean = (v) => (v == null ? '' : String(v).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim());

function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = String(text).match(p);
    if (m?.[1]) return clean(m[1]).replace(/\n/g, ' ').trim();
  }
  return '';
}

function splitThaiFullName(full) {
  let parts = clean(full).replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
  let prefix = '';
  if (parts.length) {
    const sorted = [...THAI_NAME_PREFIXES].sort((a, b) => b.length - a.length);
    for (const c of sorted) {
      if (parts[0] === c) { prefix = parts.shift(); break; }
      if (parts[0].startsWith(c)) { prefix = c; parts[0] = parts[0].slice(c.length); break; } // glued prefix
    }
  }
  const first_name = parts[0] ?? '';
  const last_name = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return { prefix, first_name, last_name, name: [prefix, first_name, last_name].filter(Boolean).join(' ') };
}

/** Convert a cheerio region to text with block structure preserved as newlines. */
function structuredText($, $root) {
  const $c = $root.clone();
  $c.find('br').replaceWith('\n');
  $c.find('tr,p,div,li,h1,h2,h3,h4,table').each((_, el) => $(el).append('\n'));
  return clean($c.text());
}

function extractProvince(address) {
  const m = String(address).match(/(กรุงเทพมหานคร|(?:จังหวัด)?[ก-๙]+)\s*\d{5}/u);
  return m?.[1] ? clean(m[1].replace(/^จังหวัด/, '')) : '';
}

// Names get truncated to different lengths across renders, sometimes with a
// trailing "…"/"..." — strip it and compare on a spaceless prefix.
const stripEllipsis = (s) => clean(s).replace(/\s*(?:\.{2,}|…)\s*$/u, '').trim();
const normName = (s) => stripEllipsis(s).replace(/\s+/g, '');

const INST_RE = /มหาวิทยาลัย|วิทยาลัย|โรงเรียน|สถาบัน|university|college/i;

// Scan the whole text. An institution line starts an entry; its detail fields
// (faculty/major/level/gpa/year) may be on the SAME line (innerText layout) or
// the FOLLOWING few lines (structuredText/HTML layout) — handle both.
export function parseEducation(fullText) {
  const lines = String(fullText).split('\n').map(clean).filter(Boolean);
  const items = [];
  let cur = null;
  let since = 0;

  const absorb = (item, line) => {
    const major = firstMatch(line, [/สาขา(?:วิชา)?\s*[:：]?\s*([^\n]+?)(?=\s*(?:ระดับ|คณะ|เกรด)|$)/u]);
    const faculty = firstMatch(line, [/คณะ\s*[:：]?\s*([^\n]+?)(?=\s*(?:สาขา|ระดับ|เกรด)|$)/u]);
    const degree = firstMatch(line, [/(?:ระดับการศึกษา|ระดับ|วุฒิการศึกษา|วุฒิ)\s*[:：]?\s*([^\n]+?)(?=\s*(?:สาขา|คณะ|เกรด)|$)/u]);
    const gpa = (line.match(/เกรด(?:เฉลี่ย)?\s*[:：]?\s*([\d.]+)/u) || [])[1];
    const yr = (line.match(/\b(25\d{2}|20\d{2})\b/u) || [])[1];
    if (major && !item.major) item.major = major;
    if (faculty && !item.faculty) item.faculty = faculty;
    if (degree && !item.degree) item.degree = degree;
    if (gpa && !item.gpa) item.gpa = gpa;
    if (yr && !item.graduation_year) item.graduation_year = yr;
  };

  for (const line of lines) {
    if (INST_RE.test(line) && line.length < 140) {
      if (cur) items.push(cur);
      const inst = clean((line.match(/((?:มหาวิทยาลัย|วิทยาลัย|โรงเรียน|สถาบัน)[^\n]*?)(?=\s*(?:สาขา|ระดับ|คณะ|เกรด)|$)/u) || [])[1] || line);
      cur = { institution: inst, graduation_year: '', degree: '', faculty: '', major: '', gpa: '' };
      absorb(cur, line); // fields may be inline on the institution line
      since = 0;
    } else if (cur && since < 6) {
      since += 1;
      absorb(cur, line);
    }
  }
  if (cur) items.push(cur);

  const REAL_DEGREE = /(มัธยม|ประถม|ปวช|ปวส|ปริญญา|อนุปริญญา|ป\.(ตรี|โท|เอก))/;
  const byKey = new Map();
  for (const e of items) {
    if (!e.institution) continue;
    e.institution = stripEllipsis(e.institution);
    e.major = stripEllipsis(e.major);
    // training/certificate degree leaks ("ประกาศนียบัตร/วุฒิบัตร" → "บัตร …")
    if (e.degree === 'การศึกษา' || /บัตร|หลักสูตร/.test(e.degree)) e.degree = '';
    // Drop training-institute lines and anything that isn't formal education
    // (a real degree level, or a GPA which only formal education carries).
    if (/หลักสูตร/.test(e.institution)) continue;
    if (!REAL_DEGREE.test(e.degree) && !e.gpa) continue;
    // dedupe on a normalized institution prefix (names get truncated/ellipsised)
    const key = `${normName(e.institution).slice(0, 18)}|${e.degree}`;
    const prev = byKey.get(key);
    if (prev) {
      for (const f of ['graduation_year', 'degree', 'faculty', 'major', 'gpa']) {
        if (!prev[f] && e[f]) prev[f] = e[f];
      }
    } else {
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].slice(0, 8);
}

// A real job title — reject label leaks ("ที่ต้องการสมัคร"), responsibility
// fragments (start with "," / very long), and empty dashes.
function cleanPosition(p) {
  const s = clean(p);
  if (!s || s === '-' || s.startsWith(',') || s.length > 50 || s.includes('ที่ต้องการสมัคร')) return '';
  return s;
}

export function parseWork(workText) {
  if (!workText) return [];
  const lines = workText.split('\n').map(clean).filter(Boolean);
  const items = [];
  let cur = null;
  for (const line of lines) {
    if (/บริษัท|company|ห้างหุ้นส่วน|โรงงาน|องค์การ/i.test(line) && line.length < 80) {
      if (cur) items.push(cur);
      const yr = (line.match(/(\d{4})/) || [])[1] || '';
      cur = { company: clean(line), position: '', period: yr, year: yr, salary: '', responsibilities: '' };
    } else if (cur) {
      const pos = cleanPosition(firstMatch(line, [/ตำแหน่ง(?:งาน)?\s*[:：]?\s*(.+)/u]));
      const sal = firstMatch(line, [/เงินเดือน\s*[:：(บาท)]*\s*([\d,]+)/u]);
      if (pos && !cur.position) cur.position = pos;
      if (sal && /\d/.test(sal) && !cur.salary) cur.salary = sal;
    }
  }
  if (cur) items.push(cur);

  // Real work = company + (a real position OR a salary). Drop bare company
  // mentions/labels, then dedupe by company+position (the page lists each twice —
  // once with the title, once as a position-less "-" copy: drop that copy when the
  // same company already has a titled entry).
  // A position-less row is the duplicate render of a titled job. Drop it when the
  // same company (normalized prefix, ellipsis-stripped) OR the same salary already
  // belongs to a titled entry.
  const titled = items.filter((e) => e.company && e.position);
  const posCompanies = titled.map((e) => normName(e.company));
  const posSalaries = new Set(titled.map((e) => e.salary).filter(Boolean));
  const sharesTitled = (e) => {
    const n = normName(e.company);
    if (e.salary && posSalaries.has(e.salary)) return true;
    return n.length >= 8 && posCompanies.some((p) => p.startsWith(n) || n.startsWith(p));
  };
  const byKey = new Map();
  for (const e of items) {
    if (!e.company || (!e.position && !e.salary)) continue;
    if (!e.position && sharesTitled(e)) continue;
    e.company = stripEllipsis(e.company);
    const key = `${normName(e.company).slice(0, 18)}|${e.position}`;
    const prev = byKey.get(key);
    if (prev) {
      for (const f of ['year', 'period', 'salary', 'responsibilities']) if (!prev[f] && e[f]) prev[f] = e[f];
    } else {
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].slice(0, 12);
}

export function sectionBetween(text, startKw, endKws) {
  const start = text.indexOf(startKw);
  if (start < 0) return '';
  let end = text.length;
  for (const kw of endKws) {
    const i = text.indexOf(kw, start + startKw.length);
    if (i >= 0 && i < end) end = i;
  }
  return text.slice(start + startKw.length, end);
}

/**
 * Parse a JobThai resume detail page. Contacts are revealed separately
 * (enrichContacts → ajaxCheckViewStatusV2.php), not here.
 */
export function parseResumeHtml(html, { sourceUrl, index, focusPosition = '-' }) {
  const $ = cheerio.load(html);
  // Parse the whole body: #detailshow holds only name/address; education, work
  // and personal details live in sibling sections outside it.
  const text = structuredText($, $('body'));
  const rawText = clean($('body').text());

  const rec = {
    prefix: '', name: '', first_name: '', last_name: '',
    profile_image_url: '', phone: '', email: '', line_id: '', facebook: '', address: '', intro: '',
    desired_positions: '', desired_work_area: '', job_type: '', expected_salary: '', available_start: '',
    education: [], work_experience: [], education_summary: '', experience_summary: '',
    gender: '', age: '', birth_date: '', nationality: '', religion: '', height: '', weight: '',
    marital_status: '', military_status: '', vehicle: '', driving_license: '', driving_ability: '',
    hard_skills: [], soft_skills: [], language_skills: [], province: '',
  };

  // name + address
  const nm = text.match(/ชื่อ\s+([^\n]+?)\s+นามสกุล\s+([^\n]+)/u);
  if (nm) Object.assign(rec, splitThaiFullName(`${clean(nm[1])} ${clean(nm[2])}`));
  if (!rec.name) {
    const h = clean($('.head1.black, span.head1.black, #detailshow .head1').first().text());
    if (h) Object.assign(rec, splitThaiFullName(h));
  }
  // JobThai shows "เจ้าของเรซูเม่ปิดข้อมูลนี้" for private resumes — that's a
  // placeholder, not a name. Leave it blank rather than store the placeholder.
  if (/เจ้าของเรซูเม่ปิด|ปิดข้อมูลนี้/.test(rec.name)) {
    rec.name = '';
    rec.prefix = '';
    rec.first_name = '';
    rec.last_name = '';
  }
  rec.address = firstMatch(text, [/ที่อยู่\s*[:：]?\s*([^\n]+(?:\n[^\n]+)?)/u]);
  rec.province = extractProvince(rec.address);

  // personal — labels and values are grid cells, so allow a small gap between them
  rec.gender = firstMatch(text, [/เพศ[\s\S]{0,40}?(ชาย|หญิง)/u]);
  rec.age = firstMatch(text, [/อายุ[\s\S]{0,15}?(\d{1,2})\s*ปี/u, /อายุ[\s\S]{0,15}?(\d{1,2})/u]);
  rec.birth_date = firstMatch(text, [/(?:วันเกิด|เกิดวันที่)[\s\S]{0,20}?([0-9]{1,2}\s*[ก-๙.]+\s*[0-9]{4}|[0-9/]{6,10})/u]);
  rec.nationality = firstMatch(text, [/สัญชาติ\s*[:：]?\s*([^\n]+)/u]);
  rec.religion = firstMatch(text, [/ศาสนา\s*[:：]?\s*([^\n]+)/u]);
  rec.marital_status = firstMatch(text, [/สถานภาพ(?:สมรส)?\s*[:：]?\s*([^\n]+)/u]);
  rec.height = firstMatch(text, [/ส่วนสูง\s*[:：]?\s*([\d.]+)/u]);
  rec.weight = firstMatch(text, [/น้ำหนัก\s*[:：]?\s*([\d.]+)/u]);

  // desired job
  rec.desired_positions = firstMatch(text, [/ตำแหน่งงานที่ต้องการสมัคร\s*[:：]?\s*([^\n]+)/u]);
  rec.expected_salary = firstMatch(text, [/เงินเดือนที่ต้องการ\s*[:：]?\s*([^\n]+)/u]);
  rec.desired_work_area = firstMatch(text, [/สถานที่ที่ต้องการทำงาน\s*[:：]?\s*([^\n]+)/u]);
  rec.available_start = firstMatch(text, [/วันที่สามารถเริ่มงานได้\s*[:：]?\s*([^\n]+)/u]);

  // education / work sections
  const eduText = sectionBetween(text, 'ประวัติการศึกษา', ['ประวัติการทำงาน', 'ความสามารถ', 'การฝึกอบรม']);
  const workText = sectionBetween(text, 'ประวัติการทำงาน', ['ความสามารถ', 'การฝึกอบรม', 'โครงการ', 'รายละเอียดเพิ่มเติม']);
  // JobThai stacks ALL section headers first then their content, so a bounded
  // "education section" is empty — scan the whole text but keep only real
  // education (must have degree/major/gpa), which excludes training & work.
  rec.education = parseEducation(text);
  rec.work_experience = parseWork(workText);
  rec.education_summary = clean(eduText).slice(0, 1000);
  rec.experience_summary = clean(workText).slice(0, 2000);

  if (!rec.province && rec.desired_work_area) rec.province = rec.desired_work_area;

  return {
    index,
    scraped_at: new Date().toISOString(),
    focus_position: focusPosition,
    source: 'jobthai_api',
    platform: 'jobthai',
    source_url: sourceUrl,
    ...rec,
    raw_text: rawText,
    raw_text_preview: rawText.slice(0, 500),
    parse_status: rec.name ? 'partial' : 'failed', // upgraded to 'success' after contact reveal
  };
}

export function externalId(url) {
  return (String(url ?? '').match(/\/resume\/\d+,(\d+)/) || [])[1] || '';
}
