import test from 'node:test';
import assert from 'node:assert/strict';
import { jobthaiProvider, isHiddenContactBlob } from '../src/providers/jobthai/index.js';

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
