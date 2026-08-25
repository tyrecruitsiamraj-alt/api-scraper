const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPostFailure } = require('../server/failure-learning');

test('บันทึกบทเรียน Session จาก Preflight โดยไม่ตีเป็นความล้มเหลวของโพสต์จริง', () => {
  const lesson = classifyPostFailure({ mode: 'preflight', error: 'Login did not establish an employer session (__user=0)' });
  assert.equal(lesson.category, 'facebook_session');
  assert.match(lesson.prevention, /Preflight/);
});

test('Auto Daily จาก Worker เก่าที่ไม่มี Build Contract ได้กติกาป้องกันเฉพาะตัว', () => {
  const lesson = classifyPostFailure({ mode: 'post', requestedBy: 'auto-daily', workerBuildSha: '', error: 'post worker exit code 7' });
  assert.equal(lesson.category, 'version_contract');
  assert.match(lesson.prevention, /Pin/);
});

test('Timeout ต้องหยุด retry อัตโนมัติ', () => {
  const lesson = classifyPostFailure({ mode: 'post', error: 'WORKER_POST_JOB_MAX_MS exceeded' });
  assert.equal(lesson.category, 'worker_timeout');
  assert.match(lesson.prevention, /ห้ามวน retry/);
});
