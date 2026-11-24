const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { commentSummaryCount, commentTotal, goneVerdict } = require('../server/post-engagement');

test('ยอด "N ความคิดเห็น" ใต้โพสต์ อ่านได้ทั้งไทยและอังกฤษ', () => {
  assert.equal(commentSummaryCount('2 ความคิดเห็น'), 2);
  assert.equal(commentSummaryCount('ความคิดเห็น 12 รายการ'), 12);
  assert.equal(commentSummaryCount('378 comments'), 378);
  assert.equal(commentSummaryCount('1 comment'), 1);
  assert.equal(commentSummaryCount('1.2K comments'), 1200);
  assert.equal(commentSummaryCount('1,024 ความคิดเห็น'), 1024);
  assert.equal(commentSummaryCount(null), 0);
  assert.equal(commentSummaryCount('เขียนความคิดเห็น…'), 0);
});

test('ยอดคอมเมนต์ใช้ค่าที่มากกว่า: การตอบกลับที่พับอยู่ Facebook นับรวม', () => {
  // ตรวจจริง 24 พ.ย. 2569: จับได้ 1 คอมเมนต์ Facebook ขึ้น 2 (มีการตอบกลับ)
  assert.equal(commentTotal(1, 2), 2);
  assert.equal(commentTotal(5, 0), 5); // อ่านยอดใต้โพสต์ไม่ได้ ใช้ที่จับได้
  assert.equal(commentTotal(0, 0), 0);
});

test('โพสต์ไม่พร้อมใช้งาน: ตัดสินจากแท็บเนื้อหาของคุณ ไม่เดา', () => {
  const ok = (found) => ({ ok: true, found });
  assert.equal(goneVerdict({ unavailable: true, posted: ok(false), removed: ok(true) }), 'removed');
  assert.equal(goneVerdict({ unavailable: true, posted: ok(false), removed: ok(false) }), 'removed');
  assert.equal(goneVerdict({ unavailable: true, posted: ok(true) }), 'still_posted');
  // อ่านแท็บไม่ได้/ไม่ได้อ่าน = ไม่เปลี่ยนสถานะ
  assert.equal(goneVerdict({ unavailable: true, posted: { ok: false, found: false }, removed: ok(false) }), 'unknown');
  assert.equal(goneVerdict({ unavailable: true }), 'unknown');
  assert.equal(goneVerdict({ unavailable: false, posted: ok(false), removed: ok(false) }), 'unknown');
});

test('นับยอดซ้ำ: ≤ 14 วันวันละครั้ง เกินนั้นสัปดาห์ละครั้ง เฉพาะโพสต์อนุมัติที่มีลิงก์ และไม่ทับช่วงเก็บปกติ', () => {
  const src = fs.readFileSync(path.join(__dirname, '../server/db.js'), 'utf8');
  const sql = src.match(/const RECOUNT_DUE_SQL = `([\s\S]*?)`;/)[1];
  assert.match(sql, /post_status = \$2/);
  assert.match(sql, /post_link/);
  assert.match(sql, /created_at < \$3::date/);
  assert.match(sql, /INTERVAL '14 days' THEN INTERVAL '20 hours' ELSE INTERVAL '7 days'/);
  assert.match(sql, /recount_queued_at/); // โพสต์ที่เปิดไม่ได้ไม่ถูกหยิบซ้ำทุกรอบ
  assert.match(src, /takePostLogsDueRecount\(uid, start_date\)/);
});
