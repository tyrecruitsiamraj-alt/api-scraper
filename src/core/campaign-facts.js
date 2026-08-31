/**
 * Facts used by recruitment content.  This is deliberately deterministic:
 * an LLM may phrase facts, but it must never become their source of truth.
 */

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const compact = (value) => clean(value).toLowerCase().replace(/[\s,._\-–—/()\[\]:]+/g, '');
const pick = (...values) => values.map(clean).find(Boolean) ?? '';
const BROAD_TITLES = new Set(['งาน', 'พนักงาน', 'เจ้าหน้าที่', 'ช่าง', 'พนักงานทั่วไป', 'รับสมัครงาน', 'ไม่ระบุ']);

/** ERP uses O/all/any for an open gender requirement. Never render that
 * internal code or let a model turn it into male/female. */
export function normalizedGenderRequirement(value) {
  const raw = clean(value);
  const key = compact(raw);
  if (!raw || ['o', 'all', 'any', 'a', 'ไม่จำกัด', 'ไม่ระบุ', 'ไม่จำกัดเพศ', 'ทุกเพศ'].includes(key)) return '';
  if (/^(?:m|male|ชาย|เพศชาย)$/i.test(raw) || /(?:เพศ)?ชาย/.test(raw)) return 'เพศชาย';
  if (/^(?:f|female|หญิง|เพศหญิง)$/i.test(raw) || /(?:เพศ)?หญิง/.test(raw)) return 'เพศหญิง';
  return `เพศ ${raw}`;
}

function normalizeKnownThaiTypos(value) {
  return clean(value)
    .replace(/โรงงาร/g, 'โรงงาน');
}

