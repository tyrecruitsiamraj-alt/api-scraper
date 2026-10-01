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
  if (!s || s === '-' || s.startsWith(',') || s.includes('ที่ต้องการสมัคร')) return '';
  // Drop trailing duty blob glued on the same line as the title.
  let title = clean(s.replace(/\s*หน้าที่-?ผลงาน[\s\S]*$/u, '').replace(/\s*บาท\/?เดือน\s*/gu, ' ').trim());
  // Titles on JobThai are short; long fragments are duty text leaking after "ตำแหน่ง".
  if (title.length > 60) title = clean(title.slice(0, 60).replace(/\s+\S*$/u, ''));
  if (!title || title.length < 2) return '';
  return title;
}

const THAI_MONTH = '(?:ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.)';
const PERIOD_RE = new RegExp(
  `^(?:${THAI_MONTH}\\s*\\d{2,4}\\s*[-–—]\\s*(?:ปัจจุบัน|${THAI_MONTH}\\s*\\d{2,4})|\\d{4}\\s*[-–—]\\s*(?:ปัจจุบัน|\\d{4}))$`,
  'u',
);

export function isJobThaiPeriodLine(line) {
  return PERIOD_RE.test(clean(line));
}

function isTrainingBlock(lines) {
  const blob = lines.join(' ');
  if (/เงินเดือน|ตำแหน่ง/.test(blob)) return false;
  return /สถาบัน|หลักสูตร|ประกาศนียบัตร|วุฒิบัตร/.test(blob);
}

function isTimelineAgeLine(line) {
  // "2556 - 23" age ruler between training and real jobs — not a work period.
  return /^\d{4}\s*[-–—]\s*\d{1,2}$/u.test(clean(line));
}

const DUTY_STOP_RE = /^(?:คุณเคยดูเรซูเม่|Resume\s*-?\s*View\s*Credit|Credit\s*ที่ใช้แล้ว|ความสามารถ|ประวัติการศึกษา|ประวัติการฝึกอบรม|รายละเอียดส่วนตัว|คลิกดูข้อมูล|พิมพ์ประวัติ|Add Favorites|สงวนลิขสิทธิ์|setTimeout)/iu;

function trimDutyChrome(text) {
  const lines = String(text || '').split('\n');
  const kept = [];
  for (const line of lines) {
    if (DUTY_STOP_RE.test(clean(line))) break;
    kept.push(line);
  }
  return clean(kept.join('\n')).slice(0, 4000);
}

function absorbWorkLine(item, line) {
  if (DUTY_STOP_RE.test(clean(line))) {
    item._stopDuty = true;
    return;
  }
  if (item._stopDuty) return;

  const dutyInline = firstMatch(line, [/หน้าที่-?ผลงาน\s*[:：]?\s*([\s\S]+)/u]);
  if (dutyInline) {
    item.responsibilities = trimDutyChrome([item.responsibilities, dutyInline].filter(Boolean).join('\n'));
  }
  // After duties start, only append narrative lines — never re-read ตำแหน่ง from duty text.
  if (item.responsibilities) {
    if (
      !dutyInline
      && !/^(?:เงินเดือน|ตำแหน่ง|บริษัท|หน้าที่)/u.test(line)
      && !isJobThaiPeriodLine(line)
      && line.length > 8
    ) {
      item.responsibilities = trimDutyChrome(`${item.responsibilities}\n${line}`);
    }
    if (!item.salary) {
      const sal = firstMatch(line, [/เงินเดือน[^0-9]{0,20}([\d,]+)/u]);
      if (sal && /\d/.test(sal)) item.salary = sal;
    }
    return;
  }
  const posRaw = firstMatch(line, [/ตำแหน่ง(?:งาน)?\s*[:：]?\s*(.+)$/u]);
  const pos = cleanPosition(posRaw);
  const sal = firstMatch(line, [/เงินเดือน[^0-9]{0,20}([\d,]+)/u]);
  if (pos && !item.position) item.position = pos;
  if (sal && /\d/.test(sal) && !item.salary) item.salary = sal;
}

