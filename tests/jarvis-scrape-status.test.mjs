import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPLETE_JARVIS_SCRAPES_SQL, REJECT_JARVIS_SCRAPE_SQL, rejectJarvisScrapeParams, scrapeFailNote } from '../src/core/jarvis-scrape-status.js';

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

test('ค้นจบ (ครบหรือไม่ครบเป้า) = ใบ Scrap ใน Jarvis เสร็จ · แตะเฉพาะใบที่ยังทำอยู่ ไม่แตะใบรอเริ่ม/ใบโพสต์', () => {
  assert.match(COMPLETE_JARVIS_SCRAPES_SQL, /SET status = 'completed'/);
  assert.match(COMPLETE_JARVIS_SCRAPES_SQL, /t\.status IN \('done', 'partial'\)/);
  assert.match(COMPLETE_JARVIS_SCRAPES_SQL, /r\.status = 'in_progress'/);
  assert.match(COMPLETE_JARVIS_SCRAPES_SQL, /request_type' = 'scraping'/);
});
