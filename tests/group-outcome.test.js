import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGroupOutcome, GROUP_STATE } from '../src/core/group-outcome.js';

// ข้อความจริงจาก run_logs (2 พ.ย. 2569)
const base = { level: 'warn', kind: 'join', group_id: '299450851856799' };

test('ผู้ดูแลพักกลุ่ม = แอดมินพักกลุ่ม ไม่ติ๊กให้', () => {
  const r = classifyGroupOutcome({
    ...base,
    join_state: 'unknown',
    message: 'ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: ผู้ดูแลพักกลุ่มนี้ชั่วคราวเมื่อ 17 สิงหาคม 2026 (กลุ่ม 299450851856799)',
  });
  assert.equal(r.state, 'admin_paused');
  assert.equal(r.detail, 'ผู้ดูแลพักกลุ่มนี้ชั่วคราวเมื่อ 17 สิงหาคม 2026');
  assert.equal(GROUP_STATE[r.state].recommended, false);
});

test('เนื้อหาไม่พร้อมใช้งาน ไม่นับเป็นแอดมินพักกลุ่ม (อาจโดนบล็อกแค่บัญชีนี้)', () => {
  const r = classifyGroupOutcome({
    ...base,
    join_state: 'unknown',
    message: 'ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: เนื้อหานี้ไม่พร้อมใช้งานในขณะนี้ (กลุ่ม 299450851856799)',
  });
  assert.equal(r.state, 'unavailable');
});

test('ข้อความหน้ากลุ่มที่เป็นแค่คำอธิบาย = ไม่เจอช่องโพสต์ ไม่มีรายละเอียด', () => {
  const r = classifyGroupOutcome({
    ...base,
    join_state: 'unknown',
    message: 'ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: ทุกคนสามารถเห็นได้ว่าใครอยู่ในกลุ่มนี้ (กลุ่ม 299450851856799)',
  });
  assert.deepEqual([r.state, r.detail], ['unknown', null]);
});

test('ต้องตอบคำถาม / รอแอดมินรับ = ไม่ติ๊กให้ · กดเข้าร่วมครบโควต้า = ยังติ๊กได้', () => {
  assert.equal(classifyGroupOutcome({ ...base, join_state: 'questions' }).state, 'questions');
  assert.equal(classifyGroupOutcome({ ...base, join_state: 'pending' }).state, 'pending');
  assert.equal(GROUP_STATE.questions.recommended, false);
  assert.equal(GROUP_STATE.pending.recommended, false);
  assert.equal(GROUP_STATE[classifyGroupOutcome({ ...base, join_state: 'limit' }).state].recommended, true);
});

test('โพสต์สำเร็จมีลิงก์ = โพสต์ได้ · รออนุมัติโพสต์ยังนับว่าโพสต์ได้', () => {
  const ok = classifyGroupOutcome({ level: 'success', group_id: '1', post_link: 'https://www.facebook.com/groups/1/posts/9' });
  assert.deepEqual([ok.state, ok.url], ['ok', 'https://www.facebook.com/groups/1/posts/9']);
  assert.equal(classifyGroupOutcome({ level: 'success', group_id: '1', post_status: 'รออนุมัติ' }).state, 'post_pending');
  assert.equal(classifyGroupOutcome({ level: 'success', group_id: '1' }).state, 'unconfirmed');
});

test('กดโพสต์แล้วเด้งกล่องตอบคำถามสมาชิก = ต้องเข้ากลุ่มเอง ไม่ใช่ Facebook ไม่รับโพสต์', () => {
  const r = classifyGroupOutcome({
    level: 'warn',
    group_id: '792186948245459',
    kind: 'post_rejected',
    fb_message:
      'หน้าต่างโพสต์ไม่ปิดหลังกดโพสต์ 30 วินาที หน้าจอเขียนว่า: สร้างโพสต์…โพสต์การตรวจสอบการเข้าร่วมหางานขับรถและรับสมัครงานขับรถสมาชิก 1.3 แสน คน • 10 โพสต์ต่อวันคุณใกล้พร้อมที่จะโพสต์และแสดงความคิดเห็นแล้ว ช่วยให้ผู้ดูแลรู้จักคุณมากขึ้นด้วยการตอบคำถามเหล่านี้',
  });
  assert.equal(r.state, 'questions');
  assert.equal(GROUP_STATE[r.state].recommended, false);
});

test('Facebook ไม่รับโพสต์ เก็บข้อความของ Facebook ไว้', () => {
  const r = classifyGroupOutcome({ level: 'warn', group_id: '1', kind: 'post_rejected', fb_message: 'โพสต์ของคุณขัดต่อมาตรฐานชุมชน' });
  assert.deepEqual([r.state, r.detail], ['rejected', 'โพสต์ของคุณขัดต่อมาตรฐานชุมชน']);
});
