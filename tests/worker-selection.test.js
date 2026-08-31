import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPreferredScrapeWorker } from '../src/core/worker-selection.js';

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
