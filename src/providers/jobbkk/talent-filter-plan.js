/**
 * Plan JobBKK Normal Search filters from task criteria.
 * Only emits fields that the source actually provided — never invents values.
 * Long prose "positions" (เนื้องาน) are expanded to short Job Family chips when known.
 */

import { knownPositionsFromDescription } from '../../core/job-family.js';

/** JobBKK chips reject long/English compound titles; keep terms resume-searchable. */
const MAX_CHIP_LEN = 22;

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

export function isChipSearchable(term) {
  const text = String(term ?? '').trim();
  if (!hasSearchValue(text)) return false;
  if (text.length > MAX_CHIP_LEN) return false;
  if (/[A-Za-z]/.test(text)) return false;
  return true;
}

/** Drop Latin tokens from mixed titles like "เจ้าหน้าที่ IT" → "เจ้าหน้าที่". */
export function sanitizeChipTerm(term) {
  const text = String(term ?? '').trim();
  if (!hasSearchValue(text)) return '';
  if (isChipSearchable(text)) return text;
  const thaiOnly = text.replace(/[A-Za-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (isChipSearchable(thaiOnly)) return thaiOnly;
  return '';
}

/** Prefer short chips; if criteria only has long เนื้องาน, use same-family dictionary terms. */
export function searchablePositionTerms(criteria = {}) {
  const raw = parseTerms(criteria.position);
  const short = [...new Set(raw.map(sanitizeChipTerm).filter(Boolean))].slice(0, 3);
  if (short.length) return short;
  const prose = raw.join(' ') || String(criteria.position ?? '').trim();
  if (!prose) return [];
  const known = knownPositionsFromDescription(prose);
  if (known?.positions?.length) {
    return known.positions.map(sanitizeChipTerm).filter(Boolean).slice(0, 3);
  }
  return [];
}

export function searchableKeywordTerms(criteria = {}) {
  return [...new Set(parseTerms(criteria.keyword).map(sanitizeChipTerm).filter(Boolean))].slice(0, 3);
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

  add('position', searchablePositionTerms(criteria));
  add('keyword', searchableKeywordTerms(criteria));
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
