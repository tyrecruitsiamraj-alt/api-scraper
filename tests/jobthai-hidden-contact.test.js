import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { jobthaiProvider, isHiddenContactBlob, isThaiMobile } from '../src/providers/jobthai/index.js';

// ข้อความตอน JobThai ยังปิดข้อมูลติดต่อ (ตัวเลขเป็นค่าสมมติ)
const HIDDEN = '####เพื่อความปลอดภัยในข้อมูลของท่าน กรุณาติดต่อเจ้าหน้าที่ โทร 02-000-0000####02-000-0000####someone@example.com####1618';
const REAL = '####081-234-5678####driver.test@gmail.com####driverline####20.225####1618';

test('hidden-contact reply is detected', () => {
  assert.equal(isHiddenContactBlob(HIDDEN), true);
  assert.equal(isHiddenContactBlob(REAL), false);
});

test('enrichContacts keeps no phone/email when contact is hidden', async () => {
  const request = { get: async () => ({ ok: () => true, text: async () => HIDDEN }) };
  const rec = await jobthaiProvider.enrichContacts(request, 'R1', { name: 'สมชาย', phone: '', email: '', parse_status: 'partial' });
  assert.equal(rec.phone, '');
  assert.equal(rec.email, '');
  assert.equal(rec.parse_status, 'partial');
});

test('enrichContacts still reads a real reveal', async () => {
  const request = { get: async () => ({ ok: () => true, text: async () => REAL }) };
  const rec = await jobthaiProvider.enrichContacts(request, 'R1', { name: 'สมชาย', phone: '', email: '', parse_status: 'partial' });
  assert.equal(rec.phone, '0812345678');
  assert.equal(rec.email, 'driver.test@gmail.com');
  assert.equal(rec.parse_status, 'success');
});

// 20 พ.ย. 2569: JobThai ตอบ "Error" พร้อมเบอร์ call center — เบอร์นี้ถูกเก็บเป็นเบอร์ผู้สมัคร แล้วโปรไฟล์ 824 ใบถูกรวมเป็นคนเดียว
const ERROR_REPLY = '####Error####02-480-9999';

test('คำตอบ Error ของ JobThai = ยังไม่เปิดข้อมูลติดต่อ ไม่เก็บเบอร์ call center', async () => {
  assert.equal(isHiddenContactBlob(ERROR_REPLY), true);
  assert.equal(isHiddenContactBlob('Error####024809999####'), true);
  const request = { get: async () => ({ ok: () => true, text: async () => ERROR_REPLY }) };
  const rec = await jobthaiProvider.enrichContacts(request, 'R1', { name: 'สมชาย', phone: '', email: '', line_id: '', parse_status: 'partial' });
  assert.equal(rec.phone, '');
  assert.equal(rec.line_id, '');
  assert.equal(rec.contact_hidden, true);
});

test('เบอร์ที่รับเป็นของผู้สมัครต้องเป็นมือถือ · เบอร์สำนักงานในคำตอบไม่รับ', async () => {
  assert.equal(isThaiMobile('0812345678'), true);
  assert.equal(isThaiMobile('66812345678'), true);
  assert.equal(isThaiMobile('024809999'), false);
  const request = { get: async () => ({ ok: () => true, text: async () => '####02-480-9999####1618' }) };
  const rec = await jobthaiProvider.enrichContacts(request, 'R1', { name: 'สมชาย', phone: '', email: '', parse_status: 'partial' });
  assert.equal(rec.phone, '');
  assert.equal(rec.contact_hidden, true);
  const pipeline = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(pipeline, /if \(contactHidden >= hiddenStopAt && contactShown === 0\) stopHiddenContacts = true;/);
  assert.match(pipeline, /CONTACT_REVEAL_BLOCKED/);
});

// 24 พ.ย. 2569: หน้าเรซูเม่ตอนเบอร์ยังปิดมีข้อความ "ติดต่อเจ้าหน้าที่ 02-480-9999" ตัวเติมช่องที่ขาดหยิบไปเป็นเบอร์ผู้สมัคร
// ผู้สมัคร 846 คนใน 2 วันได้เบอร์นี้ 151 คนอยู่ในรายชื่อผ่านเกณฑ์
test('JobThai: เบอร์จากข้อความหน้าเรซูเม่รับเฉพาะมือถือ ทุกครั้งที่เติมช่องที่ขาด', () => {
  const page = { name: 'สมชาย ใจดี', phone: '', raw_text: 'สมชาย ใจดี เพศ ชาย กรุณาติดต่อเจ้าหน้าที่ โทร 02-480-9999' };
  assert.equal(jobthaiProvider.finalizeCandidateRecord({ ...page }).phone, '');
  const revealed = jobthaiProvider.finalizeCandidateRecord({ ...page, phone: '0812345678' });
  assert.equal(revealed.phone, '0812345678');
});

test('เปิดเบอร์ไม่ได้: ล้างเบอร์ที่ติดมาจากหน้าเรซูเม่ทิ้ง', async () => {
  const request = { get: async () => ({ ok: () => true, text: async () => ERROR_REPLY }) };
  const rec = await jobthaiProvider.enrichContacts(request, 'R1', { name: 'สมชาย', phone: '024809999', email: '' });
  assert.equal(rec.phone, '');
  assert.equal(rec.contact_hidden, true);
});

test('ล้มทั้งใบเฉพาะตอนบัญชีเปิดเบอร์ไม่ได้ทั้งบัญชี · บัญชีเพิ่งเปิดเบอร์ได้ = ข้ามคนที่ไม่เปิดไปคนถัดไป', () => {
  const pipeline = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(pipeline, /connectorRevealedRecently\(connector\.id\)[\s\S]{0,80}\? CONTACT_HIDDEN_STOP_ALIVE[\s\S]{0,20}: CONTACT_HIDDEN_STOP/);
  assert.match(pipeline, /reasonCounts\.contact_shown = \(reasonCounts\.contact_shown \|\| 0\) \+ 1/);
  const repo = fs.readFileSync(new URL('../src/db/repositories.js', import.meta.url), 'utf8');
  assert.match(repo, /reason_counts->>'contact_shown'/);
});
