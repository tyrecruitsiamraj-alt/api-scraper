/**
 * Map a So Recruit job snapshot + operator overrides into JobBKK scrape criteria.
 * Empty / ไม่ระบุ / ERP "O" fields stay omitted — never invented.
 */

const EDUCATION_LEVELS = [
  'มัธยมศึกษาตอนต้น',
  'มัธยมศึกษาตอนปลาย',
  'ปวช.',
  'ปวส./อนุปริญญา',
  'ปริญญาตรี',
  'ปริญญาโท',
  'ปริญญาเอก',
];

const EDUCATION_ALIASES = [
  { test: /ปวส|อนุปริญญา/u, value: 'ปวส./อนุปริญญา' },
  { test: /ปวช/u, value: 'ปวช.' },
  { test: /ปริญญาเอก|ป\.?\s*เอก/u, value: 'ปริญญาเอก' },
  { test: /ปริญญาโท|ป\.?\s*โท/u, value: 'ปริญญาโท' },
  { test: /ปริญญาตรี|ป\.?\s*ตรี/u, value: 'ปริญญาตรี' },
  { test: /มัธยมศึกษาตอนปลาย|ม\.?\s*6|มปลาย|ม\.ปลาย/u, value: 'มัธยมศึกษาตอนปลาย' },
  { test: /มัธยมศึกษาตอนต้น|ม\.?\s*3|มต้น|ม\.ต้น/u, value: 'มัธยมศึกษาตอนต้น' },
];

const OPEN_GENDER = new Set([
  'o', 'all', 'any', 'a',
  'ไม่จำกัด', 'ไม่ระบุ', 'ไม่จำกัดเพศ', 'ทุกเพศ', 'ทั้งสองเพศ', 'ชายหญิง',
]);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function snapshotText(snapshot = {}, ...keys) {
  for (const key of keys) {
    const value = clean(snapshot?.[key]);
    if (value) return value;
  }
  return '';
}

export function hasSearchValue(value) {
  const text = clean(value);
  return text !== '' && text !== 'ไม่ระบุ';
}

/** JobBKK Normal Search gender labels. ERP O/all/ไม่ระบุ → skip. */
export function normalizeScrapeGender(value) {
  const raw = clean(value);
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/[\s,._\-–—/()[\]:]+/g, '');
  if (OPEN_GENDER.has(compact)) return '';
  if (/ชาย/.test(raw) && /หญิง/.test(raw)) return '';
  if (/^(?:f|female|หญิง|เพศหญิง)$/i.test(raw) || /หญิง/.test(raw)) return 'หญิง';
  if (/^(?:m|male|ชาย|เพศชาย)$/i.test(raw) || /ชาย/.test(raw)) return 'ชาย';
  return '';
}

export function normalizeScrapeEducation(value) {
  const raw = clean(value);
  if (!hasSearchValue(raw)) return '';
  const exact = EDUCATION_LEVELS.find((level) => raw === level || raw.includes(level));
  if (exact) return exact;
  const aliased = EDUCATION_ALIASES.find((entry) => entry.test.test(raw));
  return aliased ? aliased.value : '';
}

/**
 * Salary bounds from explicit min/max keys, or from a simple income figure.
 * Mixed prose like "เงินเดือน 12,000 + ค่าเที่ยว" is not mapped — operator fills it.
 */
export function parseSalaryBounds(snapshot = {}) {
  const explicitMin = digits(snapshotText(snapshot, 'salaryMin', 'salary_min', 'min_salary'));
  const explicitMax = digits(snapshotText(snapshot, 'salaryMax', 'salary_max', 'max_salary'));
  if (explicitMin || explicitMax) {
    return { salaryMin: explicitMin, salaryMax: explicitMax };
  }

  const income = snapshotText(snapshot, 'income', 'salary');
  if (!income) return { salaryMin: '', salaryMax: '' };

  const range = income.match(/(\d[\d,]*)\s*(?:-|–|—|ถึง)\s*(\d[\d,]*)/u);
  if (range) {
    return { salaryMin: digits(range[1]), salaryMax: digits(range[2]) };
  }

  const compact = income.replace(/\s+/g, '');
  if (/^[\d,]+(?:\+|บาท|\/เดือน)*$/u.test(compact)) {
    return { salaryMin: digits(income), salaryMax: '' };
  }
  return { salaryMin: '', salaryMax: '' };
}

function pickOverrideOrSnapshot(overrides, key, snapshot, ...snapKeys) {
  const override = overrides?.[key];
  if (override !== undefined && override !== null) return clean(override);
  return snapshotText(snapshot, ...snapKeys);
}

/**
 * Criteria keys the JobBKK worker already reads:
 * position, keyword, industry, province, education, gender, salaryMin/Max, ageMin/Max.
 */
