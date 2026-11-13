import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FB_LIMIT_LOG_PREFIX, MAX_PAUSE_HOURS, LIMIT_WARMUP_DAYS, RETIRE_AT_STRIKES, RETIRED_REASON_PREFIX,
  facebookLimitPauseHours, facebookLimitReason, facebookLimitRetireLog, retiredReason, isRetiredReason, inLimitWarmupWindow, returnToPostingStatements,
} = require('../autopost/server/fb-limit-pause.js');

// 9 พ.ย. 2569: 67 ครั้งใน 7 วัน — 45 ครั้งโดนตอนวันนั้นยังไม่ได้โพสต์ (โดนค้างจากวันก่อน) พัก 1–3 วันกลับมาก็โดน
// 9 พ.ย. 2569 (รอบ 2): Facebook จำกัดจริง 3–7 วัน — บัญชีที่โดน 4 พ.ย. ยังโดนอยู่ 9 พ.ย.
test('โดนจำกัดซ้ำใน 30 วัน พักนานขึ้น 7 → 14 → 28 วัน', () => {
  assert.equal(facebookLimitPauseHours(1, 24), 168);
  assert.equal(facebookLimitPauseHours(2, 24), 336);
  assert.equal(facebookLimitPauseHours(3, 24), 672);
  assert.equal(facebookLimitPauseHours(5, 24), 672);
  assert.equal(facebookLimitPauseHours(1), 168);
  assert.ok(MAX_PAUSE_HOURS >= 672 + LIMIT_WARMUP_DAYS * 24, 'pauseUser ต้องไม่ตัดพัก 28 วัน + อุ่นเครื่องให้สั้นลง');
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

// 13 พ.ย. 2569: เจ้าของเลือก อ่านวันปลดล็อก + อุ่นเครื่องหลังพัก + เลิกใช้โพสต์เมื่อครบ 4 ครั้ง
test('ข้อความพักบอกอุ่นเครื่อง และวันปลดล็อกที่อ่านจาก Facebook', () => {
  assert.equal(
    facebookLimitReason(1, 168, { warmupDays: 2 }),
    'Facebook จำกัดการโพสต์ของบัญชีนี้ (ครั้งที่ 1 ใน 30 วัน) — พัก 7 วัน + อุ่นเครื่อง 2 วัน ไม่โพสต์กลุ่มที่เหลือ',
  );
  const r = facebookLimitReason(2, 120, { until: new Date('2026-11-18T03:15:00Z'), warmupDays: 2 });
  assert.ok(r.startsWith(FB_LIMIT_LOG_PREFIX));
  assert.match(r, /Facebook บอกว่าปลดล็อก 18 พ\.ย\. .*10:15 พักถึงวันนั้น \+ อุ่นเครื่อง 2 วัน/);
});

test('เลิกใช้โพสต์ครบ 4 ครั้ง: บันทึกรอบนับเป็นครั้งที่โดน · pause_reason ขึ้นต้นด้วยคำที่หน้าเว็บใช้แยก', () => {
  assert.equal(RETIRE_AT_STRIKES, 4);
  assert.ok(facebookLimitRetireLog(4).startsWith(FB_LIMIT_LOG_PREFIX), 'ครั้งที่ 4 ต้องถูกนับในสถิติโดนจำกัดด้วย');
  assert.ok(isRetiredReason(retiredReason(4)));
  assert.ok(!isRetiredReason(facebookLimitReason(1, 168)));
  assert.ok(!isRetiredReason(null));
});

test('ช่วงอุ่นเครื่องหลังพัก = พักเพราะโดนจำกัด และเหลือพักไม่เกิน 2 วัน', () => {
  const now = Date.parse('2026-11-13T10:00:00Z');
  const user = (hoursLeft, reason = facebookLimitReason(1, 168)) => ({ pause_reason: reason, paused_until: new Date(now + hoursLeft * 3_600_000).toISOString() });
  assert.equal(inLimitWarmupWindow(user(47), now), true);
  assert.equal(inLimitWarmupWindow(user(49), now), false, 'ยังไม่ถึงช่วงอุ่นเครื่อง');
  assert.equal(inLimitWarmupWindow(user(-1), now), false, 'พ้นพักแล้ว');
  assert.equal(inLimitWarmupWindow(user(10, 'โพสต์ไม่สำเร็จติดกัน 5 กลุ่ม — circuit breaker'), now), false, 'พักเพราะเหตุอื่นไม่อุ่นเครื่อง');
  assert.equal(inLimitWarmupWindow(user(10, retiredReason(4)), now), false, 'เลิกใช้โพสต์ไม่อุ่นเครื่อง');
});

test('กลับมาใช้โพสต์: แก้เฉพาะบัญชีที่เลิกใช้ · อุ่นเครื่อง 2 วันแล้วโพสต์หยั่ง · บันทึกรอบไม่นับเป็นครั้งที่โดน', () => {
  const [upd, log] = returnToPostingStatements('s.users', 's.run_logs', 'fb_1', 'a@b.c');
  assert.match(upd.sql, new RegExp(`pause_reason LIKE '${RETIRED_REASON_PREFIX}%'`));
  assert.equal(upd.params[1], LIMIT_WARMUP_DAYS);
  assert.ok(upd.params[2].startsWith(FB_LIMIT_LOG_PREFIX), 'เหตุพักใหม่ขึ้นต้นด้วยคำโดนจำกัด เพื่อให้โพสต์หยั่งทีละน้อยหลังพ้นพัก');
  assert.ok(!log.params[1].startsWith(FB_LIMIT_LOG_PREFIX));
  assert.match(log.params[1], /a@b\.c/);
});
