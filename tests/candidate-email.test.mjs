import test from 'node:test';
import assert from 'node:assert/strict';
import { dropUnstorableEmail, isPlaceholderEmail, isRealEmail } from '../src/core/candidate-email.js';
import { resumeContactGaps } from '../src/core/resume-completeness.js';
import { contactsFromText } from '../src/core/contacts.js';
import { jobthaiProvider } from '../src/providers/jobthai/index.js';

// ข้อความหน้าเรซูเม่ JobThai ตอนยังไม่เปิดข้อมูลติดต่อ (รูปแบบจากหน้าจริง 25 พ.ย. 2569)
const JOBTHAI_LOCKED_PAGE = [
  'นายสมชาย ใจดี',
  'อายุ 34 ปี  เพศ ชาย',
  'ติดต่อเจ้าหน้าที่ 02-480-9999',
  'อีเมล jobthai@example.com',
  "} else if((email.value.length > 9) && email.value.match(/@example\\.com/)) {",
  "alert(' กรุณาตรวจสอบความถูกต้องของอีเมล');",
].join('\n');

test('อีเมลตัวอย่างของ JobThai ไม่ใช่อีเมลผู้สมัคร ทุกรูปแบบที่เขียน', () => {
  assert.equal(isPlaceholderEmail('jobthai@example.com'), true);
  assert.equal(isPlaceholderEmail(' JobThai@Example.COM '), true);
  assert.equal(isPlaceholderEmail('someone@mail.example.org'), true);
  assert.equal(isPlaceholderEmail('somchai.j@gmail.com'), false);
  assert.equal(isPlaceholderEmail('somchai@examples.co.th'), false);
  assert.equal(isPlaceholderEmail(''), false);
  assert.equal(isRealEmail('jobthai@example.com'), false);
  assert.equal(isRealEmail('somchai.j@gmail.com'), true);
  assert.equal(isRealEmail('ไม่ระบุ'), false);
});

test('ตัดอีเมลตัวอย่างออกจาก record โดยไม่แตะช่องอื่น', () => {
  const out = dropUnstorableEmail({ name: 'สมชาย', email: 'jobthai@example.com', phone: '' });
  assert.equal(out.email, '');
  assert.equal(out.name, 'สมชาย');
  const keep = { email: 'somchai.j@gmail.com' };
  assert.equal(dropUnstorableEmail(keep), keep);
});

test('ไม่มีเบอร์ มีแต่อีเมลตัวอย่าง = ขาดช่องทางติดต่อ (ไม่ขึ้นผ่านเกณฑ์)', () => {
  assert.deepEqual(resumeContactGaps({ phone: '', email: 'jobthai@example.com' }), ['contact']);
  assert.deepEqual(resumeContactGaps({ phone: '', email: 'somchai.j@gmail.com' }), []);
  assert.deepEqual(resumeContactGaps({ phone: '0812345678', email: 'jobthai@example.com' }), []);
});

test('ตัวเติมช่องว่างจากข้อความหน้า ไม่หยิบอีเมลตัวอย่าง', () => {
  const rec = jobthaiProvider.finalizeCandidateRecord({ name: 'นายสมชาย ใจดี', phone: '', email: '', raw_text: JOBTHAI_LOCKED_PAGE });
  assert.equal(rec.email, '');
  assert.deepEqual(resumeContactGaps(rec), ['contact']);
});

test('อ่านจากไฟล์แนบ (OCR) ไม่หยิบอีเมลตัวอย่าง แต่ยังหยิบอีเมลจริง', () => {
  assert.equal(contactsFromText(JOBTHAI_LOCKED_PAGE).email, '');
  assert.equal(contactsFromText('อีเมล: somchai.j@gmail.com โทร 081-234-5678').email, 'somchai.j@gmail.com');
});