function specificRoleFromEvidence(evidence) {
  const text = clean(evidence).toLowerCase();
  const rules = [
    [/driver|ขับรถ/, 'พนักงานขับรถ'],
    [/security|รปภ|รักษาความปลอดภัย/, 'พนักงานรักษาความปลอดภัย'],
    [/cleaner|แม่บ้าน|ทำความสะอาด/, 'พนักงานทำความสะอาด'],
    [/warehouse|คลังสินค้า|สโตร์|แพ็คสินค้า/, 'พนักงานคลังสินค้า'],
    [/forklift|โฟล์คลิฟท์/, 'พนักงานขับรถโฟล์คลิฟท์'],
    [/technician|ช่าง/, 'ช่างเทคนิค'],
    [/nurse|พยาบาล/, 'พยาบาล'],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? '';
}

export function extractCampaignFacts(campaign = {}) {
  const snap = campaign.request_snapshot ?? campaign.snapshot ?? {};
  const originalTitle = pick(snap.position, snap.request_name, campaign.title, snap.job_description_name);
  const roleEvidence = clean([
    snap.job_family, snap.department, snap.department_code, snap.unit_name,
    snap.detail, snap.note, snap.job_description, campaign.positions,
  ].filter(Boolean).join(' · '));
  const inferredRole = BROAD_TITLES.has(compact(originalTitle)) ? specificRoleFromEvidence(roleEvidence) : '';
  const position = inferredRole || originalTitle;
  const incomeDisclosure = pick(snap.income_disclosure, snap.salary_visibility, snap.income_visibility);
  return {
    originalTitle,
    position,
    roleEvidence,
    positionWasInferred: Boolean(inferredRole),
    location: normalizeKnownThaiTypos(pick(snap.location, snap.work_addr, campaign.province, snap.site_name)),
    qty: Number(snap.qty ?? campaign.qty) || null,
    income: pick(snap.income),
    incomeDisclosure,
    workSchedule: pick(snap.work_schedule),
    duties: pick(snap.job_description, snap.job_detail, snap.duties, snap.responsibilities, snap.detail),
    gender: pick(snap.gender),
    ageMin: Number(snap.age_min) || null,
    ageMax: Number(snap.age_max) || null,
    education: pick(snap.education),
    contactPhone: pick(snap.contact_phone, snap.phone, snap.tel, snap.mobile, snap.contact_tel),
    sourceText: clean([campaign.title, campaign.province, campaign.qty, campaign.positions, ...Object.values(snap)]
      .filter((value) => typeof value !== 'object').join(' · ')),
  };
}

export function preflightCampaign(campaign = {}) {
  const facts = extractCampaignFacts(campaign);
  const issues = [];
  if (!facts.position || BROAD_TITLES.has(compact(facts.position))) issues.push('ต้องระบุตำแหน่งงานให้ชัดเจน');
  if (!facts.location) issues.push('ต้องระบุสถานที่ทำงาน');
  if (!facts.income && !facts.incomeDisclosure) issues.push('ต้องระบุรายได้ หรือยืนยันว่าไม่เปิดเผยรายได้');
  return { ready: issues.length === 0, facts, issues };
}

/** Non-negotiable image context appended after a model writes its creative prompt. */
export function visualBriefFromFacts(facts = {}) {
  const role = clean(facts.position);
  const evidence = clean(facts.roleEvidence);
  const location = clean(facts.location);
  if (!role) return '';
  return [
    `Depict exactly this Thai job role: ${role}.`,
    evidence ? `ERP job context: ${evidence}.` : '',
    location ? `Workplace context: ${location}.` : '',
    'Do not depict a different occupation. No text, letters, numbers, logos, or hospital/office role unless explicitly required above.',
  ].filter(Boolean).join(' ');
}

function salaryHighlight(income) {
  const raw = clean(income);
  const numeric = raw.match(/\d[\d,]*/)?.[0] ?? '';
  const digits = numeric.replace(/,/g, '');
  return /^\d+$/.test(digits) ? Number(digits).toLocaleString('en-US') : numeric;
}

function salaryBreakdown(income) {
  const raw = clean(income);
  if (!raw) return '';
  // A single total such as "15000" or "รายได้รวม 15,000 บาท" is already
  // rendered as the large salary value. Repeating it on the right-hand side
  // makes the poster look broken. Keep the full text only when it contains a
  // real component (OT, allowance, trip pay, etc.) or multiple amounts.
  const amounts = raw.match(/\d[\d,]*/g) ?? [];
  const remainder = raw
    .replace(/\d[\d,]*/g, '')
    .replace(/รายได้รวม|รายได้|เงินเดือน|ค่าจ้าง|บาท|ต่อเดือน|\/เดือน|เดือน|รวม/gi, '')
    .replace(/[+\s:()\-–—]/g, '');
  return amounts.length > 1 || remainder ? raw : '';
}

/** Force display fields that must never be invented or mutated by a model. */
export function applyTrustedPosterFacts(fields = {}, campaign = {}) {
  const facts = extractCampaignFacts(campaign);
  const gender = normalizedGenderRequirement(facts.gender);
  const qualifications = (Array.isArray(fields.qualifications) ? fields.qualifications : [])
    .map(clean)
    .filter(Boolean)
    // JavaScript \b only understands ASCII word characters.  It does not
    // create a boundary after Thai words such as "ชาย", so the previous
    // expression leaked model-invented gender requirements into the poster.
    // Use an explicit Thai/whitespace boundary and always rebuild gender from
    // the ERP fact below.
    .filter((item) => !/เพศ\s*(?:ชาย|หญิง|ไม่จำกัด(?:เพศ)?|ทุกเพศ|all|any|male|female|[mfo])(?=$|[\s:•,;/()])/iu.test(item));
  if (gender) qualifications.unshift(gender);
  return {
    ...fields,
    title: facts.position || clean(fields.title),
    location: facts.location || '',
    worktime: facts.workSchedule || '',
    salaryTotal: facts.income ? salaryHighlight(facts.income) : '',
    salaryBreakdown: salaryBreakdown(facts.income),
    quantity: facts.qty ? `${facts.qty} อัตรา` : clean(fields.quantity),
    contactLine: facts.contactPhone || clean(fields.contactLine),
    qualifications: [...new Set(qualifications)].slice(0, 6),
  };
}
