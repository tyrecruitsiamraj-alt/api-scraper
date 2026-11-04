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

// เจ้าของ 4 พ.ย. 2569: สายงานไม่ใช่เหตุตัด แต่คนไม่ตรงสายไม่นับเป้า
test('คนละสายงานไม่ถูกตัด แต่ไปอยู่ต้องตรวจเพิ่ม', () => {
  const accepted = acceptedPositionsForTitle('พนักงานขับรถ นายไทย');
  const spec = { criteria: {}, sourcingSpec: { accepted_positions: accepted } };
  const mechanic = { name: 'ทดสอบ', desired_positions: '1. ช่างซ่อมบำรุง', work_experience: [{ position: 'ช่าง Service' }] };
  const driver = { name: 'ทดสอบสอง', desired_positions: 'พนักงานขับรถ', work_experience: [{ position: 'พนักงานขับรถผู้บริหาร' }] };
  const off = evaluateResumeQualification(mechanic, spec);
  const on = evaluateResumeQualification(driver, spec);
  assert.ok(!off.reasons.includes('wrong_job_family'));
  assert.equal(off.status, 'needs_review', 'โชว์แต่ไม่นับเป้า');
  assert.equal(off.evidence.role_match, false);
  assert.equal(on.status, 'qualified');
});

test('ตำแหน่งที่พจนานุกรมไม่รู้จัก ใช้ชื่อตำแหน่งเดิมอย่างเดียว', () => {
  assert.deepEqual(acceptedPositionsForTitle('นักบินอวกาศ'), ['นักบินอวกาศ']);
  assert.deepEqual(acceptedPositionsForTitle(''), []);
});
