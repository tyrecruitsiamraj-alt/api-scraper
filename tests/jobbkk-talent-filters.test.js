import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapCriteriaToPremiumFilters,
  parseEducationRange,
  planTalentNormalFilters,
  salaryOptionLabels,
  shouldSupplementWithAiSearch,
} from '../src/providers/jobbkk/talent-filter-plan.js';
import { buildJobbkkAiQuery } from '../src/providers/jobbkk/strategies/ai-search.js';

test('Normal Search plan follows Talent form order and skips empty fields', () => {
  const plan = planTalentNormalFilters({
    position: 'เจ้าหน้าที่ IT',
    keyword: 'ขาย, การขายสินค้า',
    industry: 'การขาย',
    province: 'สมุทรปราการ',
    education: 'ปริญญาตรี',
    salaryMin: '25000',
    salaryMax: '25000',
    ageMin: '25',
    gender: 'ไม่ระบุ',
  });
  assert.deepEqual(plan.map((step) => step.field), [
    'position', 'keyword', 'jobTypes', 'province', 'education', 'salary', 'age',
  ]);
  assert.deepEqual(plan.find((step) => step.field === 'keyword').value, ['ขาย', 'การขายสินค้า']);
  assert.deepEqual(plan.find((step) => step.field === 'education').value, { min: 'ปริญญาตรี', max: 'ปริญญาเอก' });
  assert.equal(plan.some((step) => step.field === 'gender'), false);
});

test('education range in the source stays exact and is not widened', () => {
  assert.deepEqual(parseEducationRange('ปริญญาตรี-ปริญญาตรี'), { min: 'ปริญญาตรี', max: 'ปริญญาตรี' });
});

test('salary labels keep the digits the request actually had', () => {
  assert.deepEqual(salaryOptionLabels('25000'), ['25000', '25,000', '25,000+']);
  assert.deepEqual(salaryOptionLabels(''), []);
});

test('premium mapping now forwards occupation and work type from the request', () => {
  const mapped = mapCriteriaToPremiumFilters({
    position: 'พนักงานขาย',
    industry: 'การขาย',
    workType: 'งานประจำ',
    province: 'กรุงเทพมหานคร',
    education: 'ปริญญาตรี',
  });
  assert.deepEqual(mapped.jobTypes, ['การขาย']);
  assert.equal(mapped.workType, 'งานประจำ');
  assert.deepEqual(mapped.areas, ['กรุงเทพมหานคร']);
});

test('AI Search is used only when Normal Search is short of target', () => {
  assert.equal(shouldSupplementWithAiSearch(15, 15), false);
  assert.equal(shouldSupplementWithAiSearch(10, 15), true);
  assert.equal(shouldSupplementWithAiSearch(0, 15), true);
  assert.equal(shouldSupplementWithAiSearch(5, 0), false);
});

test('AI query uses only factual criteria', () => {
  const query = buildJobbkkAiQuery({
    position: 'พนักงานขับรถ',
    province: 'นนทบุรี',
    ageMin: 25,
    ageMax: 45,
  });
  assert.match(query, /พนักงานขับรถ/);
  assert.match(query, /นนทบุรี/);
  assert.match(query, /25-45/);
});
