const test = require('node:test');
const assert = require('node:assert/strict');
const { locatePost, nextPostStatus, postIdOf } = require('../server/post-content-status');

const caption = 'รับสมัครพนักงานขับรถผู้บริหาร (หน่วยงาน SO)\n💵 รายได้ 18,000-22,000 บาท/เดือน\n📍 ทำงาน กทม. สาทร\n📞 โทร 081-234-5678';
const tabs = [
  { tab: 'posted', ok: true, items: [{ post_id: '1234567890123401', text: 'งานอื่น รับสมัครแม่บ้าน ประจำอาคาร' }] },
  { tab: 'pending', ok: true, items: [{ post_id: '1234567890123402', text: 'รับสมัครพนักงานขับรถผู้บริหาร (หน่วยงาน SO) รายได้ ...' }] },
  { tab: 'declined', ok: true, items: [{ post_id: '1234567890123403', text: 'xx' }] },
  { tab: 'removed', ok: true, items: [{ post_id: '1234567890123404', text: 'yy' }] },
];

test('เลขโพสต์จากลิงก์ทุกแบบ', () => {
  assert.equal(postIdOf('https://www.facebook.com/groups/1481054599057270/posts/1234567890123403/'), '1234567890123403');
  assert.equal(postIdOf('https://www.facebook.com/groups/1481054599057270/permalink/1234567890123403'), '1234567890123403');
  assert.equal(postIdOf('https://www.facebook.com/permalink.php?story_fbid=1234567890123403&id=1'), '1234567890123403');
  assert.equal(postIdOf(''), null);
});

test('มีลิงก์: หาจากเลขโพสต์ในทุกแท็บ', () => {
  const link = (id) => `https://www.facebook.com/groups/1481054599057270/posts/${id}/`;
  assert.deepEqual(locatePost({ link: link('1234567890123403') }, tabs), { tab: 'declined', status: 'ถูกปฏิเสธ', post_id: '1234567890123403', by: 'id' });
  assert.equal(locatePost({ link: link('1234567890123404') }, tabs).status, 'ถูกลบ');
  assert.equal(locatePost({ link: link('1234567890123401') }, tabs).status, 'อนุมัติเเล้ว');
  assert.equal(locatePost({ link: link('9999999999999999') }, tabs), null, 'ไม่เจอในแท็บไหน = ยังไม่รู้ ไม่เดา');
});

test('มีลิงก์แต่ไม่เจอเลข ไม่เดาจากข้อความ (กันจับโพสต์เก่าของงานเดียวกัน)', () => {
  const r = locatePost({ link: 'https://www.facebook.com/groups/1/posts/5555555555555555', caption }, tabs);
  assert.equal(r, null);
});

test('ไม่มีลิงก์: จับจากข้อความประกาศ ข้ามเลขที่แถวอื่นใช้แล้ว', () => {
  assert.deepEqual(locatePost({ caption }, tabs), { tab: 'pending', status: 'รออนุมัติ', post_id: '1234567890123402', by: 'caption' });
  assert.equal(locatePost({ caption, takenIds: ['1234567890123402'] }, tabs), null);
  assert.equal(locatePost({}, tabs), null);
});

test('แท็บที่เปิดไม่ได้ ไม่นับ', () => {
  const broken = tabs.map((t) => (t.tab === 'declined' ? { ...t, ok: false } : t));
  assert.equal(locatePost({ link: 'https://www.facebook.com/groups/1/posts/1234567890123403' }, broken), null);
});

test('เปลี่ยนสถานะได้เฉพาะทางที่ Facebook เป็นจริง', () => {
  assert.equal(nextPostStatus('รออนุมัติ', 'อนุมัติเเล้ว'), 'อนุมัติเเล้ว');
  assert.equal(nextPostStatus('รออนุมัติ', 'ถูกปฏิเสธ'), 'ถูกปฏิเสธ');
  assert.equal(nextPostStatus('ไม่พบลิงก์หลังโพสต์', 'ถูกลบ'), 'ถูกลบ');
  assert.equal(nextPostStatus('รออนุมัติ', 'รออนุมัติ'), null);
  assert.equal(nextPostStatus('อนุมัติเเล้ว', 'ถูกลบ'), 'ถูกลบ');
  assert.equal(nextPostStatus('อนุมัติเเล้ว', 'รออนุมัติ'), null, 'เผยแพร่แล้วไม่ย้อนกลับไปรอ');
  assert.equal(nextPostStatus('อนุมัติเเล้ว', 'ถูกปฏิเสธ'), null);
  assert.equal(nextPostStatus('ถูกปฏิเสธ', 'อนุมัติเเล้ว'), null);
  assert.equal(nextPostStatus('รออนุมัติ', 'อะไรก็ไม่รู้'), null);
});
