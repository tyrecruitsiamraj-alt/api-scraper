import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasFullName, taskEntryGaps } from '../src/core/resume-completeness.js';
import { rankBankCandidates } from '../src/core/candidate-bank.js';

// 25 พ.ย. 2569 เจ้าของสั่ง: เข้าใบงานได้ต้องมีชื่อ นามสกุล และเบอร์หรืออีเมลอย่างน้อยหนึ่งอย่าง
test('a person enters an order only with first name, last name, and a phone or a real email', () => {
  assert.deepEqual(taskEntryGaps({ first_name: 'สมชาย', last_name: 'ใจดี', phone: '0812345678' }), []);
  assert.deepEqual(taskEntryGaps({ full_name: 'นายสมชาย ใจดี', phone: '', email: 'somchai@gmail.com' }), []);
  assert.deepEqual(taskEntryGaps({ name: 'สมชาย ใจดี', phone: '', email: '' }), ['contact']);
  // อีเมลตัวอย่างของ JobThai ไม่นับเป็นช่องทางติดต่อ
  assert.deepEqual(taskEntryGaps({ name: 'สมชาย ใจดี', phone: '', email: 'sample@example.com' }), ['contact']);
  // ซ่อนชื่อบน JobThai แต่มีเบอร์ = ไม่เอาแล้ว (เดิม 23 พ.ย. ส่ง)
  assert.deepEqual(taskEntryGaps({ name: '', name_hidden: true, phone: '0812345678' }), ['name']);
  assert.deepEqual(taskEntryGaps({ name: '', phone: '' }), ['name', 'contact']);
});

test('a first name alone or a bare title is not a full name', () => {
  assert.equal(hasFullName({ name: 'สมชาย' }), false);
  assert.equal(hasFullName({ name: 'นาย สมชาย' }), false);
  assert.equal(hasFullName({ first_name: 'สมชาย', last_name: '' }), false);
  assert.equal(hasFullName({ first_name: 'สมชาย', last_name: 'ใจดี' }), true);
  assert.equal(hasFullName({ full_name: 'นางสาวสมหญิง ใจงาม' }), true);
});

test('the candidate library uses the same rule', () => {
  const rows = [
    { id: 'c1', full_name: 'นายสมชาย ใจดี', first_name: 'สมชาย', last_name: 'ใจดี', phone: '0812345678', email: '' },
    { id: 'c2', full_name: '', first_name: '', last_name: '', phone: '0898765432', email: '' },
    { id: 'c3', full_name: 'นายสมศักดิ์ รักงาน', first_name: 'สมศักดิ์', last_name: 'รักงาน', phone: '', email: '' },
  ];
  assert.deepEqual(rankBankCandidates(rows).map((r) => r.row.id), ['c1']);
});

test('the pipeline keeps them in the library, skips the contact reveal without a name, and records name_hidden', () => {
  const src = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(src, /const entryGaps = taskEntryGaps\(parsed\);\s*const keepOutOfTask = entryGaps\.length > 0;/);
  assert.match(src, /provider\.enrichContacts && hasFullName\(parsed\)\) \{/);
  assert.match(src, /const taskLink = keepOutOfTask \? null : await linkCandidateToTask\(client, \{/);
  assert.match(src, /if \(parsed\.name_hidden\) await markCandidateNameHidden\(client, cand\.id\);/);
});
