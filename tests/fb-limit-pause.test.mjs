import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FB_LIMIT_LOG_PREFIX, MAX_PAUSE_HOURS, facebookLimitPauseHours, facebookLimitReason } = require('../autopost/server/fb-limit-pause.js');

// 9 พ.ย. 2569: 67 ครั้งใน 7 วัน — 45 ครั้งโดนตอนวันนั้นยังไม่ได้โพสต์ (โดนค้างจากวันก่อน) พัก 1–3 วันกลับมาก็โดน
test('โดนจำกัดซ้ำใน 7 วัน พักนานขึ้น 3 → 7 → 14 วัน', () => {
  assert.equal(facebookLimitPauseHours(1, 24), 72);
  assert.equal(facebookLimitPauseHours(2, 24), 168);
  assert.equal(facebookLimitPauseHours(3, 24), 336);
  assert.equal(facebookLimitPauseHours(5, 24), 336);
  assert.equal(MAX_PAUSE_HOURS, 336, 'pauseUser ต้องไม่ตัดพัก 14 วันให้สั้นลง');
});

test('ค่าตั้งต้นที่ตั้งไว้ยาวกว่า ไม่ถูกลดลง', () => {
  assert.equal(facebookLimitPauseHours(1, 96), 96);
  assert.equal(facebookLimitPauseHours(2, 200), 200);
});

test('ข้อความเหตุขึ้นต้นด้วยคำที่ตัวนับใช้ และบอกครั้งที่กับเวลาพักเป็นคำ', () => {
  const reason = facebookLimitReason(2, 168);
  assert.ok(reason.startsWith(FB_LIMIT_LOG_PREFIX));
  assert.equal(reason, 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 2 ใน 7 วัน) — พัก 7 วัน ไม่โพสต์กลุ่มที่เหลือ');
  assert.equal(facebookLimitReason(1, 72), 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 1 ใน 7 วัน) — พัก 3 วัน ไม่โพสต์กลุ่มที่เหลือ');
});
