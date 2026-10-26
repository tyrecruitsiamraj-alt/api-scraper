import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedPositionsForTitle } from '../src/core/job-family.js';
import { evaluateResumeQualification } from '../src/core/resume-qualification.js';

test('ตำแหน่งที่มีคำขยายยังรับคนในสายงานเดียวกัน (คนขับรถ)', () => {
  const accepted = acceptedPositionsForTitle('พนักงานขับรถ นายไทย');
  assert.equal(accepted[0], 'พนักงานขับรถ นายไทย');
  assert.ok(accepted.includes('พนักงานขับรถส่วนกลาง'));

  const driver = {
    name: 'ทดสอบ',
    desired_positions: '1. พนักงานขับรถส่วนกลาง',
    work_experience: [{ position: 'ขับรถส่วนกลาง' }, { position: 'พนักงานขับรถ' }],
  };
  const result = evaluateResumeQualification(driver, { criteria: {}, sourcingSpec: { accepted_positions: accepted } });
  assert.ok(!result.reasons.includes('wrong_job_family'), JSON.stringify(result.reasons));
});

test('คนละสายงานยังถูกคัดออก', () => {
  const accepted = acceptedPositionsForTitle('พนักงานขับรถ นายไทย');
  const mechanic = { name: 'ทดสอบ', desired_positions: '1. ช่างซ่อมบำรุง', work_experience: [{ position: 'ช่าง Service' }] };
  const result = evaluateResumeQualification(mechanic, { criteria: {}, sourcingSpec: { accepted_positions: accepted } });
  assert.ok(result.reasons.includes('wrong_job_family'));
});

test('ตำแหน่งที่พจนานุกรมไม่รู้จัก ใช้ชื่อตำแหน่งเดิมอย่างเดียว', () => {
  assert.deepEqual(acceptedPositionsForTitle('นักบินอวกาศ'), ['นักบินอวกาศ']);
  assert.deepEqual(acceptedPositionsForTitle(''), []);
});
