import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyJarvisReply,
  commentLeadPayload,
  loadJarvisLeadsKey,
  mobilePhone10,
  sendCommentLeadsToJarvis,
} from '../src/core/jarvis-comment-leads.js';

// แถวหน้าตาเหมือนของจริงใน comment_leads (id แบบ base36+hex · comment_key fb:<เลข> · ลิงก์ Facebook)
const lead = (over = {}) => ({
  id: 'mi3k2p9f4a1b2c3d4e5f',
  comment_key: 'fb:1234567890123456',
  request_no: 'LAO6911017',
  post_link: 'https://www.facebook.com/groups/123456789012345/posts/987654321098765/',
  comment_url: 'https://www.facebook.com/groups/123456789012345/posts/987654321098765/?comment_id=1234567890123456',
  commenter_name: 'สมชาย ใจดี',
  comment_text: 'สนใจครับ 081-234-5678',
  phone: '081-234-5678',
  first_seen_at: '2026-11-20T03:15:00.000Z',
  group_name: 'หางาน ชลบุรี',
  ...over,
});

const LEAD_UUID = '3f2a8c1e-4b7d-4e2a-9c1f-0a1b2c3d4e5f';

/** ฐานปลอม: จด SQL ที่ยิง และคืนแถวตาม SQL */
function fakeDb({ leads = [], aiRows = [] } = {}) {
  const calls = [];
  const rowsOf = async (sql, params = []) => {
    calls.push({ sql, params });
    if (/FROM "so_autopost_apiscraper"\.comment_leads c\s+LEFT JOIN/.test(sql)) return leads;
    if (/ai_call_requested_at IS NOT NULL/.test(sql) && sql.trim().startsWith('SELECT')) return aiRows;
    return [];
  };
  return { rowsOf, calls };
}

function fakeFetch(replies) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => r.body };
  };
  return { fetchImpl, sent };
}

test('เบอร์มือถือไทย: ตัด - และ +66 · เบอร์บ้าน/สั้นไม่รับ', () => {
  assert.equal(mobilePhone10('081-234-5678'), '0812345678');
  assert.equal(mobilePhone10('+66812345678'), '0812345678');
  assert.equal(mobilePhone10('02-480-9999'), null);
  assert.equal(mobilePhone10('0812'), null);
  assert.equal(mobilePhone10(null), null);
});

test('แถวคอมเมนต์ → body ที่ Jarvis รับ · ไม่มีลิงก์คอมเมนต์ใช้ลิงก์โพสต์+รหัสคอมเมนต์ (คงที่ กันซ้ำได้)', () => {
  const p = commentLeadPayload(lead());
  assert.deepEqual(p.body, {
    request_no: 'LAO6911017',
    commenter_name: 'สมชาย ใจดี',
    phone: '0812345678',
    comment_text: 'สนใจครับ 081-234-5678',
    comment_url: lead().comment_url,
    post_url: lead().post_link,
    group_name: 'หางาน ชลบุรี',
    commented_at: '2026-11-20T03:15:00.000Z',
  });
  const noUrl = commentLeadPayload(lead({ comment_url: null, comment_key: 'h:ab12' }));
  assert.equal(noUrl.body.comment_url, `${lead().post_link}#so-comment=h%3Aab12`);
  assert.equal(commentLeadPayload(lead({ comment_url: null, comment_key: 'h:ab12' })).body.comment_url, noUrl.body.comment_url);
  assert.deepEqual(commentLeadPayload(lead({ request_no: null })), { error: 'ไม่รู้ว่าเป็นของใบขอไหน' });
  assert.deepEqual(commentLeadPayload(lead({ phone: '02-480-9999' })), { error: 'เบอร์ไม่ใช่เบอร์มือถือ' });
});

test('ผลตอบของ Jarvis: 201 ส่งได้ · 409/404/400 ไม่รับถาวร · 401/503 หยุดทั้งรอบ · 500 ลองรอบหน้า', () => {
  assert.equal(classifyJarvisReply(201, {}).kind, 'sent');
  assert.equal(classifyJarvisReply(200, { duplicate: true }).kind, 'sent');
  assert.deepEqual(classifyJarvisReply(409, { error: 'Conflict', message: 'ใบขอ LAO6911017 ปิดแล้ว' }), { kind: 'final', message: 'ใบขอ LAO6911017 ปิดแล้ว' });
  assert.equal(classifyJarvisReply(404, {}).kind, 'final');
  assert.equal(classifyJarvisReply(400, {}).kind, 'final');
  assert.equal(classifyJarvisReply(401, {}).kind, 'stop');
  assert.equal(classifyJarvisReply(503, {}).kind, 'stop');
  assert.equal(classifyJarvisReply(500, {}).kind, 'retry');
});

test('ไม่มี key = ไม่ยิง Jarvis และไม่แตะฐาน', async () => {
  const db = fakeDb({ leads: [lead()] });
  const f = fakeFetch([]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: null, autopostSchema: 'so_autopost_apiscraper' });
  assert.equal(f.sent.length, 0);
  assert.equal(db.calls.length, 0);
  assert.equal(r.sent, 0);
});

