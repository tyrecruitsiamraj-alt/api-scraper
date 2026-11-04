import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResumeQualification, summarizeRejections } from '../src/core/resume-qualification.js';
import { splitCriteria } from '../src/core/candidate-match.js';

test('ผ่านเมื่อหลักฐาน Hard Filter ครบ', () => {
  const result = evaluateResumeQualification(
    { province: 'กรุงเทพมหานคร', education_summary: 'ปริญญาตรี', driving_license: 'รถยนต์ส่วนบุคคล', age: '30' },
    { criteria: { province: 'กรุงเทพมหานคร', education: 'ปริญญาตรี', ageMax: '35' }, sourcingSpec: { hard_filters: [{ field: 'license', value: 'ใบขับขี่รถยนต์', evidence_terms: ['รถยนต์ส่วนบุคคล'] }] } },
  );
  assert.equal(result.status, 'qualified');
  assert.equal(result.score, 100);
});

// เจ้าของ 4 พ.ย. 2569: เกณฑ์ตัดมีแค่ จังหวัด อายุ เพศ (+ เพดานเงินเดือน) ที่เหลือใช้เรียงลำดับ
test('ไม่พบใบขับขี่ในเรซูเม่ ไม่ตัดทิ้ง แต่บอกว่ายังไม่พบ', () => {
  const result = evaluateResumeQualification({}, { sourcingSpec: { hard_filters: [{ field: 'license', value: 'ใบขับขี่รถยนต์' }] } });
  assert.equal(result.status, 'qualified');
  assert.deepEqual(result.evidence.soft_missing, ['ใบขับขี่รถยนต์']);
});

test('หลักฐานว่าไม่ผ่าน Hard Filter ต้องถูกปฏิเสธ', () => {
  const result = evaluateResumeQualification({ province: 'เชียงใหม่' }, { criteria: { province: 'กรุงเทพมหานคร' } });
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.reasons, ['location_mismatch']);
});

// เจ้าของ 4 พ.ย. 2569: ตำแหน่งไม่ตรงสาย "โชว์แต่ไม่นับเป้า"
test('ตำแหน่งคนละสายไม่ตัดทิ้ง แต่ไปอยู่ต้องตรวจเพิ่ม ไม่นับเป้า', () => {
  const spec = { sourcingSpec: { accepted_positions: ['QA Engineer', 'Data Tester', 'ETL Developer'] } };
  const other = evaluateResumeQualification({ name: 'ผู้สมัครหนึ่ง', desired_positions: 'ช่างซ่อมบำรุงอากาศยาน' }, spec);
  const unknown = evaluateResumeQualification({ name: 'ผู้สมัครสาม' }, spec);
  const match = evaluateResumeQualification({ name: 'ผู้สมัครสอง', desired_positions: 'Data Tester' }, spec);
  assert.equal(other.status, 'needs_review');
  assert.deepEqual(other.reasons, ['off_role']);
  assert.equal(unknown.status, 'needs_review');
  assert.deepEqual(unknown.reasons, ['insufficient_evidence:job_family']);
  assert.equal(match.status, 'qualified');
});

test('Resume ที่ไม่มีชื่อห้ามนับผ่านงาน Sourcing', () => {
  const result = evaluateResumeQualification(
    { desired_positions: 'Data Tester' },
    { sourcingSpec: { accepted_positions: ['Data Tester'] } },
  );
  assert.equal(result.status, 'needs_review');
  assert.match(result.reasons[0], /identity/);
});

