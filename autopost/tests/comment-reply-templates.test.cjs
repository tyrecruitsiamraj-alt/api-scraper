const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_REPLY_TEMPLATES,
  renderReply,
  replyValues,
  replyTemplateProblem,
  ensureReplyTemplates,
  loadReplyTemplates,
} = require('../server/comment-reply-templates');
const { buildAutoReply } = require('../server/comment-leads');

const caption = 'รับสมัครพนักงานขับรถ Valet parking\nโทรติดต่อ : 0613866408 (คุณหมิว)\nหรือสมัครงานได้ที่ : https://jarvis.example/apply/p/4hpb57s';

test('ข้อความตั้งต้นให้ผลเหมือนข้อความที่บอทใช้มาตั้งแต่ 22 ต.ค.', () => {
  assert.equal(
    buildAutoReply({ kind: 'phone', name: 'Somchai Jaidee' }),
    'ขอบคุณ คุณSomchaiค่ะ ได้รับเบอร์แล้ว เจ้าหน้าที่จะติดต่อกลับเร็ว ๆ นี้ค่ะ',
  );
  assert.equal(
    buildAutoReply({ kind: 'interest', name: 'Somchai Jaidee', caption, position: 'พนักงานขับรถ' }),
    [
      'สวัสดีค่ะ คุณSomchai ขอบคุณที่สนใจตำแหน่งพนักงานขับรถค่ะ',
      'สมัครได้ที่ https://jarvis.example/apply/p/4hpb57s',
      'โทร 0613866408 (คุณหมิว)',
      'หรือฝากเบอร์ไว้ในคอมเมนต์ เจ้าหน้าที่จะโทรกลับค่ะ',
    ].join('\n'),
  );
});

test('คำแทนที่ไม่มีค่า: ชื่อตัดออก · วงเล็บตัดออก · บรรทัดอื่นตัดทั้งบรรทัด', () => {
  const text = renderReply(DEFAULT_REPLY_TEMPLATES.interest, replyValues({ name: '', position: '', phone: '0812345678' }));
  assert.equal(
    text,
    ['สวัสดีค่ะ ขอบคุณที่สนใจงานนี้ค่ะ', 'โทร 0812345678', 'หรือฝากเบอร์ไว้ในคอมเมนต์ เจ้าหน้าที่จะโทรกลับค่ะ'].join('\n'),
  );
  assert.equal(renderReply(DEFAULT_REPLY_TEMPLATES.phone, replyValues({ name: '' })), 'ขอบคุณค่ะ ได้รับเบอร์แล้ว เจ้าหน้าที่จะติดต่อกลับเร็ว ๆ นี้ค่ะ');
});

test('ข้อความว่าง = ไม่ตอบเอง ส่งให้คนตอบ', () => {
  assert.equal(renderReply('', replyValues({ name: 'A' })), null);
  assert.equal(renderReply('   \n  ', replyValues({ name: 'A' })), null);
  assert.equal(buildAutoReply({ kind: 'phone', name: 'A' }, { phone: '', interest: 'x' }), null);
  assert.equal(buildAutoReply({ kind: 'question', name: 'A' }, { phone: 'x', interest: 'x' }), null);
});

test('ตรวจข้อความก่อนบันทึก: คำแทนสะกดผิด / ยาวเกิน', () => {
  assert.equal(replyTemplateProblem(DEFAULT_REPLY_TEMPLATES.interest), null);
  assert.equal(replyTemplateProblem(''), null);
  assert.match(replyTemplateProblem('สวัสดี {ชือ}'), /ไม่รู้จักคำแทน \{ชือ\}/);
  assert.match(replyTemplateProblem('ก'.repeat(1001)), /ยาวเกิน 1,000/);
});

test('สร้างตาราง + ใส่ข้อความตั้งต้นแบบไม่ทับของที่ทีมแก้ แล้วอ่านกลับได้', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return { rows: [{ kind: 'phone', body: 'แก้แล้ว' }, { kind: 'junk', body: 'x' }] };
      return { rows: [] };
    },
  };
  await ensureReplyTemplates(db, '"ap".comment_reply_templates');
  assert.match(calls[0].sql, /CREATE TABLE IF NOT EXISTS "ap"\.comment_reply_templates/);
  assert.equal(calls.filter((c) => /ON CONFLICT \(kind\) DO NOTHING/.test(c.sql)).length, 2);
  const t = await loadReplyTemplates(db);
  assert.equal(t.phone, 'แก้แล้ว');
  assert.equal(t.interest, DEFAULT_REPLY_TEMPLATES.interest);
  assert.equal(t.junk, undefined);
});
