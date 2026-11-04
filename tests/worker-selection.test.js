import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scraperSlotLockName,
  scraperSlotName,
  scraperSlotPrefix,
  selectPreferredScrapeWorker,
} from '../src/core/worker-selection.js';

const workers = [
  { name: 'scraper-1', meta: { machine_name: 'SONB-RM009' } },
  { name: 'scraper-2', meta: { machine_name: 'SONB-RM009' } },
];

test('เลือก slot ที่ออนไลน์ได้เมื่อ Web pin ด้วยชื่อเครื่องหลัก', () => {
  assert.equal(selectPreferredScrapeWorker(workers, 'SONB-RM009'), 'scraper-1');
});

test('ยังรองรับการ pin ด้วยชื่อ slot โดยตรง', () => {
  assert.equal(selectPreferredScrapeWorker(workers, 'scraper-2'), 'scraper-2');
});

test('ไม่ส่งงานเมื่อชื่อเครื่องที่ pin ไม่มี Worker ออนไลน์', () => {
  assert.equal(selectPreferredScrapeWorker(workers, 'OTHER-MACHINE'), null);
});

test('ไม่มี pin แล้วเลือก worker แรกที่พร้อม', () => {
  assert.equal(selectPreferredScrapeWorker(workers, ''), 'scraper-1');
});

// ชื่อ slot ต่อเครื่อง: เครื่องที่สองต้องไม่ทับ scraper-1/2 ของ RM009
const rm009Slots = [
  { name: 'scraper-1', machine_name: 'SONB-RM009' },
  { name: 'scraper-2', machine_name: 'SONB-RM009' },
];

test('RM009 ที่ถือชื่อ scraper-1/2 อยู่แล้วใช้ชื่อเดิมต่อ', () => {
  assert.equal(scraperSlotPrefix({ hostname: 'SONB-RM009', slots: rm009Slots }), '');
  assert.equal(scraperSlotName('', 1), 'scraper-1');
});

test('iMac เครื่องที่สองเติมชื่อเครื่องนำหน้า และตัด .local ออก', () => {
  const prefix = scraperSlotPrefix({ hostname: 'SO-iMac.local', slots: rm009Slots });
  assert.equal(prefix, 'SO-iMac');
  assert.equal(scraperSlotName(prefix, 2), 'SO-iMac-scraper-2');
});

test('ชื่อเครื่องเทียบแบบไม่สนตัวพิมพ์เล็กใหญ่', () => {
  assert.equal(scraperSlotPrefix({ hostname: 'sonb-rm009', slots: rm009Slots }), '');
});

test('ยังไม่มีเครื่องไหนใช้ชื่อ scraper-N ใช้ชื่อเดิมได้', () => {
  assert.equal(scraperSlotPrefix({ hostname: 'SO-iMac.local', slots: [] }), '');
  assert.equal(
    scraperSlotPrefix({ hostname: 'SO-iMac.local', slots: [{ name: 'mac-scraper-1', machine_name: 'Other' }] }),
    '',
  );
});

test('ตั้ง SCRAPER_SLOT_PREFIX เองแล้วใช้ค่านั้น', () => {
  assert.equal(scraperSlotPrefix({ hostname: 'SONB-RM009', slots: rm009Slots, explicit: 'imac' }), 'imac');
});

test('slot ที่มีชื่อเครื่องนำหน้ายังเลือกด้วยชื่อเครื่องได้ ไม่ปนกับ RM009', () => {
  const both = [
    ...workers,
    { name: 'SO-iMac-scraper-1', meta: { machine_name: 'SO-iMac.local' } },
  ];
  assert.equal(selectPreferredScrapeWorker(both, 'SO-iMac.local'), 'SO-iMac-scraper-1');
  assert.equal(selectPreferredScrapeWorker(both, 'SONB-RM009'), 'scraper-1');
});

test('ชื่อไฟล์ lock ตัดอักขระพิเศษเหมือน runner', () => {
  assert.equal(scraperSlotLockName('iMac ของ So-scraper-1'), 'iMac-So-scraper-1');
  assert.equal(scraperSlotLockName(''), 'standalone');
});
