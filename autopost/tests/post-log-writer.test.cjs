const test = require('node:test');
const assert = require('node:assert/strict');
const { writePostLog } = require('../server/post-log-writer');

const ROW = {
  poster_name: 'Tyni Aiit',
  owner: 'Jarvis',
  job_title: 'พนักงานขับรถ',
  company: 'SO',
  group_name: 'หางานขับรถ',
  member_count: '1200',
  post_link: 'https://www.facebook.com/groups/873884635154852/posts/111',
  post_status: 'อนุมัติเเล้ว',
  comment_count: 0,
  user_id: 'fb_898d82093abe46eeab1980d8',
  job_id: 'jv-opl6910006',
  group_id: '873884635154852',
};

function silentLogger() {
  const lines = [];
  return { lines, log: (m) => lines.push(['log', m]), warn: (m) => lines.push(['warn', m]) };
}

function fakeDb({ fail = false } = {}) {
  const rows = [];
  return {
    rows,
    createPostLog: async (row) => {
      if (fail) throw new Error('connection refused');
      rows.push(row);
      return 'id1';
    },
  };
}

function fakeFetch(status = 201) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => (status === 401 ? '{"error":"no"}' : '') };
  };
  return { calls, impl };
}

test('มี DATABASE_URL → เขียน post_logs ตรงลง DB พร้อมลิงก์ สถานะ และ run_id ไม่ยิง API', async () => {
  const db = fakeDb();
  const f = fakeFetch();
  const logger = silentLogger();
  const via = await writePostLog(ROW, {
    env: { DATABASE_URL: 'postgres://x', RUN_ID: 'run1' },
    loadDb: () => db,
    fetchImpl: f.impl,
    logger,
  });
  assert.equal(via, 'db');
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].post_link, ROW.post_link);
  assert.equal(db.rows[0].post_status, 'อนุมัติเเล้ว');
  assert.equal(db.rows[0].job_id, 'jv-opl6910006');
  assert.equal(db.rows[0].run_id, 'run1');
  assert.equal(f.calls.length, 0);
  assert.ok(logger.lines.some(([, m]) => m.includes(ROW.post_link)), 'ต้อง log ลิงก์ที่เจอบน console');
});

test('สถานะรออนุมัติถูกเก็บตามที่ส่งมา และรันมือที่ไม่มี RUN_ID ก็ยังเขียน DB ได้ (run_id = null)', async () => {
  const db = fakeDb();
  const via = await writePostLog({ ...ROW, post_status: 'รออนุมัติ' }, {
    env: { DATABASE_URL: 'postgres://x' },
    loadDb: () => db,
    logger: silentLogger(),
  });
  assert.equal(via, 'db');
  assert.equal(db.rows[0].post_status, 'รออนุมัติ');
  assert.equal(db.rows[0].run_id, null);
});

test('DB พัง → fallback ไป /api/post-logs พร้อม x-worker-token และ x-autopost-token', async () => {
  const f = fakeFetch(201);
  const via = await writePostLog(ROW, {
    env: {
      DATABASE_URL: 'postgres://x',
      RUN_ID: 'run1',
      RUN_LOG_API_URL: 'https://so-autopost.vercel.app/',
      POST_WORKER_TOKEN: 'wtok',
      AUTOPOST_ACCESS_TOKEN: 'atok',
    },
    loadDb: () => fakeDb({ fail: true }),
    fetchImpl: f.impl,
    logger: silentLogger(),
  });
  assert.equal(via, 'api');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://so-autopost.vercel.app/api/post-logs');
  assert.equal(f.calls[0].init.headers['x-worker-token'], 'wtok');
  assert.equal(f.calls[0].init.headers['x-autopost-token'], 'atok');
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.run_id, 'run1');
  assert.equal(body.post_link, ROW.post_link);
});

test('API ตอบ 401 → ไม่เงียบ: คืน failed และเตือนพร้อมสถานะกับลิงก์', async () => {
  const logger = silentLogger();
  const via = await writePostLog(ROW, {
    env: { RUN_ID: 'run1', RUN_LOG_API_URL: 'https://so-autopost.vercel.app' },
    fetchImpl: fakeFetch(401).impl,
    logger,
  });
  assert.equal(via, 'failed');
  const warn = logger.lines.find(([lvl]) => lvl === 'warn');
  assert.ok(warn, 'ต้องมี warn');
  assert.match(warn[1], /401/);
  assert.ok(warn[1].includes(ROW.post_link));
});

test('ไม่มีทั้ง DATABASE_URL และ RUN_ID → ข้ามโดยไม่ยิง API', async () => {
  const f = fakeFetch();
  const via = await writePostLog(ROW, { env: {}, fetchImpl: f.impl, logger: silentLogger() });
  assert.equal(via, 'skipped');
  assert.equal(f.calls.length, 0);
});
