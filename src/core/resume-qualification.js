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

const roleMatches = (roleText, acceptedPosition) => {
  if (termMatches(roleText, acceptedPosition)) return true;
  const core = roleCore(acceptedPosition);
  if (core.length >= 4 && roleCore(roleText).includes(core)) return true;
  const acceptedConcepts = roleConcepts(acceptedPosition);
  if (!acceptedConcepts.length) return false;
  const candidateConcepts = new Set(roleConcepts(roleText));
  return acceptedConcepts.some((concept) => candidateConcepts.has(concept));
};

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
  add('age_min', criteria.ageMin);
  add('age_max', criteria.ageMax);
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
  if (acceptedPositions.length) {
    const identity = clean(candidate.name || candidate.full_name);
    if (!identity) missing.push('insufficient_evidence:identity');
    if (!roleText) missing.push('insufficient_evidence:job_family');
    else if (!acceptedPositions.some((position) => roleMatches(roleText, position))) rejected.push('wrong_job_family');
    else passed.push('job_family');
  }

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
      if (!got) missing.push('insufficient_evidence:education');
      else if (want && got < want) rejected.push('education_below_minimum');
      else passed.push('education');
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
      if (got == null) missing.push('insufficient_evidence:salary');
      else if (want != null && got > want) rejected.push('compensation_mismatch');
      else passed.push('salary_max');
    } else {
      const sourceTerms = (f.evidence_terms || []).length ? f.evidence_terms : [value];
      const terms = sourceTerms.map((v) => clean(v).toLowerCase()).filter(Boolean);
      const matched = f.match_mode === 'all'
        ? terms.every((term) => termMatches(allText, term))
        : terms.some((term) => termMatches(allText, term));
      const fieldName = f.field === 'driving_license' || f.field === 'license' ? 'required_license' : f.field === 'skill' ? 'required_skill' : f.field;
      if (!matched) missing.push(`insufficient_evidence:${fieldName}`);
      else passed.push(fieldName);
    }
  }

  const softPassed = [];
  const softMissing = [];
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

  const reasons = [...new Set(rejected.length ? rejected : missing)];
  const status = rejected.length ? 'rejected' : missing.length ? 'needs_review' : 'qualified';
  const softTotal = softPassed.length + softMissing.length;
  const qualifiedScore = softTotal ? 60 + Math.round((softPassed.length / softTotal) * 40) : 100;
  return {
    status,
    reasons,
    score: status === 'qualified' ? qualifiedScore : status === 'needs_review' ? Math.max(40, 80 - missing.length * 10) : 0,
    evidence: {
      passed: [...new Set(passed)],
      missing: [...new Set(missing)],
      soft_passed: [...new Set(softPassed)],
      soft_missing: [...new Set(softMissing)],
    },
    hardFilterCount: filters.length,
  };
}
