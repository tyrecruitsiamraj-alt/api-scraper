import test from 'node:test';
import assert from 'node:assert/strict';
import { knownPositionsFromDescription, positionsFromDescription } from '../src/core/job-family.js';

test('ฝ่ายขายมีคำค้นสำรองหลายคำใน Job Family เดียวกัน', () => {
  const plan = knownPositionsFromDescription('ฝ่ายขาย');
  assert.equal(plan?.family, 'A');
  assert.deepEqual(plan?.hardFilters, []);
  assert.ok(plan?.positions.includes('พนักงานขาย'));
  assert.ok(plan?.positions.includes('เซลล์'));
  assert.ok(plan?.positions.length >= 5);
  assert.equal(plan?.positions.some((term) => term.includes('ต้อนรับ')), false);
});

test('ชื่อตำแหน่งขายแบบสั้นใช้แผน deterministic โดยไม่รอ AI', async () => {
  const plan = await positionsFromDescription({ description: 'ฝ่ายขาย', platform: 'jobthai' });
  assert.equal(plan?.model, 'deterministic:thai-job-family');
  assert.equal(plan?.positions[0], 'พนักงานขาย');
});

test('คำที่ไม่รู้จักไม่เดา Job Family เอง', () => {
  assert.equal(knownPositionsFromDescription('ตำแหน่งเฉพาะที่ไม่รู้จัก'), null);
});
