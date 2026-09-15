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

test('เนื้องานระบบสุขาภิบาลค้นช่างประปา ไม่ใช่ช่างไฟฟ้า', () => {
  const plan = knownPositionsFromDescription('ตรวจสอบ ซ่อมแซม แก้ไขปรับปรุง ระบบสุขาภิบาล');
  assert.equal(plan?.family, 'B');
  assert.equal(plan?.positions[0], 'ช่างประปา');
  assert.ok(plan?.positions.includes('ช่างสุขาภิบาล'));
  assert.ok(plan?.positions.includes('ช่างท่อ'));
  assert.ok(plan?.positions.includes('ช่างอาคาร'));
  assert.equal(plan?.positions.includes('ช่างไฟฟ้า'), false);
  assert.deepEqual(plan?.hardFilters, []);
});

test('เนื้องานประปา/ท่อใช้แผนสุขาภิบาลก่อนแผนช่างไฟ', () => {
  const plumbing = knownPositionsFromDescription('ซ่อมระบบประปาและท่อน้ำทิ้ง');
  assert.equal(plumbing?.positions[0], 'ช่างประปา');
  assert.equal(plumbing?.positions.includes('ช่างไฟฟ้า'), false);
});

test('เนื้องานช่างไฟฟ้ายังใช้แผนช่างไฟ', () => {
  const plan = knownPositionsFromDescription('ช่างไฟฟ้า ตรวจซ่อมระบบไฟฟ้า');
  assert.equal(plan?.family, 'B');
  assert.ok(plan?.positions.includes('ช่างไฟฟ้า'));
  assert.notEqual(plan?.positions[0], 'ช่างประปา');
});
