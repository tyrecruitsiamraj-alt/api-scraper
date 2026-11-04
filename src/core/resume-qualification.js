const clean = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number.parseInt(clean(v).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const salaryNumbers = (v) => {
  const values = clean(v).match(/\d[\d,]*/g) || [];
  return values
    .map((item) => Number.parseInt(item.replace(/,/g, ''), 10))
    .filter((item) => Number.isFinite(item));
};
const textOf = (candidate) => [
  candidate.desired_positions,
  candidate.desired_work_area,
  candidate.driving_license,
  candidate.driving_ability,
  candidate.education_summary,
  candidate.experience_summary,
  ...(candidate.hard_skills || []),
  ...(candidate.work_experience || []).map((v) => JSON.stringify(v)),
  ...(candidate.education || []).map((v) => JSON.stringify(v)),
  candidate.raw_text,
].filter(Boolean).join(' ').toLowerCase();

const roleTextOf = (candidate) => [
  candidate.desired_positions,
  ...(candidate.work_experience || []).map((v) => v?.position),
].filter(Boolean).join(' ').toLowerCase();

const GENERIC_ROLE_WORDS = /พนักงาน|เจ้าหน้าที่|ผู้ช่วย|ฝ่าย|แผนก|ระดับ|อาวุโส|ชำนาญการ|junior|senior|lead|staff|officer|assistant/giu;
const ROLE_CONCEPTS = [
  [/บริการลูกค้า|ลูกค้าสัมพันธ์|customer\s*service|customer\s*relation/iu, 'customer_service'],
  [/ประชาสัมพันธ์|public\s*relations?|\bpr\b/iu, 'public_relations'],
  [/ต้อนรับ|reception(?:ist)?|front\s*desk|guest\s*relation/iu, 'reception'],
  [/ทดสอบซอฟต์แวร์|software\s*test|data\s*test|quality\s*assurance|\bqa\b/iu, 'software_testing'],
];

const roleCore = (v) => clean(v)
  .toLowerCase()
  .replace(GENERIC_ROLE_WORDS, '')
  .replace(/[\s\-_/(),.]+/g, '');

const roleConcepts = (v) => ROLE_CONCEPTS
  .filter(([pattern]) => pattern.test(clean(v)))
  .map(([, concept]) => concept);

const termMatches = (haystack, rawTerm) => {
  const term = clean(rawTerm).toLowerCase();
  if (!term) return false;
  if (haystack.includes(term)) return true;
  // ETL/ELT and similar slash forms express accepted alternatives.
  const alternatives = term.split('/').map(clean).filter((v) => v.length >= 2);
  return alternatives.length > 1 && alternatives.some((part) => haystack.includes(part));
};

const roleMatchQuality = (roleText, acceptedPosition) => {
  if (termMatches(roleText, acceptedPosition)) return 1;
  const core = roleCore(acceptedPosition);
  if (core.length >= 4 && roleCore(roleText).includes(core)) return 0.9;
  const acceptedConcepts = roleConcepts(acceptedPosition);
  if (!acceptedConcepts.length) return 0;
  const candidateConcepts = new Set(roleConcepts(roleText));
  return acceptedConcepts.some((concept) => candidateConcepts.has(concept)) ? 0.85 : 0;
};

const roleMatches = (roleText, acceptedPosition) => roleMatchQuality(roleText, acceptedPosition) > 0;
const bestRoleQuality = (text, acceptedPositions) => acceptedPositions.reduce((best, position) => Math.max(best, roleMatchQuality(text, position)), 0);

const EDU = [
  [/ประถม/u, 1], [/ม\.?\s*ต้น|มัธยม.{0,6}ต้น/u, 2], [/ม\.?\s*ปลาย|มัธยม.{0,6}ปลาย|ปวช/u, 3],
  [/ปวส|อนุปริญญา/u, 4], [/ป\.?\s*ตรี|ปริญญาตรี|bachelor/iu, 5],
  [/ป\.?\s*โท|ปริญญาโท|master/iu, 6], [/ป\.?\s*เอก|ปริญญาเอก|doctor|ph\.?d/iu, 7],
];
function eduRank(v) {
  let best = 0;
  for (const [re, rank] of EDU) if (re.test(clean(v)) && rank > best) best = rank;
  return best;
}

function normalizeHardFilters(criteria = {}, sourcingSpec = {}) {
  const filters = [];
  const add = (field, value, evidenceTerms = [], matchMode = 'any') => {
    if (clean(value)) filters.push({
      field,
      value: clean(value),
      evidence_terms: evidenceTerms.map(clean).filter(Boolean),
      match_mode: matchMode === 'all' ? 'all' : 'any',
    });
  };
  add('province', criteria.province);
  add('education', criteria.education);
  add('gender', criteria.gender && criteria.gender !== 'ไม่ระบุ' ? criteria.gender : '');
  add('age_min', criteria.ageMin ?? criteria.age_min);
  add('age_max', criteria.ageMax ?? criteria.age_max);
  add('salary_max', criteria.salaryMax);
  add('driving_license', criteria.drivingLicense && criteria.drivingLicense !== 'ไม่ระบุ' ? criteria.drivingLicense : '');
  for (const item of sourcingSpec.hard_filters || []) {
    if (typeof item === 'string') add('other', item, [item]);
    else add(item?.field || 'other', item?.value, item?.evidence_terms || [], item?.match_mode);
  }
  return filters;
}

/** Deterministic gate: missing mandatory evidence is needs_review, never silently qualified. */
export function evaluateResumeQualification(candidate = {}, { criteria = {}, sourcingSpec = {} } = {}) {
  const filters = normalizeHardFilters(criteria, sourcingSpec);
  const rejected = [];
  const missing = [];
  const passed = [];
  const allText = textOf(candidate);
  const roleText = roleTextOf(candidate);
  const candidateAge = num(candidate.age);

  const acceptedPositions = (sourcingSpec.accepted_positions || []).map(clean).filter(Boolean);
  const desiredRoleText = clean(candidate.desired_positions).toLowerCase();
  const experienceRoles = (candidate.work_experience || []).map((item) => clean(item?.position).toLowerCase()).filter(Boolean);
  const experienceRoleText = experienceRoles.join(' ');
  const desiredRoleQuality = acceptedPositions.length > 0 ? bestRoleQuality(desiredRoleText, acceptedPositions) : 0;
  const experienceRoleQualities = acceptedPositions.length > 0
    ? experienceRoles.map((position) => bestRoleQuality(position, acceptedPositions)).filter((score) => score > 0)
    : [];
  const desiredRoleMatched = desiredRoleQuality > 0;
  const experienceRoleMatched = experienceRoleQualities.length > 0;
  // สายงานไม่ใช่เกณฑ์ตัด (เจ้าของ 4 พ.ย. 2569: "เอาแค่อยู่กรุงเทพ อายุเข้าเกณฑ์ เพศใช่ เนื้องานค่อยว่ากัน")
  // เกณฑ์ตัดมีแค่ที่ใบขอเขียน: จังหวัด อายุ เพศ (และวุฒิ/เพดานเงินเดือนถ้าระบุ) · คำตำแหน่งที่ AI เลือก
  // ใช้เรียงลำดับเท่านั้น — เดิมคนขับรถที่เขียนประวัติงานไม่ตรงคำตกทั้ง 176 คนใน 2 สัปดาห์
  let roleMatched = null; // null = เรซูเม่ไม่ระบุตำแหน่ง
  if (acceptedPositions.length) {
    const identity = clean(candidate.name || candidate.full_name);
    if (!identity) missing.push('insufficient_evidence:identity');
    if (roleText) roleMatched = acceptedPositions.some((position) => roleMatches(roleText, position));
    if (roleMatched) passed.push('job_family');
  }

  // เกณฑ์ตัดจริงมีแค่ จังหวัด อายุ เพศ และเพดานเงินเดือน (ใบขอเขียน "ไม่เกิน") — เจ้าของ 4 พ.ย. 2569
  // "เอาแค่อยู่กรุงเทพ อายุเข้าเกณฑ์ เพศใช่ เนื้องานค่อยว่ากัน ไม่งั้น 0 ตลอด"
  // วุฒิ ใบขับขี่ ทักษะ และเงื่อนไขที่ AI อ่านจากเนื้องาน = คะแนนเรียงลำดับ ไม่ตัดใครทิ้ง
  const softFromFilters = [];
  const softMissFromFilters = [];
  for (const f of filters) {
    const value = clean(f.value);
    if (f.field === 'province') {
      const got = [candidate.desired_work_area, candidate.province].map(clean).filter(Boolean).join(' ');
      if (!got) missing.push('insufficient_evidence:province');
      else if (!got.includes(value) && !value.includes(got)) rejected.push('location_mismatch');
      else passed.push('province');
    } else if (f.field === 'education') {
      const got = eduRank([candidate.education_summary, ...(candidate.education || []).map((v) => JSON.stringify(v))].join(' '));
      const want = eduRank(value);
      if (got && (!want || got >= want)) softFromFilters.push(`วุฒิ ${value}`);
      else softMissFromFilters.push(`วุฒิ ${value}`);
    } else if (f.field === 'gender') {
      const got = clean(candidate.gender);
      if (!got) missing.push('insufficient_evidence:gender');
      else if ((/หญิง/u.test(value) && !/หญิง/u.test(got)) || (/ชาย/u.test(value) && /หญิง/u.test(got))) rejected.push('gender_mismatch');
      else passed.push('gender');
    } else if (f.field === 'age_min' || f.field === 'age_max') {
      const want = num(value);
      if (candidateAge == null) missing.push('insufficient_evidence:age');
      else if (f.field === 'age_min' && want != null && candidateAge < want) rejected.push('age_out_of_range');
      else if (f.field === 'age_max' && want != null && candidateAge > want) rejected.push('age_out_of_range');
      else passed.push(f.field);
    } else if (f.field === 'salary_max') {
      const salaryRange = salaryNumbers(candidate.expected_salary);
      const got = salaryRange.length ? Math.min(...salaryRange) : null;
      const want = num(value);
      // ไม่ระบุเงินเดือนที่ต้องการ = ไม่รู้ ไม่ใช่เกินกรอบ — ไม่กันคนออก
      if (got == null) softMissFromFilters.push('เงินเดือนที่ต้องการ (เรซูเม่ไม่ระบุ)');
      else if (want != null && got > want) rejected.push('compensation_mismatch');
      else passed.push('salary_max');
    } else {
      const sourceTerms = (f.evidence_terms || []).length ? f.evidence_terms : [value];
      const terms = sourceTerms.map((v) => clean(v).toLowerCase()).filter(Boolean);
      const matched = f.match_mode === 'all'
        ? terms.every((term) => termMatches(allText, term))
        : terms.some((term) => termMatches(allText, term));
      if (matched) softFromFilters.push(value);
      else softMissFromFilters.push(value);
    }
  }

  const softPassed = [...softFromFilters];
  const softMissing = [...softMissFromFilters];
  for (const item of sourcingSpec.soft_scores || []) {
    const value = clean(item?.value);
    const sourceTerms = (item?.evidence_terms || []).length ? item.evidence_terms : [value];
    const terms = sourceTerms.map((v) => clean(v).toLowerCase()).filter(Boolean);
    const matched = item?.match_mode === 'all'
      ? terms.every((term) => termMatches(allText, term))
      : terms.some((term) => termMatches(allText, term));
    if (matched) softPassed.push(value || item?.field || 'soft_score');
    else softMissing.push(value || item?.field || 'soft_score');
  }

  if (acceptedPositions.length && !roleMatched) {
    softMissing.push(roleMatched === null ? 'ตำแหน่งที่ต้องการ (เรซูเม่ไม่ระบุ)' : 'ตำแหน่งตรงคำที่ค้น');
  }

  const reasons = [...new Set(rejected.length ? rejected : missing)];
  const status = rejected.length ? 'rejected' : missing.length ? 'needs_review' : 'qualified';
  const softTotal = softPassed.length + softMissing.length;
  // Scorecard v1 แยก “ผ่าน Gate” ออกจาก “เหมาะแค่ไหน”. งานที่มี Role Gate
  // จะไม่แจก 100 อัตโนมัติ: ตำแหน่งที่ต้องการ, ประสบการณ์ตรง, เงื่อนไข
  // บังคับ, Soft Evidence และความใหม่ของ Resume มีน้ำหนักที่อธิบายได้.
  const roleScore = acceptedPositions.length
    ? Math.min(60, Math.round(
      desiredRoleQuality * 35
      + (experienceRoleQualities.length ? Math.max(...experienceRoleQualities) * 15 : 0)
      + Math.min(10, experienceRoleQualities.length * 3.34),
    ))
    : 0;
  const hardScore = filters.length ? 20 : 12;
  const softScore = softTotal ? Math.round((softPassed.length / softTotal) * 15) : 8;
  const knownEvidence = passed.length + softPassed.length;
  const unknownEvidence = missing.length + softMissing.length;
  const confidenceScore = Math.round((knownEvidence / Math.max(1, knownEvidence + unknownEvidence)) * 100);
  const confidenceBonus = Math.round(confidenceScore / 20);
  const scoreBreakdown = acceptedPositions.length ? {
    role: roleScore,
    hard_filters: status === 'qualified' ? hardScore : 0,
    soft_evidence: softScore,
    evidence_confidence: confidenceBonus,
  } : null;
  // ตำแหน่งไม่ตรงยังผ่าน (ไม่ตัด) แต่คะแนนต้องต่ำกว่าคนตำแหน่งตรงเสมอ — ขั้นต่ำ 40 แทน 60
  const qualifiedFloor = acceptedPositions.length && !roleMatched ? 40 : 60;
  const qualifiedScore = acceptedPositions.length
    ? Math.max(qualifiedFloor, Math.min(roleMatched ? 100 : 59, roleScore + hardScore + softScore + confidenceBonus))
    : softTotal ? 60 + Math.round((softPassed.length / softTotal) * 40) : 100;
  return {
    status,
    reasons,
    score: status === 'qualified' ? qualifiedScore : status === 'needs_review' ? Math.max(40, 80 - missing.length * 10) : 0,
    evidence: {
      passed: [...new Set(passed)],
      missing: [...new Set(missing)],
      soft_passed: [...new Set(softPassed)],
      soft_missing: [...new Set(softMissing)],
      score_breakdown: scoreBreakdown,
      scorecard_version: acceptedPositions.length ? 'candidate-fit-v1' : 'qualification-v1',
      role_match: acceptedPositions.length ? roleMatched : undefined,
      confidence_score: confidenceScore,
    },
    hardFilterCount: filters.length,
  };
}

// เหตุที่คนตก เรียงตามจำนวนจริง — ข้อความ error เดิมโทษแต่เงื่อนไขที่กรองในระบบ (เช่น เพศ) ทั้งที่ตกเพราะอย่างอื่นมากกว่า
const REJECTION_LABEL = {
  incomplete_profile: 'โปรไฟล์กรอกไม่ครบ',
  incomplete_attachments: 'ไฟล์แนบไม่ครบ',
  age_out_of_range: 'อายุนอกช่วง',
  wrong_job_family: 'ประสบการณ์ไม่ตรงสายงาน',
  gender_mismatch: 'เพศไม่ตรง',
  location_mismatch: 'พื้นที่ไม่ตรง',
  education_below_minimum: 'วุฒิต่ำกว่าเกณฑ์',
  compensation_mismatch: 'เงินเดือนเกินกรอบ',
};

// โปรไฟล์/ไฟล์แนบไม่ครบไม่ใช่เหตุตัดแล้ว (เก็บเป็น "ต้องตรวจเพิ่ม") — ไม่นับเป็นเหตุ "ถูกคัดออก"
const NOT_A_REJECTION = new Set(['duplicate', 'incomplete_profile', 'incomplete_attachments', 'missing_contact']);

export function summarizeRejections(found, opened, reasonCounts = {}, needsReview = 0) {
  const parts = Object.entries(reasonCounts)
    .filter(([key, count]) => count > 0 && !NOT_A_REJECTION.has(key) && !key.includes(':'))
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${REJECTION_LABEL[key] || key} ${count}`);
  const why = parts.length ? ` · ${parts.join(' · ')} (คนเดียวตกได้หลายข้อ)` : '';
  if (needsReview > 0) {
    return `เว็บให้มา ${found} คน เปิดดู ${opened} คน ยังไม่มีใครผ่านครบ · ต้องตรวจเพิ่ม ${needsReview} คน (ข้อมูลในเรซูเม่ไม่ครบ ดูได้ในหน้าผู้สมัคร)${parts.length ? ` · ไม่ผ่าน: ${parts.join(' · ')}` : ''}`;
  }
  return `เว็บให้มา ${found} คน เปิดดู ${opened} คน แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไข${why}`;
}
