import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseRestrictionEnd } = require('../autopost/server/fb-restriction-date.js');

// 13 พ.ย. 2569 (2026) 10:00 เวลาไทย
const NOW = Date.parse('2026-11-13T10:00:00+07:00');
const iso = (d) => (d ? d.toISOString() : null);

test('ป๊อปอัปตอนโดนจำกัดไม่มีวัน = อ่านไม่ได้ (ข้อความจริง 1 พ.ย. 2569)', () => {
  const popup = 'เราได้จำกัดจำนวนการโพสต์ แสดงความเห็น หรือทำสิ่งอื่นๆ ของคุณเป็นระยะเวลานึงเพื่อป้องกันการสแปมในชุมชน คุณสามารถลองใหม่อีกครั้งในภายหลัง';
  assert.equal(parseRestrictionEnd(popup, NOW), null);
  assert.equal(parseRestrictionEnd('', NOW), null);
});

test('ไทย: วันเดือนเต็ม/ย่อ ปี พ.ศ. และเวลา', () => {
  assert.equal(iso(parseRestrictionEnd('คุณจะโพสต์ในกลุ่มไม่ได้จนถึง 18 พฤศจิกายน 2569 เวลา 10:15 น.', NOW)), '2026-11-18T03:15:00.000Z');
  assert.equal(iso(parseRestrictionEnd('ข้อจำกัดจะสิ้นสุดในวันที่ 20 พ.ย.', NOW)), '2026-11-20T16:59:00.000Z', 'ไม่บอกเวลา = สิ้นวัน');
});

test('อังกฤษ: until November 18, 2026 at 10:15 AM · until Nov 20 · until 25 November', () => {
  assert.equal(iso(parseRestrictionEnd("You can't post in groups until November 18, 2026 at 10:15 AM.", NOW)), '2026-11-18T03:15:00.000Z');
  assert.equal(iso(parseRestrictionEnd('Restriction ends on Nov 20', NOW)), '2026-11-20T16:59:00.000Z');
  assert.equal(iso(parseRestrictionEnd('You are restricted until 25 November at 3:30 PM', NOW)), '2026-11-25T08:30:00.000Z');
});

test('ไม่บอกปีแล้ววันนั้นผ่านไปแล้ว = ปีหน้า แต่เกิน 60 วันไม่ใช้', () => {
  assert.equal(parseRestrictionEnd('จนถึง 2 พ.ย.', NOW), null, 'ปีหน้าเกิน 60 วัน = น่าจะอ่านผิด');
  assert.equal(iso(parseRestrictionEnd('จนถึง 5 มกราคม', NOW)), '2027-01-05T16:59:00.000Z');
});

test('อีก N วัน · หลายข้อจำกัดใช้วันที่ช้าสุด · วันที่ไม่มีจริงไม่ใช้', () => {
  assert.equal(iso(parseRestrictionEnd('จะโพสต์ได้อีกครั้งในอีก 3 วัน', NOW)), new Date(NOW + 3 * 86_400_000).toISOString());
  assert.equal(iso(parseRestrictionEnd('comment until Nov 15 · post in groups until Nov 19', NOW)), '2026-11-19T16:59:00.000Z');
  assert.equal(parseRestrictionEnd('จนถึง 31 พ.ย.', NOW), null);
  assert.equal(parseRestrictionEnd('until November 1, 2026', NOW), null, 'วันที่ผ่านไปแล้ว');
});
