const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// 18 พ.ย. 2569: โพสต์รออนุมัติได้ไลก์ของโพสต์อื่น (สูงสุด 8,126) · ยอดคอมเมนต์ถูกทับเป็น 0 · "นับยอดล่าสุด" ว่างทุกโพสต์
test('รอบเก็บคอมเมนต์: โพสต์รออนุมัติเก็บเมื่อยืนยันว่าเผยแพร่แล้วเท่านั้น · เปิดไม่สำเร็จไม่เขียนทับ', () => {
  const spec = fs.readFileSync(require.resolve('./collectComments.spec.ts'), 'utf8');
  assert.match(spec, /if \(st !== contentStatus\.STATUS_POSTED\) \{\s*noCollectResult\.add\(item\.post_log_id\);\s*continue;/);
  assert.doesNotMatch(spec, /st && st !== 'skipped' && st !== contentStatus\.STATUS_POSTED/);
  assert.match(spec, /const st = pendingByPost\.get\(item\.post_log_id\);\s*if \(!st\) continue;/);
  assert.match(spec, /if \(leadsDb\) return leadsDb\.updatePostLogCollectResult\(/);
});

test('บันทึกผลเก็บ: จดเวลานับยอด · คอมเมนต์ไม่น้อยกว่าที่เก็บไว้ · อ่านได้ 0 ไม่ลบของเดิม', () => {
  const db = fs.readFileSync(require.resolve('../server/db.js'), 'utf8');
  const fn = db.slice(db.indexOf('async function updatePostLogCollectResult'), db.indexOf('async function getFindLinkHints'));
  assert.match(fn, /last_collected_at = NOW\(\)/);
  assert.match(fn, /collect_count = COALESCE\(pl\.collect_count, 0\) \+ 1/);
  assert.match(fn, /GREATEST\(\$2, \(SELECT count\(\*\)::int FROM comment_leads cl WHERE cl\.post_log_id = pl\.id\)\)/);
  assert.match(fn, /reactions = COALESCE\(NULLIF\(\$4, 0\), pl\.reactions\)/);
  assert.match(fn, /customer_phone = COALESCE\(\$3, pl\.customer_phone\)/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS last_collected_at TIMESTAMPTZ/);
});
