const test = require('node:test');
const assert = require('node:assert/strict');
const { collectJobTimeoutMs } = require('../server/collect-job-timeout');

const MIN = 60 * 1000;

test('3 โพสต์ ได้ 50 นาที ไม่ใช่ 6 ชม.', () => {
  assert.equal(collectJobTimeoutMs(3, {}), 50 * MIN);
});

test('โพสต์เยอะ ไม่เกินค่าสูงสุดเดิม 6 ชม.', () => {
  assert.equal(collectJobTimeoutMs(100, {}), 6 * 60 * MIN);
});

test('ไม่มีจำนวนโพสต์ นับเป็น 1', () => {
  assert.equal(collectJobTimeoutMs(undefined, {}), 30 * MIN);
});
