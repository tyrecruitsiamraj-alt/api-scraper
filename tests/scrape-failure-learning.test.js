import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyScrapeFailure, rememberedPreventionLog } from '../src/core/scrape-failure-learning.js';

test('จำบทเรียน JobBKK คลิก div ช่องตำแหน่งแล้วห้ามทำซ้ำ', () => {
  const hit = classifyScrapeFailure('locator.click: Timeout 15000ms exceeded.\nwaiting for getByPlaceholder(/ชื่อตำแหน่ง/)\nค้นหาชื่อตำแหน่งงาน');
  assert.equal(hit.key, 'jobbkk_readonly_placeholder_click');
  assert.match(hit.prevention, /input ที่พิมพ์ได้/);
});

test('จำบทเรียน JobThai ไม่มีกล่องเรียงแล้วห้าม abort ทั้งงาน', () => {
  const hit = classifyScrapeFailure('JobThai ไม่ยืนยันการเรียงวันที่แก้ไขล่าสุด — หยุดเพื่อไม่ดึง Resume ผิดลำดับ (#mainsort)');
  assert.equal(hit.key, 'jobthai_latest_sort');
  assert.match(hit.prevention, /ห้าม abort/);
});

test('จำบทเรียน login Ant Design ของ JobBKK', () => {
  const hit = classifyScrapeFailure('JobBKK Login ยังไม่สร้าง Employer Session (ไปที่ https://www.jobbkk.com/login/employer_login) โปรดดู .auth/jobbkk-postlogin.png');
  assert.equal(hit.key, 'jobbkk_employer_login');
});

test('ไม่เก็บข้อความว่างเป็นบทเรียน', () => {
  assert.equal(classifyScrapeFailure(''), null);
});

test('พิมพ์บทเรียนที่จำแล้วให้งานรอบใหม่เห็นกติกาป้องกัน', () => {
  const log = rememberedPreventionLog([
    classifyScrapeFailure('daily cap reached (434/200)'),
  ]);
  assert.match(log, /connector_daily_cap/);
  assert.match(log, /ตรวจ cap ก่อนเริ่มค้น/);
});