test('ส่งได้ → จดเวลาส่ง + เลข lead ของ Jarvis · ส่ง x-api-key ไปเส้น leads', async () => {
  const db = fakeDb({ leads: [lead()] });
  const f = fakeFetch([{ status: 201, body: { lead_id: LEAD_UUID, candidate_id: 'x', duplicate: false } }]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: 'k_live_test_0123456789', baseUrl: 'https://jarvis.example.test/', autopostSchema: 'so_autopost_apiscraper' });
  assert.equal(r.sent, 1);
  assert.equal(f.sent[0].url, 'https://jarvis.example.test/api/integrations/so-scraping/leads');
  assert.equal(f.sent[0].init.headers['x-api-key'], 'k_live_test_0123456789');
  const upd = db.calls.find((c) => /SET jarvis_sent_at = now\(\)/.test(c.sql));
  assert.deepEqual(upd.params, [lead().id, LEAD_UUID]);
});

test('ใบปิดแล้ว → จดเหตุ ไม่ส่งซ้ำ · คนถัดไปยังส่งต่อ', async () => {
  const db = fakeDb({ leads: [lead(), lead({ id: 'mi3k2p9f4a1b2c3d4e60', request_no: 'LAM6910007' })] });
  const f = fakeFetch([
    { status: 409, body: { error: 'Conflict', message: 'ใบขอ LAO6911017 ปิดแล้ว' } },
    { status: 201, body: { lead_id: LEAD_UUID } },
  ]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: 'k', autopostSchema: 'so_autopost_apiscraper' });
  assert.equal(r.rejected, 1);
  assert.equal(r.sent, 1);
  const err = db.calls.find((c) => /SET jarvis_error = \$2/.test(c.sql));
  assert.deepEqual(err.params, [lead().id, 'ใบขอ LAO6911017 ปิดแล้ว']);
});

test('key ผิด (401) → หยุดทั้งรอบ ไม่จดว่า Jarvis ไม่รับ (ตั้ง key ใหม่แล้วส่งต่อได้)', async () => {
  const db = fakeDb({ leads: [lead(), lead({ id: 'mi3k2p9f4a1b2c3d4e60' })] });
  const f = fakeFetch([{ status: 401, body: { error: 'Unauthorized' } }]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: 'k', autopostSchema: 'so_autopost_apiscraper' });
  assert.match(r.stopped, /key/);
  assert.equal(f.sent.length, 1);
  assert.equal(db.calls.filter((c) => /^UPDATE/.test(c.sql.trim())).length, 0);
});

test('ต่อ Jarvis ไม่ได้ (เน็ตกลางคืนบล็อก) → ไม่แตะแถว รอบหน้าลองใหม่', async () => {
  const db = fakeDb({ leads: [lead()] });
  const f = fakeFetch([new Error('SEC_E_UNTRUSTED_ROOT')]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: 'k', autopostSchema: 'so_autopost_apiscraper' });
  assert.match(r.retry, /ต่อ Jarvis ไม่ได้/);
  assert.equal(db.calls.filter((c) => /^UPDATE/.test(c.sql.trim())).length, 0);
});

test('เบอร์บ้านหรือไม่มีใบขอ → จดเหตุ ไม่ยิง Jarvis', async () => {
  const db = fakeDb({ leads: [lead({ phone: '02-480-9999' })] });
  const f = fakeFetch([]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: 'k', autopostSchema: 'so_autopost_apiscraper' });
  assert.equal(f.sent.length, 0);
  assert.equal(r.rejected, 1);
});

test('ส่ง AI โทร: แยกตามใบขอ · คนที่ส่งได้จดรหัสชุด · คนที่ Jarvis ข้ามจดเหตุ', async () => {
  const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
  const db = fakeDb({
    aiRows: [
      { id: 'mi3k2p9f4a1b2c3d4e5f', request_no: 'LAO6911017', jarvis_lead_id: LEAD_UUID },
      { id: 'mi3k2p9f4a1b2c3d4e60', request_no: 'LAO6911017', jarvis_lead_id: OTHER },
    ],
  });
  const f = fakeFetch([
    { status: 200, body: { batch_id: 'b-1', added: [{ lead_id: LEAD_UUID }], skipped: [{ lead_id: OTHER, reason: 'ห้ามโทร' }] } },
  ]);
  const r = await sendCommentLeadsToJarvis({ rowsOf: db.rowsOf, fetchImpl: f.fetchImpl, apiKey: 'k', autopostSchema: 'so_autopost_apiscraper' });
  assert.equal(f.sent[0].url, 'https://jarvis.siamrajathanee.dev/api/integrations/so-scraping/ai-call');
  assert.deepEqual(f.sent[0].body, { request_no: 'LAO6911017', lead_ids: [LEAD_UUID, OTHER] });
  assert.equal(r.aiAdded, 1);
  assert.equal(r.aiSkipped, 1);
  assert.deepEqual(db.calls.find((c) => /ai_call_batch_id = \$2/.test(c.sql)).params, ['mi3k2p9f4a1b2c3d4e5f', 'b-1']);
  assert.deepEqual(db.calls.find((c) => /SET ai_call_error = \$2/.test(c.sql)).params, ['mi3k2p9f4a1b2c3d4e60', 'ห้ามโทร']);
});

test('อ่าน key: ตารางยังไม่มี = null · มีแถว = ถอดรหัส', async () => {
  const missing = async () => {
    const e = new Error('relation does not exist');
    e.code = '42P01';
    throw e;
  };
  assert.equal(await loadJarvisLeadsKey(missing, (x) => x), null);
  assert.equal(await loadJarvisLeadsKey(async () => [{ secret_enc: 'enc' }], (x) => `plain:${x}`), 'plain:enc');
  assert.equal(await loadJarvisLeadsKey(async () => [], (x) => x), null);
});
