import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResumeQualification } from '../src/core/resume-qualification.js';

test('ผ่านเมื่อหลักฐาน Hard Filter ครบ', () => {
  const result = evaluateResumeQualification(
    { province: 'กรุงเทพมหานคร', education_summary: 'ปริญญาตรี', driving_license: 'รถยนต์ส่วนบุคคล', age: '30' },
    { criteria: { province: 'กรุงเทพมหานคร', education: 'ปริญญาตรี', ageMax: '35' }, sourcingSpec: { hard_filters: [{ field: 'license', value: 'ใบขับขี่รถยนต์', evidence_terms: ['รถยนต์ส่วนบุคคล'] }] } },
  );
  assert.equal(result.status, 'qualified');
  assert.equal(result.score, 100);
});

test('ข้อมูลใบอนุญาตบังคับหายไปต้องตรวจเพิ่มและห้ามนับผ่าน', () => {
  const result = evaluateResumeQualification({}, { sourcingSpec: { hard_filters: [{ field: 'license', value: 'ใบขับขี่รถยนต์' }] } });
  assert.equal(result.status, 'needs_review');
  assert.match(result.reasons[0], /required_license/);
});

test('หลักฐานว่าไม่ผ่าน Hard Filter ต้องถูกปฏิเสธ', () => {
  const result = evaluateResumeQualification({ province: 'เชียงใหม่' }, { criteria: { province: 'กรุงเทพมหานคร' } });
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.reasons, ['location_mismatch']);
});
