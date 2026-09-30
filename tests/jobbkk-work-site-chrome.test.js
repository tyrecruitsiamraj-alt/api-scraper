import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finalizeCandidateRecord,
  hasUsefulWorkExperience,
  isJobbkkSiteChromeText,
  isJunkWorkRow,
  parseWorkEntriesFromText,
  stripJobbkkSiteChrome,
} from '../src/providers/jobbkk/parser.js';

const LOGIN_I18N = [
  'ที่กำหนด คุณจะไม่สามารถเข้าสู่ระบบได้","max_case":"{name} ต้องไม่เกิน {num} ตัวอักษร"',
  '"no_html":"ไม่อนุญาตให้ใช้อักขระ < หรือ > ใน{name}","username_hint":"กรุณากรอกชื่อผู้ใช้งาน"',
  '"register_page":{"register_success":"สมัคร {role} สำเร็จ","register_failed":"สมัครสมาชิกไม่สำเร็จ"',
  'บริษัท จัดหางาน จ๊อบบีเคเค ดอท คอม จำกัด help@jobbkk.com',
].join(' ');

test('detects JobBKK login/register i18n as site chrome', () => {
  assert.equal(isJobbkkSiteChromeText(LOGIN_I18N), true);
  assert.equal(isJobbkkSiteChromeText('ข้อมูลบริษัท : บริษัท เอ จำกัด ตำแหน่งงาน : พนักงานขาย'), false);
});

test('parseWorkEntriesFromText rejects login chrome and keeps real jobs', () => {
  assert.deepEqual(parseWorkEntriesFromText(LOGIN_I18N), []);
  const mixed = [
    'ประวัติการทำงาน',
    LOGIN_I18N,
    '2022 ข้อมูลบริษัท : บริษัท ดี จำกัด ตำแหน่งงาน : พนักงานขาย Soft Skills',
  ].join(' ');
  const rows = parseWorkEntriesFromText(mixed);
  assert.equal(rows.length, 1);
  assert.match(rows[0].company, /ดี/);
  assert.match(rows[0].position, /พนักงานขาย/);
});

test('hasUsefulWorkExperience is false for JobBKK chrome rows', () => {
  const junk = [{
    company: 'บริษัท จัดหางาน จ๊อบบีเคเค ดอท คอม จำกัด',
    position: 'คุณจะไม่สามารถเข้าสู่ระบบได้',
  }];
  assert.equal(isJunkWorkRow(junk[0]), true);
  assert.equal(hasUsefulWorkExperience(junk), false);
});

test('real duties containing เข้าสู่ระบบ are not junk work', () => {
  const real = {
    company: 'บริษัท ไปรษณีย์ไทย จำกัด',
    position: 'พนักงานผู้ช่วย',
    responsibilities: 'ยิงคิวอาร์โค้ดพัสดุเข้าสู่ระบบออนไลน์',
  };
  assert.equal(isJunkWorkRow(real), false);
  assert.equal(hasUsefulWorkExperience([real]), true);
});

test('finalizeCandidateRecord strips chrome work and recovers real experience from raw_text', () => {
  const parsed = finalizeCandidateRecord({
    name: 'นายทดสอบ',
    work_experience: [{
      company: 'บริษัท จัดหางาน จ๊อบบีเคเค ดอท คอม จำกัด',
      position: 'register_page',
    }],
    experience_summary: LOGIN_I18N,
    raw_text: [
      'ประวัติการทำงาน 2021 ข้อมูลบริษัท : บริษัท โอ จำกัด ตำแหน่งงาน : ช่างอาคาร Soft Skills',
      LOGIN_I18N,
    ].join(' '),
  });
  assert.equal(hasUsefulWorkExperience(parsed.work_experience), true);
  assert.match(parsed.work_experience[0].company, /โอ/);
  assert.equal(isJobbkkSiteChromeText(parsed.experience_summary || ''), false);
  assert.ok(!/register_page|username_hint|max_case/i.test(stripJobbkkSiteChrome(parsed.raw_text)));
});
