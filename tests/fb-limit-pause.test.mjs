import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FB_LIMIT_LOG_PREFIX, facebookLimitPauseHours, facebookLimitReason } = require('../autopost/server/fb-limit-pause.js');

// 2–4 พ.ย. 2569: 3 บัญชีโดนจำกัดวันละครั้ง พ้นพัก 24 ชม. แล้ว Jarvis ให้เลือกอีก — โดนซ้ำต้องพักนานขึ้น
test('โดนจำกัดซ้ำใน 7 วัน พักนานขึ้น 24 → 72 ชม. → 7 วัน', () => {
  assert.equal(facebookLimitPauseHours(1, 24), 24);
  assert.equal(facebookLimitPauseHours(2, 24), 72);
  assert.equal(facebookLimitPauseHours(3, 24), 168);
  assert.equal(facebookLimitPauseHours(5, 24), 168);
});

test('ค่าตั้งต้นที่ตั้งไว้ยาวกว่า ไม่ถูกลดลง', () => {
  assert.equal(facebookLimitPauseHours(1, 48), 48);
  assert.equal(facebookLimitPauseHours(2, 96), 96);
});

test('ข้อความเหตุขึ้นต้นด้วยคำที่ตัวนับใช้ และบอกครั้งที่กับเวลาพักเป็นคำ', () => {
  const reason = facebookLimitReason(2, 72);
  assert.ok(reason.startsWith(FB_LIMIT_LOG_PREFIX));
  assert.equal(reason, 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 2 ใน 7 วัน) — พัก 3 วัน ไม่โพสต์กลุ่มที่เหลือ');
  assert.equal(facebookLimitReason(1, 24), 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 1 ใน 7 วัน) — พัก 24 ชม. ไม่โพสต์กลุ่มที่เหลือ');
});
