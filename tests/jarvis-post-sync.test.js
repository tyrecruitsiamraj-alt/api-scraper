import test from 'node:test';
import assert from 'node:assert/strict';
import { postRoundFailureReason, syncJarvisPostOrders } from '../src/core/jarvis-post-sync.js';

test('เหตุตีกลับ: รอบหมดเวลาก่อนถึงกลุ่มแรก เขียนเป็นภาษาคน', () => {
  const reason = postRoundFailureReason({ status: 'failed', error: 'WORKER_POST_JOB_MAX_MS exceeded (9780000ms) — killed' }, []);
  assert.equal(reason, 'รอบโพสต์หยุดก่อนจบ (ใช้เวลานานเกินกำหนด เครื่องหยุดงานนี้)');
});

test('เหตุตีกลับ: ไล่กลุ่มที่ไม่สำเร็จ ผลล่าสุดต่อกลุ่ม ไม่เกิน 3 กลุ่ม', () => {
  const attempts = [
    { group_id: '1', group_name: 'กลุ่ม A', level: 'warn', message: 'ยังไม่ได้เป็นสมาชิก ส่งคำขอเข้ากลุ่มแล้ว รอแอดมินอนุมัติ' },
    { group_id: '1', group_name: 'กลุ่ม A', level: 'warn', message: 'ข้อความเก่า' },
    { group_id: '2', group_name: null, level: 'warn', message: 'Facebook ไม่รับโพสต์' },
    { group_id: '3', group_name: 'กลุ่ม C', level: 'warn', message: 'x' },
    { group_id: '4', group_name: 'กลุ่ม D', level: 'warn', message: 'y' },
  ];
  const reason = postRoundFailureReason({ status: 'completed', error: null }, attempts);
  assert.match(reason, /^ไม่สำเร็จ 4 กลุ่ม · กลุ่ม A: ยังไม่ได้เป็นสมาชิก/);
  assert.match(reason, /2: Facebook ไม่รับโพสต์/);
  assert.match(reason, /และอีก 1 กลุ่ม$/);
  assert.doesNotMatch(reason, /ข้อความเก่า/);
});

/** ฐานจำลอง: ตอบตามคำสั่ง SQL ที่ขึ้นต้นต่างกัน และจดว่าเปลี่ยนสถานะแถวไหน */
function fakeDb({ runs, evidence, attempts = [] }) {
  const updates = [];
  const rowsOf = async (sql, params = []) => {
    if (sql.includes('FROM "jarvis_rm".job_posting_requests r')) {
      return [{ id: 'row-2', request_no: 'OPL6904054', created_at: '2026-10-29T06:58:00Z' }];
    }
    if (sql.includes('FROM "so_autopost_apiscraper".post_run_queue')) return runs;
    if (sql.includes('AS n')) return [{ n: evidence }];
    if (sql.includes('FROM "so_autopost_apiscraper".run_logs l')) return attempts;
    if (sql.startsWith('UPDATE')) {
      updates.push({ id: params[0], status: params[1], note: params[2] });
      return [{ id: params[0] }];
    }
    throw new Error(`unexpected sql: ${sql.slice(0, 60)}`);
  };
  return { rowsOf, updates };
}

test('มีหลักฐานโพสต์สำเร็จในรอบของแถวนี้ → posted เฉพาะแถวนี้', async () => {
  const db = fakeDb({ runs: [{ run_id: 'run_b', status: 'running', error: null }], evidence: 1 });
  const r = await syncJarvisPostOrders(db.rowsOf, { autopostSchema: 'so_autopost_apiscraper' });
  assert.deepEqual(r, { posted: ['OPL6904054'], rejected: [] });
  assert.deepEqual(db.updates, [{ id: 'row-2', status: 'posted', note: null }]);
});

test('ยังมีรอบรอคิว/กำลังทำ และยังไม่สำเร็จ → ไม่แตะ', async () => {
  const db = fakeDb({ runs: [{ run_id: null, status: 'queued', error: null }], evidence: 0 });
  const r = await syncJarvisPostOrders(db.rowsOf, { autopostSchema: 'so_autopost_apiscraper' });
  assert.deepEqual(r, { posted: [], rejected: [] });
  assert.equal(db.updates.length, 0);
});

test('ทุกรอบจบแล้วไม่สำเร็จสักกลุ่ม → ตีกลับพร้อมเหตุ', async () => {
  const db = fakeDb({
    runs: [{ run_id: 'run_b', status: 'completed', error: null }],
    evidence: 0,
    attempts: [{ group_id: '9', group_name: 'กลุ่ม Z', level: 'warn', message: 'Facebook ไม่รับโพสต์: คุณไม่สามารถโพสต์ได้ในขณะนี้' }],
  });
  const r = await syncJarvisPostOrders(db.rowsOf, { autopostSchema: 'so_autopost_apiscraper' });
  assert.deepEqual(r.rejected, ['OPL6904054']);
  assert.equal(db.updates[0].status, 'rejected');
  assert.equal(db.updates[0].note, 'ตีกลับ: ไม่สำเร็จ 1 กลุ่ม · กลุ่ม Z: Facebook ไม่รับโพสต์: คุณไม่สามารถโพสต์ได้ในขณะนี้');
});
