import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_JARVIS_SCRAPE_SQL, FINISHED_JARVIS_SCRAPES_SQL, REJECT_JARVIS_SCRAPE_SQL, rejectJarvisScrapeParams, scrapeFailNote, scrapeOutcome } from '../src/core/jarvis-scrape-status.js';

// ข้อความดิบจริงของ LMO6911012 (16 พ.ย. 2569)
const LMO_ERROR = 'JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันตำแหน่งหรือ Keyword จึงไม่รับผลค้นหาแบบกว้าง (กล่องตำแหน่งว่าง ไม่มีชิป) · โครงกล่อง: div.ant-select-selection-search-input.flex.items-center · ตัวนับชิป 0';

test('เหตุที่ส่งกลับ Jarvis เป็นประโยคคนอ่าน ไม่มีชื่อโค้ด/โครงหน้าเว็บ', () => {
  assert.equal(scrapeFailNote(LMO_ERROR), 'JobBKK เลือกตำแหน่งในหน้าค้นหาไม่ได้ ระบบจึงหยุดเพื่อไม่ดึงคนตำแหน่งอื่นมาปน');
  assert.equal(
    scrapeFailNote('JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันจังหวัดตามใบขอ จึงไม่รับผลค้นหาทั้งประเทศ'),
    'JobBKK เลือกจังหวัดในหน้าค้นหาไม่ได้ ระบบจึงหยุดเพื่อไม่ดึงคนทั้งประเทศมาปน',
  );
  assert.equal(scrapeFailNote('locator.click: Timeout 15000ms exceeded.'), 'กดช่องค้นหาบนเว็บหางานไม่สำเร็จ');
  assert.equal(scrapeFailNote('provider daily cap reached'), 'โควต้าค้นหาวันนี้เต็มแล้ว');
});

test('เหตุที่ไม่รู้จัก = ท่อนแรกของข้อความ ไม่เกิน 200 ตัว · ว่าง = ค้นหาไม่สำเร็จ', () => {
  assert.equal(scrapeFailNote('เปิดหน้าค้นหาไม่ได้ · รายละเอียดเทคนิค'), 'เปิดหน้าค้นหาไม่ได้');
  assert.equal(scrapeFailNote('ก'.repeat(300)).length, 200);
  assert.equal(scrapeFailNote(''), 'ค้นหาไม่สำเร็จ');
});

test('notes ขึ้นต้น "ตีกลับ: " ให้ Jarvis ตัดออกเอง · ปิดเฉพาะใบ Scrap ที่ยังเปิดอยู่', () => {
  assert.deepEqual(rejectJarvisScrapeParams('t1', LMO_ERROR), ['t1', 'ตีกลับ: JobBKK เลือกตำแหน่งในหน้าค้นหาไม่ได้ ระบบจึงหยุดเพื่อไม่ดึงคนตำแหน่งอื่นมาปน']);
  assert.match(REJECT_JARVIS_SCRAPE_SQL, /r\.status IN \('pending', 'in_progress'\)/);
  assert.match(REJECT_JARVIS_SCRAPE_SQL, /request_type' = 'scraping'/);
});

test('ผลจริงของงานที่ค้นจบ: ครบเป้า = เสร็จ · ผ่านบางส่วน = เจอบางส่วน · ไม่มีใครผ่าน = ไม่สำเร็จ', () => {
  // LAO6911016 (24/20) และ LMO6911012 (3/20 รอตรวจ 46) ณ 17 พ.ย. 2569
  assert.deepEqual(scrapeOutcome({ target: 20, qualified: 24, waiting: 0 }), { status: 'completed', label: 'เสร็จ', notes: 'ได้ครบ: ผ่านเกณฑ์ 24/20 คน' });
  assert.deepEqual(scrapeOutcome({ target: 20, qualified: 3, waiting: 46 }), { status: 'completed', label: 'เจอบางส่วน', notes: 'เจอบางส่วน: ผ่านเกณฑ์ 3/20 คน · รอตรวจอีก 46 คน' });
  assert.deepEqual(scrapeOutcome({ target: 15, qualified: 0, waiting: 0 }), { status: 'rejected', label: 'ไม่สำเร็จ', notes: 'ตีกลับ: ค้นครบทุกคำแล้ว ไม่เจอคนผ่านเกณฑ์' });
  assert.equal(scrapeOutcome({ target: 15, qualified: 0, waiting: 7 }).notes, 'ตีกลับ: ค้นครบทุกคำแล้ว ไม่เจอคนผ่านเกณฑ์ · รอตรวจอีก 7 คน');
  // ไม่มีเป้า: มีคนผ่าน = เสร็จ
  assert.equal(scrapeOutcome({ target: 0, qualified: 5 }).notes, 'ได้ครบ: ผ่านเกณฑ์ 5 คน');
});

test('ปิดเฉพาะใบ Scrap ที่ยังทำอยู่ และงานยังจบอยู่จริงตอนเขียน', () => {
  for (const sql of [FINISHED_JARVIS_SCRAPES_SQL, CLOSE_JARVIS_SCRAPE_SQL]) {
    assert.match(sql, /t\.status IN \('done', 'partial'\)/);
    assert.match(sql, /r\.status = 'in_progress'/);
    assert.match(sql, /request_type' = 'scraping'/);
  }
});
