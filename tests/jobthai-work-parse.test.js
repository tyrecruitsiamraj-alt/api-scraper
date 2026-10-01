import test from 'node:test';
import assert from 'node:assert/strict';
import { isJobThaiPeriodLine, parseWork } from '../src/providers/jobthai/parser.js';

test('detects JobThai month period lines', () => {
  assert.equal(isJobThaiPeriodLine('ก.ย. 56 - พ.ค. 57'), true);
  assert.equal(isJobThaiPeriodLine('ก.พ. 55 - ก.ย. 58'), true);
  assert.equal(isJobThaiPeriodLine('2556 - 23'), false);
  assert.equal(isJobThaiPeriodLine('บริษัท เชโก้ (ประเทศไทย)จำกัด'), false);
});

test('parses period, company, salary, position and duties from JobThai layout', () => {
  const sample = `
ประวัติการทำงาน/ฝึกงาน
ปีที่จบ 2546
จาก มหาวิทยาลัยธุรกิจบัณฑิตย์ ระดับ ปริญญาตรี
ก.พ. 56 - ก.พ. 56
สถาบัน NPC S&E หลักสูตร คณะกรรมการความปลอดภัย
2554 - 30
2555 - 31
ก.พ. 55 - ก.ย. 58
บริษัท เชโก้ (ประเทศไทย)จำกัด
เงินเดือน 27,000 บาท/เดือน ตำแหน่ง หัวหน้าฝ่ายบุคคลและธุรการ
บริษัท เชโก้ (ประเทศไทย)จำกัด
เงินเดือน 27,000 บาท/เดือน ตำแหน่ง หัวหน้าฝ่ายบุคคลและธุรการ หน้าที่-ผลงาน 1.ควบคุมดูแลพนักงานใต้บังคับบัญชา
2.งานด้านงานบุคคล
ต.ค. 58 - ต.ค. 59
บริษัท บีเอ็มดับเบิ้ลยู แมนูแฟคเจอร์ริ่ง จำกัด(มหาชน)BMW
เงินเดือน 30,000 บาท/เดือน ตำแหน่ง Employee Relation Specialist
บริษัท บีเอ็มดับเบิ้ลยู แมนูแฟคเจอร์ริ่ง จำกัด(มหาชน)BMW
เงินเดือน 30,000 บาท/เดือน ตำแหน่ง Employee Relation Specialist หน้าที่-ผลงาน ดูแลแรงงานสัมพันธ์
`;
  const work = parseWork(sample);
  assert.equal(work.length, 2);
  assert.equal(work[0].period, 'ก.พ. 55 - ก.ย. 58');
  assert.match(work[0].company, /เชโก้/);
  assert.equal(work[0].salary, '27,000');
  assert.match(work[0].position, /หัวหน้าฝ่ายบุคคล/);
  assert.match(work[0].responsibilities, /ควบคุมดูแลพนักงาน/);
  assert.equal(work[1].period, 'ต.ค. 58 - ต.ค. 59');
  assert.match(work[1].responsibilities, /แรงงานสัมพันธ์/);
});

test('parses companies without the word บริษัท', () => {
  const sample = `
ก.ย. 56 - พ.ค. 57
Mini Big C สาขาตลาดพระพรหมเครือสหพัฒน์
เงินเดือน 12,000 ตำแหน่ง ผู้ช่วยผู้จัดการสาขา
Mini Big C สาขาตลาดพระพรหมเครือสหพัฒน์
เงินเดือน 12,000 ตำแหน่ง ผู้ช่วยผู้จัดการสาขา หน้าที่-ผลงาน รับผิดชอบระบบการเงิน
`;
  const work = parseWork(sample);
  assert.equal(work.length, 1);
  assert.equal(work[0].period, 'ก.ย. 56 - พ.ค. 57');
  assert.match(work[0].company, /Mini Big C/);
  assert.match(work[0].responsibilities, /ระบบการเงิน/);
});
