import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchUrl, isLatestUpdatedSortSelected, normalizeUpdatedSince } from '../src/providers/jobthai/client.js';
import { findLatestSortOption, isDescendingLatest, parseProviderUpdatedAt } from '../src/providers/jobbkk/latest-sort.js';

test('JobThai บังคับเรียงวันที่แก้ไขล่าสุดและส่งวันที่เริ่มอัปเดตแบบ exact date', () => {
  const url = new URL(buildSearchUrl({ position: 'พนักงานขับรถ', updatedSince: '2026-08-20' }));
  assert.equal(url.searchParams.has('sort'), true);
  assert.equal(url.searchParams.get('sort'), '');
  assert.equal(url.searchParams.get('time'), '65535');
  assert.equal(url.searchParams.get('theDate'), '2026-08-20');
});

test('JobThai ปฏิเสธวันที่ updatedSince ที่ไม่ถูกต้อง', () => {
  assert.equal(normalizeUpdatedSince('2026-08-31'), '2026-08-31');
  assert.throws(() => normalizeUpdatedSince('2026-02-30'), /ไม่ใช่วันที่จริง/);
  assert.throws(() => normalizeUpdatedSince('31\/08\/2026'), /YYYY-MM-DD/);
});

test('JobThai ตรวจหลักฐานว่าตัวเลือกวันที่แก้ไขล่าสุดถูกเลือก', () => {
  const html = '<select id="mainsort"><option selected value="latest">วันที่แก้ไขล่าสุด</option><option value="2">การศึกษา</option></select>';
  assert.equal(isLatestUpdatedSortSelected(html), true);
  assert.equal(isLatestUpdatedSortSelected('<select id="mainsort"><option selected>การศึกษา</option></select>'), false);
});

test('JobBKK เลือก official sort control ที่ระบุอัปเดตล่าสุด', () => {
  const found = findLatestSortOption([
    { index: 0, options: [{ value: 'score', text: 'ความเกี่ยวข้อง', selected: true }] },
    { index: 1, options: [{ value: 'updated', text: 'วันที่อัปเดตล่าสุด', selected: false }] },
  ]);
  assert.deepEqual(found, { selectIndex: 1, value: 'updated', selected: false });
});

test('วันที่ไทยและปี พ.ศ. ใช้ตรวจ newest-first ได้', () => {
  const now = new Date('2026-08-31T12:00:00+07:00');
  assert.equal(parseProviderUpdatedAt('อัปเดต 31 ส.ค. 69', now), Date.UTC(2026, 7, 31));
  assert.equal(parseProviderUpdatedAt('อัปเดต 30/08/2569', now), Date.UTC(2026, 7, 30));
  assert.equal(isDescendingLatest(['อัปเดตวันนี้', 'อัปเดตเมื่อวาน', 'อัปเดต 2 วันก่อน'], now), true);
  assert.equal(isDescendingLatest(['อัปเดต 2 วันก่อน', 'อัปเดตวันนี้'], now), false);
});
