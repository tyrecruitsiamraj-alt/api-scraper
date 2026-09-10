import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAgeRange,
  buildScrapeCriteria,
  normalizeScrapeEducation,
  normalizeScrapeGender,
  parseSalaryBounds,
  prefillScrapePlan,
} from '../web/lib/scrape-intake.js';
import { planTalentNormalFilters } from '../src/providers/jobbkk/talent-filter-plan.js';

test('ERP open gender codes are omitted, not stored as ไม่ระบุ', () => {
  assert.equal(normalizeScrapeGender('O'), '');
  assert.equal(normalizeScrapeGender('all'), '');
  assert.equal(normalizeScrapeGender('ไม่ระบุ'), '');
  assert.equal(normalizeScrapeGender('ชาย/หญิง'), '');
  assert.equal(normalizeScrapeGender('M'), 'ชาย');
  assert.equal(normalizeScrapeGender('เพศหญิง'), 'หญิง');
});

test('education aliases map to JobBKK labels and unknown text is skipped', () => {
  assert.equal(normalizeScrapeEducation('ป.ตรี'), 'ปริญญาตรี');
  assert.equal(normalizeScrapeEducation('ปริญญาตรี'), 'ปริญญาตรี');
  assert.equal(normalizeScrapeEducation('ไม่ระบุ'), '');
  assert.equal(normalizeScrapeEducation('จบอะไรก็ได้'), '');
});

test('salary comes from explicit bounds or a simple income figure, not mixed prose', () => {
  assert.deepEqual(parseSalaryBounds({ salary_min: '20,000', salary_max: '25000' }), {
    salaryMin: '20000',
    salaryMax: '25000',
  });
  assert.deepEqual(parseSalaryBounds({ income: '25,000+' }), {
    salaryMin: '25000',
    salaryMax: '',
  });
  assert.deepEqual(parseSalaryBounds({ income: '20000-25000' }), {
    salaryMin: '20000',
    salaryMax: '25000',
  });
  assert.deepEqual(parseSalaryBounds({ income: 'เงินเดือน 12,000 + ค่าเที่ยว 3,000 บาท' }), {
    salaryMin: '',
    salaryMax: '',
  });
});

test('criteria keeps operator overrides and skips empty snapshot fields', () => {
  const criteria = buildScrapeCriteria({
    snapshot: {
      position: 'พนักงานขาย',
      location: 'สมุทรปราการ',
      gender: 'O',
      education: '',
      job_family: 'Sales',
      income: '25000+',
      age_min: '25',
      age_max: '45',
    },
    overrides: {
      keyword: 'ขาย',
      industry: 'การขาย',
      education: 'ปริญญาตรี',
    },
    erpTitle: 'พนักงานขาย',
    erpProvince: 'สมุทรปราการ',
  });
  assert.deepEqual(criteria, {
    position: 'พนักงานขาย',
    keyword: 'ขาย',
    industry: 'การขาย',
    province: 'สมุทรปราการ',
    education: 'ปริญญาตรี',
    salaryMin: '25000',
    ageMin: '25',
    ageMax: '45',
  });
  assert.equal('gender' in criteria, false);
  assert.equal('job_family' in criteria, false);
});

test('operator ไม่ระบุ wins over a snapshot gender code', () => {
  const criteria = buildScrapeCriteria({
    snapshot: { position: 'พนักงานขาย', gender: 'M' },
    overrides: { gender: 'ไม่ระบุ' },
  });
  assert.equal(criteria.gender, undefined);
  assert.equal('gender' in criteria, false);
});

test('cleared salary override does not fall back to snapshot income', () => {
  const criteria = buildScrapeCriteria({
    snapshot: { position: 'พนักงานขาย', income: '25000+' },
    overrides: { salaryMin: '', salaryMax: '' },
  });
  assert.equal('salaryMin' in criteria, false);
  assert.equal('salaryMax' in criteria, false);
});

test('job_family is not copied into industry', () => {
  const criteria = buildScrapeCriteria({
    snapshot: { position: 'พนักงานขับรถ', job_family: 'Labor Contract - Driver' },
  });
  assert.equal(criteria.position, 'พนักงานขับรถ');
  assert.equal('industry' in criteria, false);
});

test('orchestrator prefill shows ไม่ระบุ instead of ERP O, without inventing keyword', () => {
  const plan = prefillScrapePlan({
    position: 'เจ้าหน้าที่ IT',
    location: 'นนทบุรี',
    gender: 'O',
    income: '30000',
    qty: '5',
  });
  assert.equal(plan.gender, 'ไม่ระบุ');
  assert.equal(plan.education, 'ไม่ระบุ');
  assert.equal(plan.keyword, '');
  assert.equal(plan.industry, '');
  assert.equal(plan.salary_min, '30000');
  assert.equal(plan.salary_max, '');
});

test('intake criteria is what Talent Normal Search actually applies', () => {
  const criteria = buildScrapeCriteria({
    snapshot: {
      position: 'เจ้าหน้าที่ IT',
      location: 'สมุทรปราการ',
      keyword: 'ขาย',
      industry: 'การขาย',
      education: 'ปริญญาตรี',
      income: '25000',
      age_min: '25',
    },
    overrides: { gender: 'ไม่ระบุ' },
  });
  const plan = planTalentNormalFilters(criteria);
  assert.deepEqual(plan.map((step) => step.field), [
    'position', 'keyword', 'jobTypes', 'province', 'education', 'salary', 'age',
  ]);
});

test('age range is rejected when inverted', () => {
  assert.throws(() => assertAgeRange({ ageMin: '45', ageMax: '25' }), /อายุต่ำสุด/);
  assert.doesNotThrow(() => assertAgeRange({ ageMin: '25', ageMax: '45' }));
});
