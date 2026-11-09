import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FB_LIMIT_LOG_PREFIX, MAX_PAUSE_HOURS, facebookLimitPauseHours, facebookLimitReason } = require('../autopost/server/fb-limit-pause.js');

// 9 พ.ย. 2569: 67 ครั้งใน 7 วัน — 45 ครั้งโดนตอนวันนั้นยังไม่ได้โพสต์ (โดนค้างจากวันก่อน) พัก 1–3 วันกลับมาก็โดน
// 9 พ.ย. 2569 (รอบ 2): Facebook จำกัดจริง 3–7 วัน — บัญชีที่โดน 4 พ.ย. ยังโดนอยู่ 9 พ.ย.
test('โดนจำกัดซ้ำใน 30 วัน พักนานขึ้น 7 → 14 → 28 วัน', () => {
  assert.equal(facebookLimitPauseHours(1, 24), 168);
  assert.equal(facebookLimitPauseHours(2, 24), 336);
  assert.equal(facebookLimitPauseHours(3, 24), 672);
  assert.equal(facebookLimitPauseHours(5, 24), 672);
  assert.equal(facebookLimitPauseHours(1), 168);
  assert.equal(MAX_PAUSE_HOURS, 672, 'pauseUser ต้องไม่ตัดพัก 28 วันให้สั้นลง');
});

test('ค่าตั้งต้นที่ตั้งไว้ยาวกว่า ไม่ถูกลดลง', () => {
  assert.equal(facebookLimitPauseHours(1, 200), 200);
  assert.equal(facebookLimitPauseHours(2, 400), 400);
});

test('ข้อความเหตุขึ้นต้นด้วยคำที่ตัวนับใช้ และบอกครั้งที่กับเวลาพักเป็นคำ', () => {
  const reason = facebookLimitReason(2, 336);
  assert.ok(reason.startsWith(FB_LIMIT_LOG_PREFIX));
  assert.equal(reason, 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 2 ใน 30 วัน) — พัก 14 วัน ไม่โพสต์กลุ่มที่เหลือ');
  assert.equal(facebookLimitReason(1, 168), 'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 1 ใน 30 วัน) — พัก 7 วัน ไม่โพสต์กลุ่มที่เหลือ');
});
