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
