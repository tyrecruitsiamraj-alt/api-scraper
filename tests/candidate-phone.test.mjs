import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dropUnstorablePhone, isSitePhone } from '../src/core/candidate-phone.js';

test('เบอร์ call center ของ JobThai ไม่ใช่เบอร์ผู้สมัคร ทุกรูปแบบที่เขียน', () => {
  assert.equal(isSitePhone('02-480-9999'), true);
  assert.equal(isSitePhone('024809999'), true);
  assert.equal(isSitePhone('+66 2 480 9999'), true);
  assert.equal(isSitePhone('0812345678'), false);
  assert.equal(isSitePhone(''), false);
});

test('ตัดเบอร์ของเว็บทิ้งโดยไม่ต้องถามฐาน · ฐานว่างแล้วก็ยังกันได้', async () => {
  let asked = 0;
  const exec = async () => { asked += 1; return { rows: [{ n: 0 }] }; };
  const out = await dropUnstorablePhone(exec, 'c1', { phone: '02-480-9999', name: 'ก' });
  assert.equal(out.phone, '');
  assert.equal(out.name, 'ก');
  assert.equal(asked, 0);
});

test('เบอร์ที่คนอื่นใช้ร่วม ≥ 5 คน = เบอร์กลาง ไม่เก็บ · ไม่นับตัวเอง', async () => {
  let params;
  const shared = async (_sql, p) => { params = p; return { rows: [{ n: 5 }] }; };
  assert.equal((await dropUnstorablePhone(shared, 'c1', { phone: '0812345678' })).phone, '');
  assert.deepEqual(params, ['0812345678', 'c1']);
  const own = async () => ({ rows: [{ n: 1 }] });
  assert.equal((await dropUnstorablePhone(own, 'c1', { phone: '0812345678' })).phone, '0812345678');
});

test('ทุกทางที่เขียนเบอร์ลงผู้สมัครผ่านตัวกันเดียวกัน', () => {
  const repo = fs.readFileSync(new URL('../src/db/repositories.js', import.meta.url), 'utf8');
  assert.match(repo, /export async function patchCandidateFromParsed\(id, parsed\) \{[\s\S]{0,200}dropUnstorablePhone\(query, id, parsed/);
  assert.match(repo, /export async function fillCandidateContacts\([^)]*\) \{\s*\(\{ phone \} = await dropUnstorablePhone/);
  assert.match(repo, /function buildRow\(parsed, source\) \{\s*if \(isSitePhone\(parsed\?\.phone\)\)/);
  const repair = fs.readFileSync(new URL('../src/core/repair-incomplete-candidates.js', import.meta.url), 'utf8');
  assert.match(repair, /async function patchCandidateById\(client, id, parsed\) \{\s*parsed = await dropUnstorablePhone/);
});
