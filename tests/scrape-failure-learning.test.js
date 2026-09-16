import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyScrapeFailure,
  classifyScrapeOutcome,
  filterZeroYieldExpansionTerms,
  lessonRowsToLogHits,
  rememberedPreventionLog,
} from '../src/core/scrape-failure-learning.js';

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

test('จำบทเรียนเปิด Resume แล้วผ่าน 0 จากผลรอบ ไม่ใช่แค่ข้อความ error', () => {
  const hit = classifyScrapeOutcome({ opened: 61, qualified: 0, rejected: 61 });
  assert.equal(hit.key, 'zero_qualified_yield');
  assert.match(hit.prevention, /ห้ามวนคำค้นเดิม/);
});

test('จำบทเรียนคัดออกทั้งหมดจากข้อความ error ของ pipeline', () => {
  const hit = classifyScrapeOutcome({
    error: 'เว็บให้มา 72 คน แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไข (ageMin=25, education=ปริญญาตรี)',
    opened: 72,
    qualified: 0,
    rejected: 72,
  });
  assert.equal(hit.key, 'local_filter_wipeout');
});

test('CAPTCHA หยุดบัญชี ไม่เดาคลิกต่อ', () => {
  const hit = classifyScrapeFailure('CAPTCHA: เจอหน้ายืนยันตัวตนของแพลตฟอร์ม ระบบหยุดบัญชีนี้แล้ว');
  assert.equal(hit.key, 'captcha_or_checkpoint');
});

test('อ่านบทเรียนจากฐานข้อมูลมาเตือนรอบใหม่', () => {
  const hits = lessonRowsToLogHits([
    { lesson_key: 'jobbkk_readonly_placeholder_click', prevention: 'คลิกเฉพาะ input ที่พิมพ์ได้' },
  ]);
  assert.match(rememberedPreventionLog(hits), /jobbkk_readonly_placeholder_click/);
});

test('ข้ามคำค้นขยายที่เปิดมากแล้วผ่าน 0 แต่ไม่ทิ้งคำต้นทาง', () => {
  const kept = filterZeroYieldExpansionTerms(
    ['ช่างประปา', 'ช่างไฟฟ้า', 'ช่างอาคาร'],
    ['ช่างไฟฟ้า', 'ช่างอาคาร'],
    ['ช่างประปา'],
  );
  assert.deepEqual(kept, ['ช่างประปา']);
});