test('ทักษะจากเนื้องานที่หลักฐานไม่ครบ ไม่ตัดทิ้ง แต่บอกว่ายังไม่พบ', () => {
  const result = evaluateResumeQualification(
    { name: 'ผู้สมัครทดสอบ', desired_positions: 'Data Tester', raw_text: 'ใช้ SQL ทดสอบฐานข้อมูล' },
    { sourcingSpec: { accepted_positions: ['Data Tester'], hard_filters: [{ field: 'skill', value: 'Data testing stack', evidence_terms: ['SQL', 'ETL/ELT'], match_mode: 'all' }] } },
  );
  assert.equal(result.status, 'qualified');
  assert.deepEqual(result.evidence.soft_missing, ['Data testing stack']);
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

test('summarizeRejections names the reasons people actually failed on, biggest first', () => {
  const text = summarizeRejections(105, 60, {
    gender_mismatch: 9, age_out_of_range: 23, wrong_job_family: 21, 'incomplete:gender': 3,
    incomplete_profile: 37, incomplete_attachments: 19, 'incomplete:work_experience': 35,
  });
  // โปรไฟล์/ไฟล์แนบไม่ครบ ไม่ใช่เหตุตัดแล้ว (4 พ.ย. 2569) จึงไม่อยู่ในรายการ "ถูกคัดออก"
  assert.equal(text, 'เว็บให้มา 105 คน เปิดดู 60 คน แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไข · อายุนอกช่วง 23 · ประสบการณ์ไม่ตรงสายงาน 21 · เพศไม่ตรง 9 (คนเดียวตกได้หลายข้อ)');
});

test('มีคนต้องตรวจเพิ่ม ห้ามบอกว่าถูกคัดออกทั้งหมด', () => {
  const text = summarizeRejections(60, 40, { incomplete_profile: 12, age_out_of_range: 5 }, 12);
  assert.equal(text, 'เว็บให้มา 60 คน เปิดดู 40 คน ยังไม่มีใครผ่านครบ · ต้องตรวจเพิ่ม 12 คน (ข้อมูลในเรซูเม่ไม่ครบ ดูได้ในหน้าผู้สมัคร) · ไม่ผ่าน: อายุนอกช่วง 5');
});

// ตัวอย่างของเจ้าของ 4 พ.ย. 2569: พนักงานขาย หญิง 25–50 ปี กรุงเทพ
// "เอาแค่อยู่กรุงเทพ อายุเข้าเกณฑ์ เพศใช่ เนื้องานค่อยว่ากัน ไม่งั้น 0 ตลอด"
test('พนักงานขาย หญิง 25–50 กรุงเทพ: ตัดแค่ จังหวัด อายุ เพศ', () => {
  const criteria = { province: 'กรุงเทพมหานคร', gender: 'หญิง', ageMin: '25', ageMax: '50', education: 'ปริญญาตรี' };
  const sourcingSpec = { accepted_positions: ['พนักงานขาย'] };
  const base = {
    name: 'ผู้สมัครทดสอบ', gender: 'หญิง', age: '32', desired_work_area: 'กรุงเทพมหานคร',
    desired_positions: 'แคชเชียร์', education_summary: 'ม.6',
  };
  const ok = evaluateResumeQualification({ ...base, desired_positions: 'พนักงานขายหน้าร้าน' }, { criteria, sourcingSpec });
  assert.equal(ok.status, 'qualified', 'วุฒิต่ำกว่าที่ใบขอเขียน ยังผ่าน');
  assert.ok(ok.evidence.soft_missing.includes('วุฒิ ปริญญาตรี'));
  const cashier = evaluateResumeQualification(base, { criteria, sourcingSpec });
  assert.equal(cashier.status, 'needs_review', 'แคชเชียร์ไม่ตรงสาย: โชว์แต่ไม่นับเป้า');
  assert.equal(evaluateResumeQualification({ ...base, gender: 'ชาย' }, { criteria, sourcingSpec }).status, 'rejected');
  assert.equal(evaluateResumeQualification({ ...base, age: '55' }, { criteria, sourcingSpec }).status, 'rejected');
  assert.equal(evaluateResumeQualification({ ...base, desired_work_area: 'เชียงใหม่' }, { criteria, sourcingSpec }).status, 'rejected');
});

test('เพดานเงินเดือนยังตัด แต่เรซูเม่ไม่ระบุเงินเดือนไม่ตัด', () => {
  const criteria = { salaryMax: '18000' };
  assert.equal(evaluateResumeQualification({ expected_salary: '25,000' }, { criteria }).status, 'rejected');
  assert.equal(evaluateResumeQualification({ expected_salary: '15,000-18,000' }, { criteria }).status, 'qualified');
  assert.equal(evaluateResumeQualification({}, { criteria }).status, 'qualified');
});