/**
 * JobThai work blocks look like:
 *   ก.ย. 56 - พ.ค. 57
 *   บริษัท … / Mini Big C …
 *   เงินเดือน 12,000 ตำแหน่ง …
 *   … หน้าที่-ผลงาน …
 * (each job is often rendered twice — keep the copy with duties).
 */
export function parseWork(workText) {
  if (!workText) return [];
  const lines = String(workText).split('\n').map(clean).filter(Boolean);
  const items = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isTimelineAgeLine(line) || !isJobThaiPeriodLine(line)) continue;

    const period = line;
    const block = [];
    let j = i + 1;
    while (j < lines.length && !isJobThaiPeriodLine(lines[j]) && !isTimelineAgeLine(lines[j])) {
      block.push(lines[j]);
      j += 1;
    }
    i = j - 1;
    if (!block.length || isTrainingBlock(block)) continue;

    const item = {
      company: '',
      position: '',
      period,
      year: (period.match(/\d{4}/) || period.match(/\d{2,4}/) || [])[0] || '',
      salary: '',
      responsibilities: '',
      business_type: '',
    };

    for (const bl of block) {
      if (!item.company
        && !/^(?:เงินเดือน|ตำแหน่ง|หน้าที่)/u.test(bl)
        && bl.length < 120
        && !/^ปีที่จบ/u.test(bl)) {
        item.company = stripEllipsis(bl);
        continue;
      }
      absorbWorkLine(item, bl);
    }

    if (item.company && (item.position || item.salary || item.responsibilities)) {
      delete item._stopDuty;
      item.responsibilities = trimDutyChrome(item.responsibilities);
      items.push(item);
    }
  }

  // Legacy fallback: company-first lines when period markers are missing.
  if (!items.length) {
    let cur = null;
    for (const line of lines) {
      if (/บริษัท|company|ห้างหุ้นส่วน|โรงงาน|องค์การ/i.test(line) && line.length < 100) {
        if (cur) items.push(cur);
        const yr = (line.match(/(\d{4})/) || [])[1] || '';
        cur = {
          company: stripEllipsis(line),
          position: '',
          period: yr,
          year: yr,
          salary: '',
          responsibilities: '',
          business_type: '',
        };
      } else if (cur) {
        absorbWorkLine(cur, line);
      }
    }
    if (cur) items.push(cur);
  }

  const byKey = new Map();
  for (const e of items) {
    if (!e.company || (!e.position && !e.salary && !e.responsibilities)) continue;
    e.company = stripEllipsis(e.company);
    e.position = cleanPosition(e.position);
    const key = `${normName(e.company).slice(0, 18)}|${e.position || e.salary}`;
    const prev = byKey.get(key);
    if (prev) {
      for (const f of ['year', 'period', 'salary', 'position', 'responsibilities']) {
        if (!prev[f] && e[f]) prev[f] = e[f];
        else if (f === 'responsibilities' && (e[f] || '').length > (prev[f] || '').length) prev[f] = e[f];
        else if (f === 'company' && (e[f] || '').length > (prev[f] || '').length) prev[f] = e[f];
        else if (f === 'period' && (e[f] || '').length > (prev[f] || '').length) prev[f] = e[f];
      }
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
  // JobThai often uses "ประวัติการทำงาน/ฝึกงาน" and stacks training above jobs.
  const workText = sectionBetween(
    text,
    'ประวัติการทำงาน',
    ['ความสามารถ', 'ทักษะ', 'โครงการ', 'รายละเอียดเพิ่มเติม', 'Resume - View Credit'],
  );
  // JobThai stacks ALL section headers first then their content, so a bounded
  // "education section" is empty — scan the whole text but keep only real
  // education (must have degree/major/gpa), which excludes training & work.
  rec.education = parseEducation(text);
  let work = parseWork(workText);
  // Period markers often sit only in the full body text after the age ruler.
  if (!work.some((row) => row.period && row.responsibilities)) {
    const fromFull = parseWork(text);
    if (fromFull.length >= work.length) work = fromFull;
  }
  rec.work_experience = work;
  rec.education_summary = clean(eduText).slice(0, 1000);
  rec.experience_summary = work
    .map((row) => [row.period, row.company, row.position, row.salary, row.responsibilities].filter(Boolean).join(' | '))
    .join('\n')
    .slice(0, 4000);

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
