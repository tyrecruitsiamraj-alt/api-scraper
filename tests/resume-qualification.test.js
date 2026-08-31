import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResumeQualification } from '../src/core/resume-qualification.js';
import { splitCriteria } from '../src/core/candidate-match.js';

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

test('ตำแหน่งใน Family เดียวกันแต่คนละงานต้องไม่ผ่าน', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', desired_positions: 'ช่างซ่อมบำรุงอากาศยาน' },
    { sourcingSpec: { accepted_positions: ['QA Engineer', 'Data Tester', 'ETL Developer'] } },
  );
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.reasons, ['wrong_job_family']);
});

test('Resume ที่ไม่มีชื่อห้ามนับผ่านงาน Sourcing', () => {
  const result = evaluateResumeQualification(
    { desired_positions: 'Data Tester' },
    { sourcingSpec: { accepted_positions: ['Data Tester'] } },
  );
  assert.equal(result.status, 'needs_review');
  assert.match(result.reasons[0], /identity/);
});

test('Hard Filter แบบ all ต้องมีหลักฐานครบทุกข้อ', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', desired_positions: 'Data Tester', raw_text: 'ใช้ SQL ทดสอบฐานข้อมูล' },
    { sourcingSpec: { accepted_positions: ['Data Tester'], hard_filters: [{ field: 'skill', value: 'Data testing stack', evidence_terms: ['SQL', 'ETL/ELT'], match_mode: 'all' }] } },
  );
  assert.equal(result.status, 'needs_review');
  assert.match(result.reasons[0], /required_skill/);
});

test('Hard Filter แบบ all ผ่านเมื่อหลักฐานครบ', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', desired_positions: 'Data Tester', raw_text: 'ใช้ SQL ตรวจสอบ ETL pipeline' },
    { sourcingSpec: { accepted_positions: ['Data Tester'], hard_filters: [{ field: 'skill', value: 'Data testing stack', evidence_terms: ['SQL', 'ETL/ELT'], match_mode: 'all' }] } },
  );
  assert.equal(result.status, 'qualified');
});

test('ทักษะที่เป็น Soft Score ไม่กัน Resume ตรงสายออก', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', desired_positions: 'Data Tester', raw_text: 'ทดสอบระบบและฐานข้อมูล' },
    { sourcingSpec: { accepted_positions: ['Data Tester'], soft_scores: [{ field: 'skill', value: 'SQL', evidence_terms: ['SQL'] }, { field: 'skill', value: 'ETL/ELT', evidence_terms: ['ETL/ELT'] }] } },
  );
  assert.equal(result.status, 'qualified');
  assert.ok(result.score >= 60);
  assert.deepEqual(result.evidence.soft_missing, ['SQL', 'ETL/ELT']);
});

test('Soft Score จัดคนที่มีหลักฐานครบไว้สูงกว่า', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', desired_positions: 'Data Tester', raw_text: 'ใช้ SQL ตรวจสอบ ETL pipeline' },
    { sourcingSpec: { accepted_positions: ['Data Tester'], soft_scores: [{ field: 'skill', value: 'SQL', evidence_terms: ['SQL'] }, { field: 'skill', value: 'ETL/ELT', evidence_terms: ['ETL/ELT'] }] } },
  );
  assert.equal(result.status, 'qualified');
  assert.ok(result.score > 60);
});

test('ผู้สมัครที่มีประสบการณ์ตรงต้องได้คะแนนสูงกว่าคนที่ระบุแค่ตำแหน่งที่ต้องการ', () => {
  const spec = { sourcingSpec: { accepted_positions: ['พนักงานขับรถ'] } };
  const desiredOnly = evaluateResumeQualification({
    name: 'ผู้สมัครหนึ่ง', desired_positions: 'พนักงานขับรถ', last_updated_at: '2020-01-01',
  }, spec);
  const experienced = evaluateResumeQualification({
    name: 'ผู้สมัครสอง', desired_positions: 'พนักงานขับรถ', work_experience: [{ position: 'พนักงานขับรถผู้บริหาร' }], last_updated_at: new Date().toISOString(),
  }, spec);
  assert.equal(desiredOnly.status, 'qualified');
  assert.equal(experienced.status, 'qualified');
  assert.ok(experienced.score > desiredOnly.score);
  assert.equal(experienced.evidence.scorecard_version, 'candidate-fit-v1');
});

test('ผ่าน Role Gate อย่างเดียวห้ามได้ 100 โดยไม่มีหลักฐานเชิงลึก', () => {
  const result = evaluateResumeQualification({
    name: 'ผู้สมัครทดสอบ', desired_positions: 'ธุรการ',
  }, { sourcingSpec: { accepted_positions: ['ธุรการ'] } });
  assert.equal(result.status, 'qualified');
  assert.ok(result.score < 100);
});

test('ชื่อตำแหน่งที่คนเข้าใจว่าเป็นงานเดียวกันไม่ต้องตรงทุกตัวอักษร', () => {
  const result = evaluateResumeQualification({
    name: 'ผู้สมัครทดสอบ',
    work_experience: [{ position: 'พนักงานฝ่ายบริการลูกค้า/ลูกค้าสัมพันธ์' }],
  }, {
    sourcingSpec: { accepted_positions: ['พนักงานบริการลูกค้า'] },
  });
  assert.equal(result.status, 'qualified');
});

test('ตำแหน่งภาษาไทยและอังกฤษที่มีความหมายเดียวกันต้องจับคู่ได้', () => {
  const result = evaluateResumeQualification({
    name: 'ผู้สมัครทดสอบ',
    work_experience: [{ position: 'Customer Service (Contact Center)' }],
  }, {
    sourcingSpec: { accepted_positions: ['พนักงานบริการลูกค้า'] },
  });
  assert.equal(result.status, 'qualified');
});

test('อ่านช่วงเงินเดือนและพื้นที่ที่ต้องการทำงานแบบมนุษย์', () => {
  const result = evaluateResumeQualification({
    province: 'สมุทรปราการ',
    desired_work_area: 'กรุงเทพมหานคร (ทุกเขต)',
    expected_salary: '15,000 - 20,000 บาท',
  }, {
    criteria: { province: 'กรุงเทพมหานคร', salaryMax: '20000' },
  });
  assert.equal(result.status, 'qualified');
  assert.deepEqual(result.evidence.passed.sort(), ['province', 'salary_max']);
});

test('อายุนอกช่วงต้องไม่ถูกนับผ่าน', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', age: '48' },
    { criteria: { ageMin: '25', ageMax: '45' } },
  );
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.reasons, ['age_out_of_range']);
});

test('ไม่ระบุอายุเมื่อใบงานกำหนดช่วง ต้องส่งให้ตรวจเพิ่ม', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ' },
    { criteria: { ageMin: '25', ageMax: '45' } },
  );
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.reasons, ['insufficient_evidence:age']);
});

test('ช่วงอายุ snake_case จากใบงานเก่าต้องถูกใช้จริง', () => {
  const criteria = { position: 'พนักงานขับรถ', age_min: '25', age_max: '45' };
  const { siteCriteria } = splitCriteria(criteria);
  assert.equal(siteCriteria.ageMin, '25');
  assert.equal(siteCriteria.ageMax, '45');
  assert.equal('age_min' in siteCriteria, false);
  assert.equal('age_max' in siteCriteria, false);

  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', age: '50' },
    { criteria },
  );
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.reasons, ['age_out_of_range']);
});
