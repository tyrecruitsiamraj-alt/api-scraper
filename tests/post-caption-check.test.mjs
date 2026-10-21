import test from 'node:test';
import assert from 'node:assert/strict';
import { postCaptionIssues } from '../src/core/post-caption-check.js';

const GOOD = `รับสมัครพนักงานขับรถ นายไทย (หน่วยงาน ตัวอย่าง)
💰 รายได้ 19,844++ บาท/เดือน
โทรติดต่อ : 0900000000 (คุณเอ)
หรือสมัครงานได้ที่ : https://jarvis.siamrajathanee.dev/apply/p/abc1234`;

test('a Jarvis caption with contact and apply link passes', () => {
  assert.deepEqual(postCaptionIssues(GOOD), []);
});

test('internal request numbers and instructions are blocked', () => {
  const caption = `${GOOD}\nปฏิบัติงานทุกวัน, ขอให้ OPL เป็นผู้ดำเนินการจัดตาราง\nอ้างอิง OPL6910068`;
  const issues = postCaptionIssues(caption);
  assert.ok(issues.some((i) => i.includes('เลขใบขอ')));
  assert.ok(issues.some((i) => i.includes('สั่งงานภายใน')));
});

test('a caption without any way to apply is blocked', () => {
  assert.deepEqual(postCaptionIssues('รับสมัครพนักงานขับรถ เงินเดือน 13,000'), ['ไม่มีเบอร์โทรหรือลิงก์สมัคร']);
  assert.deepEqual(postCaptionIssues('   '), ['ไม่มีข้อความประกาศ']);
});
