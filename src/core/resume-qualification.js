const clean = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number.parseInt(clean(v).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
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
  const add = (field, value, evidenceTerms = []) => {
    if (clean(value)) filters.push({ field, value: clean(value), evidence_terms: evidenceTerms.map(clean).filter(Boolean) });
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
    else add(item?.field || 'other', item?.value, item?.evidence_terms || []);
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
  const candidateAge = num(candidate.age);

  for (const f of filters) {
    const value = clean(f.value);
    if (f.field === 'province') {
      const got = clean(candidate.province || candidate.desired_work_area);
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
      const got = num(candidate.expected_salary);
      const want = num(value);
      if (got == null) missing.push('insufficient_evidence:salary');
      else if (want != null && got > want) rejected.push('compensation_mismatch');
      else passed.push('salary_max');
    } else {
      const terms = [...(f.evidence_terms || []), value].map((v) => clean(v).toLowerCase()).filter(Boolean);
      const matched = terms.some((term) => allText.includes(term));
      const fieldName = f.field === 'driving_license' || f.field === 'license' ? 'required_license' : f.field === 'skill' ? 'required_skill' : f.field;
      if (!matched) missing.push(`insufficient_evidence:${fieldName}`);
      else passed.push(fieldName);
    }
  }

  const reasons = [...new Set(rejected.length ? rejected : missing)];
  const status = rejected.length ? 'rejected' : missing.length ? 'needs_review' : 'qualified';
  return {
    status,
    reasons,
    score: status === 'qualified' ? 100 : status === 'needs_review' ? Math.max(40, 80 - missing.length * 10) : 0,
    evidence: { passed: [...new Set(passed)], missing: [...new Set(missing)] },
    hardFilterCount: filters.length,
  };
}
