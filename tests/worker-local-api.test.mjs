import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { shouldUseLocalWorkerApi, createLocalWorkerApi, LOCAL_WORKER_PATHS } = require('../autopost/server/worker-local-api.js');

function fakeDb(overrides = {}) {
  const calls = [];
  const rec = (name, value) => async (...args) => { calls.push([name, ...args]); return typeof value === 'function' ? value(...args) : value; };
  const db = {
    calls,
    generateRunId: () => 'run_1',
    touchWorkerHeartbeat: rec('touchWorkerHeartbeat', undefined),
    claimNextPostRunJob: rec('claimNextPostRunJob', { id: 'q1', user_id: 'u1' }),
    completePostRunJob: rec('completePostRunJob', (id, r) => ({ id, user_id: 'u1', status: r.ok ? 'completed' : 'failed', error: r.error })),
    failStaleRunningPostJobs: rec('failStaleRunningPostJobs', 2),
    enqueueDailyPostRunJobs: rec('enqueueDailyPostRunJobs', { created: [{ id: 'a', user_id: 'u1', extra: 1 }], skipped: ['u2'] }),
    releaseOrphanedJobs: rec('releaseOrphanedJobs', ['old']),
    claimNextCollectRunJob: rec('claimNextCollectRunJob', null),
    getPostLogsByIdsForUser: rec('getPostLogsByIdsForUser', []),
    getFindLinkHints: rec('getFindLinkHints', { captions: {}, knownLinks: {} }),
    completeCollectRunJob: rec('completeCollectRunJob', { id: 'c1' }),
    failStaleRunningCollectJobs: rec('failStaleRunningCollectJobs', 0),
    enqueueRecentCollectJobs: rec('enqueueRecentCollectJobs', { queued: [] }),
    ...overrides,
  };
  return db;
}

test('ต่อฐานตรงเมื่อมี DATABASE_URL · บังคับใช้เว็บได้ด้วย WORKER_USE_HTTP_API=1', () => {
  assert.equal(shouldUseLocalWorkerApi({ DATABASE_URL: 'postgres://x' }), true);
  assert.equal(shouldUseLocalWorkerApi({ DATABASE_URL: 'postgres://x', WORKER_USE_HTTP_API: '1' }), false);
  assert.equal(shouldUseLocalWorkerApi({}), false);
});

test('รับงานโพสต์: แตะสัญญาณเครื่อง แล้วรับงานด้วยชื่อเครื่องเดียวกับเว็บ', async () => {
  const db = fakeDb();
  const api = createLocalWorkerApi({ db, workerId: 'RM009-12', workerName: 'SONB-RM009', env: {} });
  const out = await api('/api/worker/post/claim', { worker_id: 'RM009-12', worker_name: 'SONB-RM009', build_sha: 'abc', capabilities: ['post'], fb_sessions: ['a'] });
  assert.deepEqual(out, { ok: true, job: { id: 'q1', user_id: 'u1' } });
  assert.deepEqual(db.calls[0], ['touchWorkerHeartbeat', 'SONB-RM009', { worker_id: 'RM009-12', build_sha: 'abc', source_sha: '', capabilities: ['post'], fb_sessions: ['a'] }]);
  assert.deepEqual(db.calls[1], ['claimNextPostRunJob', 'RM009-12', 'run_1', 'SONB-RM009', ['post'], 'abc']);
});

test('รุ่นโค้ดไม่ตรงที่บังคับ: ไม่รับงาน เหมือนเว็บ', async () => {
  const db = fakeDb();
  const api = createLocalWorkerApi({ db, workerId: 'w', env: { REQUIRED_WORKER_BUILD_SHA: 'new' } });
  const out = await api('/api/worker/post/claim', { build_sha: 'old' });
  assert.equal(out.upgrade_required, true);
  assert.equal(db.calls.some((c) => c[0] === 'claimNextPostRunJob'), false);
});

test('ปิดงานโพสต์ที่ล้ม แจ้งเตือนเหมือนเว็บ', async () => {
  const alerts = [];
  const api = createLocalWorkerApi({ db: fakeDb(), workerId: 'w', env: {}, sendAlert: async (t) => alerts.push(t) });
  const out = await api('/api/worker/post/complete', { job_id: 'q1', ok: false, error: 'boom' });
  assert.equal(out.job.status, 'failed');
  assert.equal(alerts.length, 1);
  await assert.rejects(api('/api/worker/post/complete', {}), /job_id required/);
});

test('สร้างคิวรายวันคืนแค่ id กับบัญชี · กวาดงานค้างไม่ต่ำกว่า 15 นาที', async () => {
  const api = createLocalWorkerApi({ db: fakeDb(), workerId: 'w', env: {} });
  assert.deepEqual(await api('/api/worker/post/enqueue-daily'), { ok: true, created: [{ id: 'a', user_id: 'u1' }], skipped: ['u2'] });
  assert.equal((await api('/api/worker/post/sweep-stale', { max_age_minutes: 1 })).max_age_minutes, 15);
});

test('รับงานเก็บคอมเมนต์ที่ไม่มีโพสต์ให้ดู: ปิดงานทิ้ง ไม่ส่งงานว่างให้เครื่อง', async () => {
  const db = fakeDb({ claimNextCollectRunJob: async () => ({ id: 'c1', user_id: 'u1', post_log_ids: ['p1'] }) });
  const api = createLocalWorkerApi({ db, workerId: 'w', env: {} });
  assert.deepEqual(await api('/api/worker/collect/claim', {}), { ok: true, job: null });
  assert.ok(db.calls.some((c) => c[0] === 'completeCollectRunJob' && c[1] === 'c1'));
});

test('ครบทุกคำสั่งที่เครื่องเรียก และคำสั่งที่ไม่รู้จักต้องล้ม ไม่เงียบ', async () => {
  const api = createLocalWorkerApi({ db: fakeDb(), workerId: 'w', env: {} });
  assert.equal(LOCAL_WORKER_PATHS.length, 10);
  await assert.rejects(api('/api/worker/post/unknown', {}), /ไม่รู้จักคำสั่ง/);
});
