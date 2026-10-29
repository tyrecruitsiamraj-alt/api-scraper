import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateDedupeKey } from '../src/db/repositories.js';

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
