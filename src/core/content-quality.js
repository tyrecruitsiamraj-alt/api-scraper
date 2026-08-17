/**
 * Deterministic quality gate for recruitment content.
 *
 * This module deliberately does not call an LLM. Approval must be based on the
 * current source request and the current caption, not on a model's confidence.
 */

import { extractCampaignFacts } from './campaign-facts.js';

const AMBIGUOUS_TITLES = new Set(['งาน', 'พนักงาน', 'เจ้าหน้าที่', 'ช่าง', 'พนักงานทั่วไป', 'รับสมัครงาน', 'ไม่ระบุ']);
const BENEFIT_CLAIMS = [
  'โบนัส', 'เบี้ยขยัน', 'ค่าอาหาร', 'ค่าเดินทาง', 'ค่าครองชีพ', 'ประกันชีวิต',
  'ประกันสุขภาพ', 'กองทุนสำรองเลี้ยงชีพ', 'ยูนิฟอร์ม', 'ที่พัก', 'รถรับส่ง',
  'งานมั่นคง', 'สวัสดิการครบ', 'รายได้ดี',
];

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const compact = (value) => clean(value).toLowerCase().replace(/[\s,._\-–—/()\[\]:]+/g, '');
const digits = (value) => clean(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
const unique = (values) => [...new Set(values.filter(Boolean))];

function overlap(actual, expected) {
  const a = compact(actual);
  const e = compact(expected);
  if (!a || !e) return false;
  if (a.includes(e) || e.includes(a)) return true;
  const tokens = clean(expected).split(/[\s,./()\-–—]+/).map(compact).filter((x) => x.length >= 3);
  return tokens.length > 0 && tokens.filter((token) => a.includes(token)).length / tokens.length >= 0.6;
}

function numberNear(text, keywords) {
  return clean(text)
    .split(/\n|[|•]/)
    .filter((line) => keywords.some((keyword) => line.includes(keyword)))
    .flatMap(digits);
}

function check(code, label, status, message, expected = null, actual = null) {
  return { code, label, status, message, expected, actual };
}

/**
 * @param {{ campaign: Record<string, any>, caption?: string|null, posterFields?: Record<string, any>|null }} input
 * @returns {{status:'pass'|'warning'|'fail', score:number, blocking:boolean, summary:string, checks:Array<Record<string, any>>}}
 */
export function evaluateContentQuality({ campaign = {}, caption = '', posterFields = null, imageReady = null } = {}) {
  const facts = extractCampaignFacts(campaign);
  const text = clean(caption);
  const combined = clean([text, posterFields ? JSON.stringify(posterFields) : ''].join(' '));
  const checks = [];

  if (imageReady === false) {
    checks.push(check('visual', 'รูปประกาศตามตำแหน่ง', 'fail', 'AI ยังสร้างรูปที่ใช้ประกอบโปสเตอร์ไม่ได้ ห้ามส่งอนุมัติ'));
  } else if (imageReady === true) {
    checks.push(check('visual', 'รูปประกาศตามตำแหน่ง', 'pass', 'มีภาพต้นฉบับจาก Brief ตำแหน่งก่อนประกอบโปสเตอร์'));
  }

  const ambiguous = !facts.position || AMBIGUOUS_TITLES.has(compact(facts.position)) || /^(opl|job|req)[-_]?\d+$/i.test(facts.position);
  checks.push(ambiguous
    ? check('source_position', 'ชื่อตำแหน่งต้นทาง', 'fail', 'ใบขอยังระบุตำแหน่งไม่ชัด ต้องแก้ข้อมูลต้นทางก่อน', facts.position || 'ไม่มีข้อมูล')
    : check('source_position', 'ชื่อตำแหน่งต้นทาง', 'pass', 'ชื่อตำแหน่งชัดเจน', facts.position));

  if (!text) {
    checks.push(check('caption', 'ข้อความประกาศ', 'fail', 'ยังไม่มีข้อความประกาศ'));
  } else if (!ambiguous && !overlap(text, facts.position)) {
    checks.push(check('caption_position', 'ตำแหน่งในประกาศ', 'fail', 'ข้อความประกาศไม่พบชื่อตำแหน่งตามใบขอ', facts.position));
  } else {
    checks.push(check('caption_position', 'ตำแหน่งในประกาศ', 'pass', 'ชื่อตำแหน่งตรงกับใบขอ', facts.position));
  }

  if (!facts.location) {
    checks.push(check('location', 'สถานที่ทำงาน', 'fail', 'ใบขอไม่มีสถานที่ทำงาน'));
  } else if (!overlap(combined, facts.location)) {
    checks.push(check('location', 'สถานที่ทำงาน', 'fail', 'ประกาศไม่มีสถานที่ทำงานตามใบขอ', facts.location));
  } else {
    checks.push(check('location', 'สถานที่ทำงาน', 'pass', 'สถานที่ทำงานตรงกับใบขอ', facts.location));
  }

  if (!facts.qty) {
    checks.push(check('quantity', 'จำนวนที่รับ', 'warning', 'ใบขอไม่ได้ระบุจำนวนที่รับ'));
  } else {
    const found = numberNear(combined, ['อัตรา', 'จำนวน', 'รับ ', 'คน', 'ตำแหน่ง']);
    checks.push(found.includes(String(facts.qty))
      ? check('quantity', 'จำนวนที่รับ', 'pass', 'จำนวนที่รับตรงกับใบขอ', String(facts.qty))
      : check('quantity', 'จำนวนที่รับ', 'fail', 'ประกาศไม่พบจำนวนที่รับตามใบขอ', String(facts.qty), unique(found).join(', ') || 'ไม่พบ'));
  }

  if (!facts.income) {
    const claimed = numberNear(combined, ['เงินเดือน', 'รายได้', 'บาท']);
    checks.push(claimed.length
      ? check('income', 'รายได้', 'fail', 'ประกาศระบุตัวเลขรายได้ แต่ใบขอไม่มีข้อมูลยืนยัน', 'ไม่ระบุ', unique(claimed).join(', '))
      : check('income', 'รายได้', 'warning', 'ใบขอไม่ได้ระบุรายได้ จึงไม่แสดงตัวเลข'));
  } else {
    const expected = digits(facts.income);
    const found = numberNear(combined, ['เงินเดือน', 'รายได้', 'บาท']);
    const matches = expected.length > 0 && expected.some((n) => found.includes(n));
    checks.push(matches
      ? check('income', 'รายได้', 'pass', 'ตัวเลขรายได้ตรงกับใบขอ', facts.income)
      : check('income', 'รายได้', 'fail', 'ประกาศไม่มีตัวเลขรายได้ตามใบขอ หรือใช้ตัวเลขไม่ตรง', facts.income, unique(found).join(', ') || 'ไม่พบ'));
  }

  if (!facts.workSchedule) {
    checks.push(check('work_schedule', 'วันและเวลาทำงาน', 'warning', 'ใบขอไม่ได้ระบุวันและเวลาทำงาน'));
  } else {
    const expectedNumbers = digits(facts.workSchedule);
    const foundNumbers = numberNear(combined, ['เวลา', 'ทำงาน', 'วัน', 'จันทร์', 'อาทิตย์', 'ชม']);
    const numberMatch = expectedNumbers.length === 0 || expectedNumbers.some((n) => foundNumbers.includes(n));
    const textMatch = overlap(combined, facts.workSchedule) || numberMatch;
    checks.push(textMatch
      ? check('work_schedule', 'วันและเวลาทำงาน', 'pass', 'วันหรือเวลาทำงานสอดคล้องกับใบขอ', facts.workSchedule)
      : check('work_schedule', 'วันและเวลาทำงาน', 'fail', 'ประกาศไม่พบวันหรือเวลาทำงานตามใบขอ', facts.workSchedule));
  }

  const invented = BENEFIT_CLAIMS.filter((claim) => compact(combined).includes(compact(claim)) && !compact(facts.sourceText).includes(compact(claim)));
  checks.push(invented.length
    ? check('benefits', 'สวัสดิการและจุดขาย', 'fail', `พบข้อความที่ไม่มีหลักฐานในใบขอ: ${invented.join(', ')}`, null, invented.join(', '))
    : check('benefits', 'สวัสดิการและจุดขาย', 'pass', 'ไม่พบสวัสดิการหรือจุดขายที่แต่งเพิ่ม'));

  if (posterFields?.salaryTotal && posterFields?.salaryBreakdown
      && compact(posterFields.salaryTotal) === compact(posterFields.salaryBreakdown)) {
    checks.push(check('poster_salary_layout', 'การแสดงรายได้บนภาพ', 'fail', 'รายได้ถูกแสดงซ้ำสองตำแหน่งบนโปสเตอร์ กรุณาตัดข้อความซ้ำก่อนอนุมัติ'));
  } else {
    checks.push(check('poster_salary_layout', 'การแสดงรายได้บนภาพ', 'pass', 'ไม่แสดงตัวเลขรายได้ซ้ำบนโปสเตอร์'));
  }

  const qualificationExpected = [facts.gender, facts.ageMin, facts.ageMax, facts.education].filter(Boolean);
  const qualificationPresent = qualificationExpected.some((value) => compact(combined).includes(compact(value)));
  checks.push(qualificationExpected.length === 0
    ? check('qualifications', 'คุณสมบัติผู้สมัคร', 'warning', 'ใบขอไม่ได้ระบุคุณสมบัติผู้สมัคร')
    : qualificationPresent
      ? check('qualifications', 'คุณสมบัติผู้สมัคร', 'pass', 'พบคุณสมบัติจากใบขอในประกาศ')
      : check('qualifications', 'คุณสมบัติผู้สมัคร', 'warning', 'ประกาศยังไม่แสดงคุณสมบัติที่มีในใบขอ'));

  const applicable = checks.filter((item) => item.status !== 'not_applicable');
  const failures = applicable.filter((item) => item.status === 'fail');
  const warnings = applicable.filter((item) => item.status === 'warning');
  const score = Math.max(0, Math.round((applicable.reduce((sum, item) => sum + (item.status === 'pass' ? 1 : item.status === 'warning' ? 0.5 : 0), 0) / applicable.length) * 100));
  const status = failures.length ? 'fail' : warnings.length ? 'warning' : 'pass';
  const summary = failures.length
    ? `ยังอนุมัติไม่ได้: ${failures.map((item) => item.label).join(', ')}`
    : warnings.length
      ? `ผ่านจุดสำคัญแล้ว แต่ควรตรวจเพิ่ม: ${warnings.map((item) => item.label).join(', ')}`
      : 'ข้อมูลสำคัญตรงกับใบขอ พร้อมให้คนตรวจและอนุมัติ';
  // เก็บข้อมูลที่ใช้ทำโปสเตอร์ไว้กับผลตรวจ เพื่อให้ตอนแก้ caption/อนุมัติสามารถ
  // ตรวจรูปเดิมซ้ำได้โดยไม่ทำข้อมูลต้นทางของรูปหาย.
  return { status, score, blocking: failures.length > 0, summary, checks, posterFields: posterFields ?? null };
}

export function qualityFailureMessages(result) {
  return (result?.checks ?? []).filter((item) => item.status === 'fail').map((item) => item.message);
}
