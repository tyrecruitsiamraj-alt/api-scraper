import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { dailyCapCeiling, baseDailyCapFor, postGapRangeSec, clampGapSec } = require('../autopost/server/post-pacing.js');

// เจ้าของ 8 พ.ย. 2569: ไม่เกิน 8 กลุ่ม/บัญชี/วัน นับรวมใบ Jarvis · เว้นอย่างน้อย 10 นาที
test('เพดาน 8 ชนะค่าที่ตั้งรายบัญชี (ทุกบัญชีตั้ง 15–20 ไว้)', () => {
  assert.equal(dailyCapCeiling({}), 8);
  assert.equal(baseDailyCapFor(15, {}), 8);
  assert.equal(baseDailyCapFor(20, {}), 8);
  assert.equal(baseDailyCapFor(5, {}), 5);
  assert.equal(baseDailyCapFor(null, {}), 8);
  assert.equal(baseDailyCapFor(null, { POST_DAILY_CAP: '15' }), 8, 'env เดิม 15 ก็ไม่เกินเพดานระบบ');
  assert.equal(baseDailyCapFor(15, { POST_DAILY_CAP_MAX: '12' }), 12, 'ขยับเพดานระบบได้ด้วย env');
});

test('เว้นระหว่างโพสต์ไม่ต่ำกว่า 10 นาที · ค่าที่ตั้งยาวกว่านั้นใช้ตามตั้ง', () => {
  assert.deepEqual(postGapRangeSec({}), { min: 600, max: 720 });
  for (let i = 0; i < 50; i += 1) {
    const s = clampGapSec(90, {});
    assert.ok(s >= 600 && s <= 720, String(s));
  }
  assert.equal(clampGapSec(800, {}), 800);
});

const { warmupCapFor, recoveryCapAfterLimit, dailyCapForDay, effectiveDailyCapFor } = require('../autopost/server/post-pacing.js');
const PREFIX = 'Facebook จำกัดการโพสต์ของบัญชีนี้';
const DAY = 86_400_000;
const NO_RANDOM = { POST_DAILY_CAP_RANDOM: '0' };

test('วอร์มบัญชีใหม่: ไม่เคยโพสต์/สัปดาห์แรก 5 · สัปดาห์ 2 = 8 · ครบ 3 สัปดาห์เต็ม', () => {
  assert.equal(warmupCapFor(8, null, {}), 5);
  assert.equal(warmupCapFor(8, 3, {}), 5);
  assert.equal(warmupCapFor(8, 10, {}), 8);
  assert.equal(warmupCapFor(8, 30, {}), 8);
  assert.equal(warmupCapFor(8, 3, { POST_WARMUP_DISABLED: '1' }), 8);
});

// เจ้าของ 9 พ.ย. 2569: พ้นพักแล้วกลับมาทีละน้อย ไม่ใช่กลับมาเต็มทันที
test('หลังพ้นพักจากโดนจำกัด: 3 วันแรก 2 กลุ่ม · 3 วันถัดไป 4 · แล้วปกติ', () => {
  const now = Date.parse('2026-11-12T03:00:00Z');
  const limited = (daysAgo) => ({ pauseReason: `${PREFIX} (ครั้งที่ 1 ใน 7 วัน) — พัก 3 วัน`, pausedUntil: new Date(now - daysAgo * DAY).toISOString() });
  assert.equal(recoveryCapAfterLimit(8, limited(0.5), now), 2);
  assert.equal(recoveryCapAfterLimit(8, limited(2.9), now), 2);
  assert.equal(recoveryCapAfterLimit(8, limited(3.1), now), 4);
  assert.equal(recoveryCapAfterLimit(8, limited(5.9), now), 4);
  assert.equal(recoveryCapAfterLimit(8, limited(6.1), now), 8);
  assert.equal(recoveryCapAfterLimit(8, limited(-1), now), 8, 'ยังพักอยู่ ตัวกันพักจัดการเอง');
  assert.equal(recoveryCapAfterLimit(8, { pauseReason: 'แอดมินพักเอง', pausedUntil: new Date(now - DAY).toISOString() }, now), 8, 'พักด้วยเหตุอื่นไม่ต้องค่อย ๆ กลับ');
  assert.equal(recoveryCapAfterLimit(8, {}, now), 8);
});

test('สุ่มเพดานรายวัน 3..เพดาน: ค่าเดิมทั้งวัน วันถัดไปอาจต่าง ปิดได้ด้วย env', () => {
  const a = dailyCapForDay(8, 'fb_abc', '2026-11-09', {});
  assert.equal(dailyCapForDay(8, 'fb_abc', '2026-11-09', {}), a, 'บัญชีเดิมวันเดิม = ค่าเดิม');
  assert.ok(a >= 3 && a <= 8, String(a));
  const seen = new Set();
  for (let d = 1; d <= 30; d += 1) seen.add(dailyCapForDay(8, 'fb_abc', `2026-11-${String(d).padStart(2, '0')}`, {}));
  assert.ok(seen.size >= 4, `30 วันควรได้หลายค่า ได้ ${[...seen].join(',')}`);
  assert.ok([...seen].every((v) => v >= 3 && v <= 8));
  assert.equal(dailyCapForDay(2, 'fb_abc', '2026-11-09', {}), 2, 'เพดาน ≤ 3 ไม่สุ่ม');
  assert.equal(dailyCapForDay(8, 'fb_abc', '2026-11-09', NO_RANDOM), 8);
});

test('เพดานวันนี้ของบัญชี: บัญชีเก่า 8 · ใหม่ 5 · เพิ่งพ้นพัก 2 · รวมแล้วไม่เกินเพดานระบบ', () => {
  const now = Date.parse('2026-11-12T03:00:00Z');
  const opts = { env: NO_RANDOM, now };
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true }, 40, opts), 8);
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15 }, 2, opts), 5);
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true, pause_reason: `${PREFIX} x`, paused_until: new Date(now - DAY).toISOString() }, 40, opts), 2);
  const random = effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true }, 40, { now });
  assert.ok(random >= 3 && random <= 8, String(random));
});
