const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyComment,
  contactFromCaption,
  buildAutoReply,
  requestNoFromJobId,
  commentKey,
  saveComments,
  pendingReplies,
} = require('../server/comment-leads');

const caption = 'รับสมัครพนักงานขับรถ Valet parking\n💰 รายได้ 12,500++\nโทรติดต่อ : 0613866408 (คุณหมิว)\nหรือสมัครงานได้ที่ : https://jarvis.example/apply/p/4hpb57s';

test('classifyComment sorts phone, interest, question and other', () => {
  assert.equal(classifyComment('สนใจค่ะ 089-123-4567'), 'phone');
  assert.equal(classifyComment('สนใจค่ะ'), 'interest');
  assert.equal(classifyComment('สนใจ'), 'interest');
  assert.equal(classifyComment('.'), 'interest');
  assert.equal(classifyComment('เงินเดือนเท่าไหร่คะ'), 'question');
  assert.equal(classifyComment('รับผู้หญิงไหมคะ'), 'question');
  assert.equal(classifyComment('อายุ 52 สมัครได้ป่าว'), 'question');
  assert.equal(classifyComment('เคยขับรถผู้บริหารมา 10 ปี มีใบขับขี่ท 2'), 'other');
  // อ่านข้อความไม่ได้ (สติกเกอร์ หรือจับผิดจุด) ต้องไม่ได้คำตอบอัตโนมัติ
  assert.equal(classifyComment(''), 'other');
  assert.equal(classifyComment('   '), 'other');
});

test('contactFromCaption picks the apply link, phone and contact name', () => {
  assert.deepEqual(contactFromCaption(caption), {
    link: 'https://jarvis.example/apply/p/4hpb57s',
    phone: '0613866408',
    contactName: 'คุณหมิว',
  });
});

test('buildAutoReply answers only phone and interest comments', () => {
  const interest = buildAutoReply({ kind: 'interest', name: 'Somchai Jaidee', caption, position: 'พนักงานขับรถ Valet parking' });
  assert.match(interest, /คุณSomchai/);
  assert.match(interest, /https:\/\/jarvis\.example\/apply\/p\/4hpb57s/);
  assert.match(interest, /0613866408 \(คุณหมิว\)/);
  assert.match(buildAutoReply({ kind: 'phone', name: 'A B' }), /ได้รับเบอร์แล้ว/);
  assert.equal(buildAutoReply({ kind: 'question', name: 'A', caption }), null);
  assert.equal(buildAutoReply({ kind: 'other', name: 'A', caption }), null);
});

test('requestNoFromJobId and commentKey', () => {
  assert.equal(requestNoFromJobId('jv-lbm6903001-r2'), 'LBM6903001');
  assert.equal(requestNoFromJobId('jv-opl6910006'), 'OPL6910006');
  assert.equal(requestNoFromJobId('mrunpulc7nar4gr2z19'), null);
  assert.equal(commentKey({ commentUrl: 'https://www.facebook.com/groups/1/posts/2/?comment_id=987654321' }, 'p'), 'fb:987654321');
  assert.match(commentKey({ name: 'A', text: 'สนใจ' }, 'p'), /^h:[0-9a-f]{40}$/);
});

test('saveComments marks questions for a human and queues template replies', async () => {
  const rows = [];
  const db = {
    async query(sql, params) {
      if (sql.startsWith('INSERT')) {
        const [id, key, , , , , requestNo, postLink, , name, , text, phone, kind, needsHuman, reply, source] = params;
        if (!rows.find((r) => r.comment_key === key)) {
          rows.push({ id, comment_key: key, request_no: requestNo, post_link: postLink, commenter_name: name, comment_text: text, phone, kind, needs_human: needsHuman, reply_text: reply, reply_source: source, replied_at: null, reply_error: null });
        }
        return { rows: [] };
      }
      return { rows: rows.filter((r) => r.post_link === params[0]) };
    },
  };
  const post = { post_log_id: 'pl1', post_link: 'https://fb/p/1', job_id: 'jv-lbm6903001-r2', caption, position: 'พนักงานขับรถ' };
  const out = await saveComments(db, post, [
    { name: 'Somchai J', text: 'สนใจครับ' },
    { name: 'Malee K', text: 'รับผู้หญิงไหมคะ' },
    { name: 'Dang P', text: 'สนใจ 0812345678' },
    { name: 'Somchai J', text: 'สนใจครับ' },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].request_no, 'LBM6903001');
  assert.equal(out.find((r) => r.commenter_name === 'Malee K').needs_human, true);
  assert.equal(out.find((r) => r.commenter_name === 'Dang P').phone, '0812345678');
  assert.equal(pendingReplies(out).length, 2);
});
