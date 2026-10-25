import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchUrl, splitPositions, confirmLatestUpdatedOrder, isLatestUpdatedSortSelected, normalizeUpdatedSince } from '../src/providers/jobthai/client.js';
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


test('JobThai ไม่ถือว่าไม่เจอ #mainsort เป็น fatal เมื่อยังมี Resume card', () => {
  const html = `
    <div><a href="/resume/0,11.html">สมชาย</a></div>
    <div><a href="/resume/0,12.html">สมหญิง</a></div>
  `;
  const order = confirmLatestUpdatedOrder(html);
  assert.equal(order.ok, false);
});

test('JobThai ยอมรับคำว่าวันที่อัปเดตล่าสุดและหลักฐานวันที่บนลิสต์', () => {
  assert.equal(
    isLatestUpdatedSortSelected('<select id="mainsort"><option selected value="">วันที่อัปเดตล่าสุด</option></select>'),
    true,
  );
  const html = `
    <div><a href="/resume/0,1.html">สมชาย แก้ไข 31 ส.ค. 69</a></div>
    <div><a href="/resume/0,2.html">สมหญิง แก้ไข 30 ส.ค. 69</a></div>
  `;
  const order = confirmLatestUpdatedOrder(html);
  assert.equal(order.ok, true);
  assert.equal(order.via, 'list_dates');
});

test('JobThai ส่งช่องอายุ/เงินเดือนเฉพาะเมื่อช่วงที่ขออยู่ในช่องเดียว', () => {
  const wide = new URL(buildSearchUrl({ position: 'พนักงานขับรถ', ageMin: '25', ageMax: '45', salaryMin: '10000' }));
  assert.equal(wide.searchParams.get('age'), '');
  assert.equal(wide.searchParams.get('salary'), '');
  const fits = new URL(buildSearchUrl({ position: 'พนักงานขับรถ', ageMin: '26', ageMax: '30', salaryMin: '15001', salaryMax: '20000' }));
  assert.equal(fits.searchParams.get('age'), '3');
  assert.equal(fits.searchParams.get('salary'), '3');
  assert.equal(new URL(buildSearchUrl({ ageMin: '40' })).searchParams.get('age'), '5');
});

test('JobThai ส่งช่วงอัปเดตเสมอ (เว็บใช้ 1 สัปดาห์ถ้าไม่ส่ง)', () => {
  assert.equal(new URL(buildSearchUrl({ position: 'x' })).searchParams.get('time'), '30');
  assert.equal(new URL(buildSearchUrl({ position: 'x', updatedWithinDays: 60 })).searchParams.get('time'), '90');
  assert.equal(new URL(buildSearchUrl({ position: 'x', updatedWithinDays: 999 })).searchParams.get('time'), '365');
});

test('JobThai แยกหลายตำแหน่งในช่องเดียวแล้วค้นทีละตำแหน่ง', () => {
  assert.deepEqual(splitPositions('พนักงานขับรถผู้บริหาร\nพนักงานขับรถส่วนกลาง'), ['พนักงานขับรถผู้บริหาร', 'พนักงานขับรถส่วนกลาง']);
  assert.deepEqual(splitPositions('ช่างไฟฟ้า/อิเล็กทรอนิกส์'), ['ช่างไฟฟ้า/อิเล็กทรอนิกส์']);
  assert.deepEqual(splitPositions(''), ['']);
});
