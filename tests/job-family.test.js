import test from 'node:test';
import assert from 'node:assert/strict';
import { knownPositionsFromDescription } from '../src/core/job-family.js';

test('แปลงเนื้องานขับรถเป็นคำค้นใน Family คนขับรถเท่านั้น', () => {
  const plan = knownPositionsFromDescription('ขับรถรับส่งผู้บริหารและดูแลรถ');
  assert.equal(plan.family, 'C');
  assert.equal(plan.positions[0], 'พนักงานขับรถ');
  assert.equal(plan.positions.includes('ธุรการ'), false);
});

test('แปลงงานทดสอบระบบไม่ไหลไปสายขายหรือต้อนรับ', () => {
  const plan = knownPositionsFromDescription('ทดสอบระบบและบันทึกข้อผิดพลาด');
  assert.equal(plan.family, 'B');
  assert.equal(plan.positions[0], 'เจ้าหน้าที่ทดสอบระบบ');
  assert.equal(plan.positions.includes('พนักงานขาย'), false);
});

test('แปลงงานธุรการเป็นคำค้นไทยที่ใช้จริง', () => {
  const plan = knownPositionsFromDescription('จัดทำเอกสาร คีย์ข้อมูล และประสานงานสำนักงาน');
  assert.equal(plan.family, 'D');
  assert.ok(plan.positions.includes('ธุรการ'));
  assert.ok(plan.positions.includes('คีย์ข้อมูล'));
});
