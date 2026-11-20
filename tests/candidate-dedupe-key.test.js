import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { candidateDedupeKey, isMergeablePhone, namesClearlyDiffer } from '../src/db/repositories.js';

test('เบอร์มาก่อน แล้วอีเมล', () => {
  assert.equal(candidateDedupeKey({ phoneNorm: '0812345678', emailNorm: 'a@b.co', name: 'สมชาย', birthDate: '1990-01-01' }), 'phone:0812345678');
  assert.equal(candidateDedupeKey({ phoneNorm: '', emailNorm: 'a@b.co', name: 'สมชาย', birthDate: '' }), 'email:a@b.co');
});

test('ชื่อใช้รวมคนได้เมื่อมีวันเกิดด้วยเท่านั้น', () => {
  assert.equal(candidateDedupeKey({ phoneNorm: '', emailNorm: '', name: 'สมชาย ใจดี', birthDate: '1990-01-01' }), 'name:สมชาย ใจดี:1990-01-01');
  const src = { platform: 'jobthai', externalId: '123456' };
  assert.equal(candidateDedupeKey({ phoneNorm: '', emailNorm: '', name: 'สมชาย ใจดี', birthDate: '', source: src }), 'src:jobthai:123456');
});

test('ไม่มีข้อมูลระบุตัวตน = คีย์ไม่ซ้ำกัน (ห้ามรวมเรซูเม่คนละใบ)', () => {
  const a = candidateDedupeKey({ phoneNorm: '', emailNorm: '', name: '', birthDate: '' });
  const b = candidateDedupeKey({ phoneNorm: '', emailNorm: '', name: '', birthDate: '' });
  assert.notEqual(a, 'name::');
  assert.notEqual(a, b);
  assert.equal(
    candidateDedupeKey({ phoneNorm: '', emailNorm: '', name: '', birthDate: '', source: { platform: 'jobbkk', externalId: 'R-99' } }),
    'src:jobbkk:R-99',
  );
});

// 30 ต.ค.–20 พ.ย. 2569: เบอร์ call center ของ JobThai (02-480-9999) ทำให้โปรไฟล์ JobThai 824 ใบถูกรวมเป็นผู้สมัครคนเดียว
test('เบอร์บ้าน/สำนักงานใช้รวมคนไม่ได้ ใช้ได้เฉพาะมือถือ', () => {
  assert.equal(isMergeablePhone('0812345678'), true);
  assert.equal(isMergeablePhone('66912345678'), true);
  assert.equal(isMergeablePhone('024809999'), false);
  assert.equal(isMergeablePhone(''), false);
  const src = { platform: 'jobthai', externalId: '2222222' };
  assert.equal(candidateDedupeKey({ phoneNorm: '024809999', emailNorm: '', name: 'สมชาย ใจดี', birthDate: '', source: src }), 'src:jobthai:2222222');
  assert.equal(candidateDedupeKey({ phoneNorm: '024809999', emailNorm: '', name: 'สมชาย ใจดี', birthDate: '1990-01-01', source: src }), 'name:สมชาย ใจดี:1990-01-01');
});

test('ชื่อต่างกันชัดเจน = คนละคน · มี/ไม่มีคำนำหน้าหรือนามสกุล = ยังไม่ตัดสิน', () => {
  assert.equal(namesClearlyDiffer('นายสมชาย ใจดี', 'สมหญิง รักงาน'), true);
  assert.equal(namesClearlyDiffer('นายสมชาย ใจดี', 'สมชาย ใจดี'), false);
  assert.equal(namesClearlyDiffer('สมชาย', 'สมชาย ใจดี'), false);
  assert.equal(namesClearlyDiffer('', 'สมชาย ใจดี'), false);
  const repo = fs.readFileSync(new URL('../src/db/repositories.js', import.meta.url), 'utf8');
  assert.match(repo, /const matchPhone = isMergeablePhone\(phoneNorm\) \? phoneNorm : '';/);
  assert.match(repo, /namesClearlyDiffer\(found\.rows\[0\]\.full_name, parsed\.name\)[\s\S]{0,400}platform = \$2 AND external_id IS DISTINCT FROM \$3/);
});
