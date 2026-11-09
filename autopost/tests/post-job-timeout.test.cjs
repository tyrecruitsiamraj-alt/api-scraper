const test = require('node:test');
const assert = require('node:assert/strict');
const { postJobTimeoutMs, countJobGroups } = require('../server/post-job-timeout');

const MIN = 60 * 1000;

// 9 พ.ย. 2569: บัญชีใหม่เว้นระหว่างโพสต์ 20–30 นาที → เผื่อกลุ่มละ 5 + 30 = 35 นาที (ตัวคิดเวลาไม่รู้อายุบัญชี)
test('one group already needs more than the old 25-minute floor', () => {
  assert.equal(postJobTimeoutMs(1, {}), (10 + 35) * MIN);
  assert.equal(postJobTimeoutMs(2, {}), (10 + 2 * 35) * MIN);
});

test('time grows by the per-group post time plus the longest gap, plus batch breaks', () => {
  assert.equal(postJobTimeoutMs(4, {}), (10 + 4 * 35) * MIN);
  // บัญชีเก่า 8 กลุ่มใช้จริง ~150 นาที ยังจบก่อนเครื่องตัดงานค้าง (175 นาที)
  assert.equal(postJobTimeoutMs(8, {}), 175 * MIN);
});

test('batch size, break length and gap follow the worker env', () => {
  assert.equal(postJobTimeoutMs(6, { HUMAN_BATCH_SIZE: '2', POST_RUN_STALE_MINUTES: '600', POST_NEW_ACCOUNT_MAX_GAP_SEC: '1200' }), (10 + 6 * 25 + 2 * 15) * MIN);
  assert.equal(postJobTimeoutMs(2, { POST_NEW_ACCOUNT_MAX_GAP_SEC: '2400' }), (10 + 2 * 45) * MIN);
});

test('never past the stale-job sweep (POST_RUN_STALE_MINUTES - 5)', () => {
  assert.equal(postJobTimeoutMs(100, {}), 175 * MIN);
  assert.equal(postJobTimeoutMs(100, { POST_RUN_STALE_MINUTES: '60' }), 55 * MIN);
});

test('env overrides for floor and per-group minutes', () => {
  assert.equal(postJobTimeoutMs(1, { WORKER_POST_JOB_MAX_MS: String(60 * MIN) }), 60 * MIN);
  // 10 กลุ่ม = พัก 1 ครั้ง (15 นาที)
  assert.equal(postJobTimeoutMs(10, { WORKER_POST_JOB_MS_PER_GROUP: String(3 * MIN) }), (10 + 30 + 15) * MIN);
});

function fakeDb({ users = {}, assignments = [] }) {
  return {
    async query(sql, params) {
      if (/FROM users/.test(sql)) return { rows: users[params[0]] ? [{ group_ids: users[params[0]] }] : [] };
      if (/id = ANY/.test(sql)) return { rows: assignments.filter((a) => params[0].includes(a.id)) };
      if (/WHERE user_id/.test(sql)) return { rows: assignments.filter((a) => a.user_id === params[0]) };
      return { rows: [] };
    },
  };
}

test('countJobGroups uses the assignment groups, or the account groups when empty', async () => {
  const db = fakeDb({
    users: { u1: ['g1', 'g2', 'g3'] },
    assignments: [
      { id: 'a1', user_id: 'u1', group_ids: ['g4', 'g5'] },
      { id: 'a2', user_id: 'u1', group_ids: '[]' },
    ],
  });
  assert.equal(await countJobGroups({ user_id: 'u1', assignment_ids: ['a1'] }, db), 2);
  assert.equal(await countJobGroups({ user_id: 'u1', assignment_ids: ['a2'] }, db), 3);
  // auto-daily: no assignment ids → every assignment of the account
  assert.equal(await countJobGroups({ user_id: 'u1', assignment_ids: [] }, db), 5);
});
