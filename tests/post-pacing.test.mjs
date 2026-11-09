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

// เจ้าของ 9 พ.ย. 2569: บัญชีชุด 28 ต.ค. วันแรกโพสต์ 13–22 กลุ่ม ห่างกัน 4 นาที แล้วโดนทั้งชุด
test('วอร์มบัญชีใหม่: ไม่เคยโพสต์/2 สัปดาห์แรก 2 · สัปดาห์ที่ 3 = 4 · ครบ 3 สัปดาห์เต็ม', () => {
  assert.equal(warmupCapFor(8, null, {}), 2);
  assert.equal(warmupCapFor(8, 3, {}), 2);
  assert.equal(warmupCapFor(8, 13.9, {}), 2);
  assert.equal(warmupCapFor(8, 14, {}), 4);
  assert.equal(warmupCapFor(8, 30, {}), 8);
  assert.equal(warmupCapFor(8, 3, { POST_WARMUP_DISABLED: '1' }), 8);
});

const { postGapRangeSecFor } = require('../autopost/server/post-pacing.js');
test('บัญชีใหม่เว้น 20–30 นาที · บัญชีเกิน 14 วันเว้นตามปกติ', () => {
  assert.deepEqual(postGapRangeSecFor(null, {}), { min: 1200, max: 1800 });
  assert.deepEqual(postGapRangeSecFor(5, {}), { min: 1200, max: 1800 });
  assert.deepEqual(postGapRangeSecFor(20, {}), { min: 600, max: 720 });
  for (let i = 0; i < 50; i += 1) {
    const s = clampGapSec(90, {}, 3);
    assert.ok(s >= 1200 && s <= 1800, String(s));
  }
  assert.equal(clampGapSec(700, {}, 30), 700);
});

// เจ้าของ 9 พ.ย. 2569: พ้นพักแล้วกลับมาทีละน้อย ไม่ใช่กลับมาเต็มทันที
test('หลังพ้นพักจากโดนจำกัด: วันแรก 1 กลุ่ม (หยั่ง) · วันที่ 2–3 2 กลุ่ม · วันที่ 4–6 4 · แล้วปกติ', () => {
  const now = Date.parse('2026-11-12T03:00:00Z');
  const limited = (daysAgo) => ({ pauseReason: `${PREFIX} (ครั้งที่ 1 ใน 30 วัน) — พัก 7 วัน`, pausedUntil: new Date(now - daysAgo * DAY).toISOString() });
  assert.equal(recoveryCapAfterLimit(8, limited(0.5), now), 1);
  assert.equal(recoveryCapAfterLimit(8, limited(1.1), now), 2);
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

test('เพดานวันนี้ของบัญชี: บัญชีเก่า 8 · ใหม่ 2 · พ้นพักวันที่ 2 ได้ 2 · รวมแล้วไม่เกินเพดานระบบ', () => {
  const now = Date.parse('2026-11-12T03:00:00Z');
  const opts = { env: NO_RANDOM, now };
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true }, 40, opts), 8);
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15 }, 2, opts), 2);
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true, pause_reason: `${PREFIX} x`, paused_until: new Date(now - 1.5 * DAY).toISOString() }, 40, opts), 2);
  assert.equal(effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true, pause_reason: `${PREFIX} x`, paused_until: new Date(now - 0.2 * DAY).toISOString() }, 40, opts), 1);
  const random = effectiveDailyCapFor({ id: 'u', daily_cap: 15, skip_warmup: true }, 40, { now });
  assert.ok(random >= 3 && random <= 8, String(random));
});

const { dailyStartOffsetMin } = require('../autopost/server/post-pacing.js');
// เจ้าของ 9 พ.ย. 2569: รอบเช้าเดิมทุกบัญชีเริ่มพร้อมกัน 08:00 จากเครื่องเดียว
test('รอบเช้า: แต่ละบัญชีเริ่มช้ากว่า 08:00 ไม่เท่ากัน 0–119 นาที ค่าเดิมทั้งวัน ปิดได้', () => {
  const a = dailyStartOffsetMin('fb_abc', '2026-11-10', {});
  assert.equal(dailyStartOffsetMin('fb_abc', '2026-11-10', {}), a);
  const offsets = new Set(Array.from({ length: 30 }, (_, i) => dailyStartOffsetMin(`fb_${i}`, '2026-11-10', {})));
  assert.ok(offsets.size >= 15, `30 บัญชีควรกระจาย ได้ ${offsets.size} ค่า`);
  assert.ok([...offsets].every((m) => m >= 0 && m < 120));
  assert.equal(dailyStartOffsetMin('fb_abc', '2026-11-10', { AUTO_POST_SPREAD_MINUTES: '0' }), 0);
});

const { needsWarmup, warmupStartOffsetMin, warmupSessionPlan } = require('../autopost/server/post-pacing.js');
// เจ้าของ 9 พ.ย. 2569: อุ่นเครื่องบัญชีใหม่ วันละรอบ ไม่โพสต์
test('อุ่นเครื่อง: เฉพาะบัญชีใหม่ (<14 วันหรือยังไม่เคยโพสต์) ที่ไม่ได้ติ๊กใช้งานมานาน', () => {
  assert.equal(needsWarmup({ id: 'u' }, null, {}), true);
  assert.equal(needsWarmup({ id: 'u' }, 5, {}), true);
  assert.equal(needsWarmup({ id: 'u' }, 14, {}), false);
  assert.equal(needsWarmup({ id: 'u', skip_warmup: true }, 2, {}), false);
  assert.equal(needsWarmup({ id: 'u' }, 2, { WARMUP_DISABLED: '1' }), false);
});

test('อุ่นเครื่องเริ่มระหว่าง 09:00–17:00 (60–539 นาทีหลัง 08:00) ค่าเดิมทั้งวัน', () => {
  const a = warmupStartOffsetMin('fb_abc', '2026-11-10');
  assert.equal(warmupStartOffsetMin('fb_abc', '2026-11-10'), a);
  for (let i = 0; i < 40; i += 1) {
    const m = warmupStartOffsetMin(`fb_${i}`, '2026-11-10');
    assert.ok(m >= 60 && m < 540, String(m));
  }
});

test('แผนรอบอุ่นเครื่อง: ฟีด 3–5 นาที · 2–3 กลุ่ม · ถูกใจไม่เกิน 2 · ปิดถูกใจได้', () => {
  assert.deepEqual(warmupSessionPlan({}, () => 0), { feed_sec: 180, groups: 2, group_sec: 60, likes: 0 });
  assert.deepEqual(warmupSessionPlan({}, () => 0.999), { feed_sec: 300, groups: 3, group_sec: 120, likes: 2 });
  assert.equal(warmupSessionPlan({ WARMUP_LIKES_MAX: '0' }, () => 0.999).likes, 0);
});
