import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingFromRawText, genderFromPageText, nameFromPageText } from '../src/providers/jobbkk/parser.js';

// 21 พ.ย. 2569: ผู้สมัคร JobBKK 810 คนไม่มีเพศ 123 คนไม่มีชื่อ ทั้งที่หน้าที่เก็บไว้มีอยู่ (หน้าแบบใหม่ไม่มีป้าย "เพศ")
const NEW_PAGE = 'ดูมุมมองผู้สมัครงานสมชาย ใจดีมากความสมบูรณ์ของ ใบสมัครงาน80%อัปเดตข้อมูลล่าสุด : 2026-09-01ข้อมูลติดต่อผู้สมัครที่อยู่ปัจจุบัน- XXXศาสนา- พุทธอีเมล- somchai.test@example.orgชายโสดวันเดือนปีเกิด01';
const OLD_PAGE = 'Preview Resume ชื่อเรซูเม่ : ธุรการ นัดสัมภาษณ์ ©All Rights Reserved นางสาวสมหญิง รักงาน ความสมบูรณ์ของใบสมัครงาน 90% เพศ : หญิง สถานภาพ โสด';

test('อ่านเพศจากหน้าแบบใหม่ (ติดกับสถานภาพ) และแบบมีป้าย', () => {
  assert.equal(genderFromPageText(NEW_PAGE), 'ชาย');
  assert.equal(genderFromPageText(OLD_PAGE), 'หญิง');
  assert.equal(genderFromPageText('…หญิงสมรสวันเดือนปีเกิด…'), 'หญิง');
});

test('ไม่เดาเพศ: คำว่าชาย/หญิงในประโยคอื่น หรือเจอสองค่าขัดกัน', () => {
  assert.equal(genderFromPageText('รับสมัครพนักงานชายโสดหรือสมรสก็ได้'), '');
  assert.equal(genderFromPageText('ดูแลลูกค้าผู้หญิง เคยทำงานที่ชายแดน'), '');
  assert.equal(genderFromPageText('เพศ : ชาย … หญิงโสด'), '');
  assert.equal(genderFromPageText('"gender":"เพศ","male":"ชาย","female":"หญิง"'), '');
});

test('อ่านชื่อ-นามสกุลหัวโปรไฟล์ทั้งสองแบบ', () => {
  assert.equal(nameFromPageText(NEW_PAGE), 'สมชาย ใจดีมาก');
  assert.equal(nameFromPageText(OLD_PAGE), 'นางสาวสมหญิง รักงาน');
  assert.equal(nameFromPageText('ไม่มีหัวโปรไฟล์'), '');
});

test('ตัวเติมช่องว่างจากข้อความหน้า ใส่เพศให้เมื่อยังว่าง ไม่ทับของเดิม', () => {
  assert.equal(fillMissingFromRawText({ gender: '' }, NEW_PAGE).gender, 'ชาย');
  assert.equal(fillMissingFromRawText({ gender: 'หญิง' }, NEW_PAGE).gender, 'หญิง');
});
