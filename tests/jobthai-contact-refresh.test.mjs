import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { refreshJobthaiContacts, PROMOTE_CONTACT_ONLY_SQL } from '../src/core/jobthai-contact-refresh.js';

// 24 พ.ย. 2569: ดึงเบอร์คืนให้คนที่ค้าง "ต้องตรวจเพิ่ม" เพราะตัวอ่านเดิมไม่อ่านเบอร์ในหน้าเรซูเม่ที่ปลดล็อกแล้ว
function harness({ pages, remaining = 100 }) {
  const calls = { filled: [], promoted: [], finish: null, opened: [] };
  const contacts = {};
  const deps = {
    runtime: { delayMin: 0, delayMax: 0 },
    query: async (sql, params) => {
      if (/FROM candidate_sources cs/.test(sql)) return { rows: params[0].filter((id) => !contacts[`c${id}`]).map((id) => ({ external_id: id, candidate_id: `c${id}` })) };
      if (/SELECT phone_norm, email_norm FROM candidates/.test(sql)) return { rows: [contacts[params[0]] || {}] };
      if (sql === PROMOTE_CONTACT_ONLY_SQL) { calls.promoted.push(params[0]); return { rows: [{ task_id: 't1' }] }; }
      throw new Error(`unexpected sql ${sql.slice(0, 40)}`);
    },
    fillCandidateContacts: async (id, { phone, email }) => { calls.filled.push(id); contacts[id] = { phone_norm: phone ? phone.replace(/\D/g, '') : '', email_norm: email || '' }; return true; },
    startRun: async () => 'run1',
    finishRun: async (_id, r) => { calls.finish = r; },
    touchRun: async () => {},
    saveConnectorSession: async () => {},
    countScrapedToday: async () => 1000 - remaining,
    getProviderCap: async () => null,
    platformScrapedToday: async () => 0,
    provider: {
      getSession: async () => ({ request: {}, browser: { close: async () => {} }, dumpState: async () => ({}) }),
      resumeDetailUrl: (id) => `https://www3.jobthai.com/resume/0,${id}.html`,
      fetchResumeHtml: async (_s, id) => { calls.opened.push(id); return id; },
      parseResumeHtml: (id) => ({ name: 'ทดสอบ', phone: pages[id]?.phone || '', email: pages[id]?.email || '' }),
      enrichContacts: async (_r, _id, rec) => rec,
      finalizeCandidateRecord: (r) => r,
    },
  };
  const connector = { id: 'lba', platform: 'jobthai', daily_cap: 1000, username: 'u', password: () => 'p' };
  return { deps, connector, calls };
}

test('อ่านเบอร์จากหน้า เติมช่องที่ว่าง และคนที่ขาดแค่ช่องทางติดต่อกลับเป็นผ่านเกณฑ์', async () => {
  const { deps, connector, calls } = harness({ pages: { 1: { phone: '0812345678' }, 2: { email: 'a.test@gmail.com' }, 3: {} } });
  const r = await refreshJobthaiContacts(connector, ['1', '2', '3'], deps);
  assert.deepEqual({ opened: r.opened, phone: r.phone, email: r.email, still: r.still_hidden }, { opened: 3, phone: 1, email: 1, still: 1 });
  assert.deepEqual(calls.filled, ['c1', 'c2']);
  assert.deepEqual(calls.promoted, ['c1', 'c2']);
  assert.equal(calls.finish.opened, 3); // นับเข้าโควต้าต่อวันของบัญชี
});

test('โควต้าเต็มระหว่างทาง: หยุด แล้วรอคิววันถัดไป ไม่นับเป็นงานล้ม', async () => {
  const { deps, connector, calls } = harness({ pages: { 1: { phone: '0812345678' }, 2: { phone: '0898765432' } }, remaining: 1 });
  await assert.rejects(() => refreshJobthaiContacts(connector, ['1', '2'], deps), (e) => e.waiting === true && e.retryAt instanceof Date);
  assert.deepEqual(calls.opened, ['1']);
});

test('โควต้าเต็มตั้งแต่ต้น: ไม่ล็อกอิน ไม่เปิดหน้า รอคิว', async () => {
  const { deps, connector, calls } = harness({ pages: {}, remaining: 0 });
  await assert.rejects(() => refreshJobthaiContacts(connector, ['1'], deps), (e) => e.waiting === true);
  assert.equal(calls.opened.length, 0);
});

test('เลื่อนเป็นผ่านเกณฑ์เฉพาะใบที่ขาดแค่ช่องทางติดต่อ และยังไม่มีคนตัดสิน · runner รับงานนี้', () => {
  assert.match(PROMOTE_CONTACT_ONLY_SQL, /qualification_reasons = '\["missing_contact"\]'::jsonb/);
  assert.match(PROMOTE_CONTACT_ONLY_SQL, /recruiter_decision IS NULL/);
  const runner = fs.readFileSync(new URL('../workers/runner.js', import.meta.url), 'utf8');
  assert.match(runner, /async contact_refresh\(job\)/);
});