export function buildScrapeCriteria({
  snapshot = {},
  overrides = {},
  erpTitle = '',
  erpProvince = '',
} = {}) {
  const position = pickOverrideOrSnapshot(overrides, 'position', snapshot, 'position') || clean(erpTitle);
  const province = pickOverrideOrSnapshot(overrides, 'province', snapshot, 'location', 'province') || clean(erpProvince);
  const keyword = pickOverrideOrSnapshot(overrides, 'keyword', snapshot, 'keyword', 'keywords');
  const industry = pickOverrideOrSnapshot(overrides, 'industry', snapshot, 'industry', 'occupation', 'job_types', 'jobTypes');
  const gender = normalizeScrapeGender(pickOverrideOrSnapshot(overrides, 'gender', snapshot, 'gender'));
  const education = normalizeScrapeEducation(pickOverrideOrSnapshot(overrides, 'education', snapshot, 'education', 'degree', 'edu'));

  const fromSnap = parseSalaryBounds(snapshot);
  const formSalaryMin = overrides?.salaryMin !== undefined && overrides?.salaryMin !== null
    ? digits(overrides.salaryMin)
    : fromSnap.salaryMin;
  const formSalaryMax = overrides?.salaryMax !== undefined && overrides?.salaryMax !== null
    ? digits(overrides.salaryMax)
    : fromSnap.salaryMax;
  const salaryMin = formSalaryMin;
  const salaryMax = formSalaryMax;

  const ageMinRaw = pickOverrideOrSnapshot(overrides, 'ageMin', snapshot, 'age_min', 'min_age', 'ageMin');
  const ageMaxRaw = pickOverrideOrSnapshot(overrides, 'ageMax', snapshot, 'age_max', 'max_age', 'ageMax');
  const ageNumber = (value) => Number.parseInt(String(value).replace(/[^\d]/g, ''), 10);
  const minAge = ageMinRaw ? ageNumber(ageMinRaw) : NaN;
  const maxAge = ageMaxRaw ? ageNumber(ageMaxRaw) : NaN;

  const criteria = {};
  if (position) criteria.position = position;
  if (keyword) criteria.keyword = keyword;
  if (industry) criteria.industry = industry;
  if (province) criteria.province = province;
  if (education) criteria.education = education;
  if (gender) criteria.gender = gender;
  if (salaryMin) criteria.salaryMin = salaryMin;
  if (salaryMax) criteria.salaryMax = salaryMax;
  if (Number.isFinite(minAge)) criteria.ageMin = String(minAge);
  if (Number.isFinite(maxAge)) criteria.ageMax = String(maxAge);
  return criteria;
}

export function assertAgeRange(criteria) {
  const minAge = criteria.ageMin ? Number.parseInt(criteria.ageMin, 10) : NaN;
  const maxAge = criteria.ageMax ? Number.parseInt(criteria.ageMax, 10) : NaN;
  if ((criteria.ageMin && (!Number.isFinite(minAge) || minAge < 15 || minAge > 80))
      || (criteria.ageMax && (!Number.isFinite(maxAge) || maxAge < 15 || maxAge > 80))) {
    throw new Error('ช่วงอายุต้องอยู่ระหว่าง 15–80 ปี');
  }
  if (Number.isFinite(minAge) && Number.isFinite(maxAge) && minAge > maxAge) {
    throw new Error('อายุต่ำสุดต้องไม่มากกว่าอายุสูงสุด');
  }
}

/**
 * Fill empty snapshot fields from ERP staging / jobs row.
 * Existing So Recruit values win. job_family is never copied into industry.
 */
const SNAPSHOT_ALIASES = {
  position: ['position', 'request_name', 'staff_title_name', 'job_description_name', 'title'],
  location: ['location', 'location_address', 'work_addr', 'site_name', 'province'],
  income: ['income', 'salary'],
  qty: ['qty', 'request_qty'],
  work_schedule: ['work_schedule', 'work_time', 'work_hours', 'worktime'],
  gender: ['gender', 'sex'],
  age_min: ['age_min', 'min_age', 'ageMin'],
  age_max: ['age_max', 'max_age', 'ageMax'],
  education: ['education', 'degree', 'edu'],
  unit_name: ['unit_name'],
  note: ['note'],
  keyword: ['keyword', 'keywords'],
  industry: ['industry', 'occupation', 'job_types', 'jobTypes'],
};

export function hydrateJobSnapshot(snapshot = {}, ...sources) {
  const bags = [snapshot, ...sources].filter((bag) => bag && typeof bag === 'object');
  const merged = { ...snapshot };
  for (const [key, aliases] of Object.entries(SNAPSHOT_ALIASES)) {
    if (clean(merged[key])) continue;
    for (const bag of bags) {
      const value = snapshotText(bag, ...aliases);
      if (value) {
        merged[key] = value;
        break;
      }
    }
  }
  return merged;
}

/** Prefill Orchestrator "แผนการค้น" selects without inventing missing fields. */
export function prefillScrapePlan(snapshot = {}, extras = {}) {
  const salary = parseSalaryBounds(snapshot);
  const gender = normalizeScrapeGender(snapshotText(snapshot, 'gender')) || 'ไม่ระบุ';
  const education = normalizeScrapeEducation(snapshotText(snapshot, 'education', 'degree', 'edu')) || 'ไม่ระบุ';
  return {
    position: snapshotText(snapshot, 'position') || clean(extras.position),
    location: snapshotText(snapshot, 'location', 'province') || clean(extras.location),
    income: snapshotText(snapshot, 'income'),
    qty: snapshotText(snapshot, 'qty') || clean(extras.qty),
    work_schedule: snapshotText(snapshot, 'work_schedule'),
    gender,
    age_min: snapshotText(snapshot, 'age_min', 'min_age', 'ageMin'),
    age_max: snapshotText(snapshot, 'age_max', 'max_age', 'ageMax'),
    unit_name: snapshotText(snapshot, 'unit_name'),
    note: snapshotText(snapshot, 'note'),
    keyword: snapshotText(snapshot, 'keyword', 'keywords'),
    industry: snapshotText(snapshot, 'industry', 'occupation', 'job_types', 'jobTypes'),
    education,
    salary_min: salary.salaryMin,
    salary_max: salary.salaryMax,
  };
}
