/**
 * Plan JobBKK Normal Search filters from task criteria.
 * Only emits fields that the source actually provided — never invents values.
 */

export function hasSearchValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'ไม่ระบุ';
}

export function parseTerms(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter((item) => hasSearchValue(item));
  return String(value ?? '')
    .split(/[\n,|]/)
    .map((item) => item.trim())
    .filter((item) => hasSearchValue(item));
}

export function parseEducationRange(raw) {
  if (!hasSearchValue(raw)) return null;
  const parts = String(raw)
    .split(/[-–—,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  if (parts.length >= 2) return { min: parts[0], max: parts[1] };
  return { min: parts[0], max: 'ปริญญาเอก' };
}

export function salaryOptionLabels(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return [];
  const amount = Number(digits);
  if (!Number.isFinite(amount)) return [digits];
  const comma = amount.toLocaleString('en-US');
  return [...new Set([digits, comma, `${comma}+`, String(amount)])];
}

export function occupationTerms(criteria = {}) {
  if (hasSearchValue(criteria.jobTypes)) return parseTerms(criteria.jobTypes);
  if (hasSearchValue(criteria.industry)) return parseTerms(criteria.industry);
  return [];
}

/** AI Search is a volume booster. Run it only when Normal Search is short of target. */
export function shouldSupplementWithAiSearch(normalCount, need) {
  const have = Number(normalCount) || 0;
  const target = Number(need);
  if (!Number.isFinite(target) || target <= 0) return false;
  return have < target;
}

/**
 * Ordered like a recruiter on Resume Search Talent → Normal Search:
 * position chips → keyword chips → ประเภทงาน → จังหวัด → วุฒิ/เพศ/เงินเดือน/อายุ/รูปแบบงาน.
 */
export function planTalentNormalFilters(criteria = {}) {
  const plan = [];
  const add = (field, value) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    plan.push({ field, value });
  };

  add('position', parseTerms(criteria.position).slice(0, 3));
  add('keyword', parseTerms(criteria.keyword).slice(0, 3));
  add('jobTypes', occupationTerms(criteria).slice(0, 5));
  if (hasSearchValue(criteria.province)) add('province', String(criteria.province).trim());

  const education = parseEducationRange(criteria.education);
  if (education) add('education', education);
  if (hasSearchValue(criteria.gender)) add('gender', String(criteria.gender).trim());

  if (hasSearchValue(criteria.salaryMin) || hasSearchValue(criteria.salaryMax)) {
    add('salary', {
      min: hasSearchValue(criteria.salaryMin) ? String(criteria.salaryMin).replace(/\D/g, '') : '',
      max: hasSearchValue(criteria.salaryMax) ? String(criteria.salaryMax).replace(/\D/g, '') : '',
      minLabels: salaryOptionLabels(criteria.salaryMin),
      maxLabels: salaryOptionLabels(criteria.salaryMax),
    });
  }

  if (hasSearchValue(criteria.ageMin) || hasSearchValue(criteria.ageMax)) {
    add('age', {
      min: hasSearchValue(criteria.ageMin) ? String(criteria.ageMin).replace(/\D/g, '') : '',
      max: hasSearchValue(criteria.ageMax) ? String(criteria.ageMax).replace(/\D/g, '') : '',
    });
  }

  add('workType', parseTerms(criteria.workType));
  if (hasSearchValue(criteria.experience)) add('experience', String(criteria.experience).trim());
  if (hasSearchValue(criteria.availableStart)) add('availableStart', String(criteria.availableStart).trim());

  return plan;
}

export function mapCriteriaToPremiumFilters(criteria = {}) {
  const drivingLicense = criteria.drivingLicense === 'มี'
    ? 'รถยนต์, รถจักรยานยนต์'
    : criteria.drivingLicense === 'ไม่มี' || criteria.drivingLicense === 'ไม่ระบุ'
      ? ''
      : (criteria.drivingLicense || '');

  return {
    position: criteria.position,
    keyword: criteria.keyword,
    areas: hasSearchValue(criteria.province) ? [criteria.province] : [],
    jobTypes: occupationTerms(criteria),
    salaryMin: criteria.salaryMin,
    salaryMax: criteria.salaryMax,
    ageMin: criteria.ageMin,
    ageMax: criteria.ageMax,
    gender: hasSearchValue(criteria.gender) ? criteria.gender : '',
    education: criteria.education,
    experience: criteria.experience,
    workType: criteria.workType,
    availableStart: hasSearchValue(criteria.availableStart) ? criteria.availableStart : '',
    drivingLicense,
  };
}
