import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasFullName, taskEntryGaps, withStoredIdentity } from '../src/core/resume-completeness.js';
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

test('a resume that shows no phone this time still counts the phone the library already has', () => {
  const parsed = { name: 'สมชาย ใจดี', phone: '', email: '' };
  assert.deepEqual(taskEntryGaps(withStoredIdentity(parsed, null)), ['contact']);
  assert.deepEqual(taskEntryGaps(withStoredIdentity(parsed, { phone: '0812345678' })), []);
  assert.deepEqual(taskEntryGaps(withStoredIdentity({ name: '', phone: '0812345678' }, { full_name: 'นายสมชาย ใจดี' })), []);
  // ไม่แก้เรคคอร์ดเดิม
  assert.equal(parsed.phone, '');
});

test('the pipeline does not save them at all, remembers their resume ids, and skips the contact reveal without a name', () => {
  const src = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(src, /const entryGaps = taskEntryGaps\(withStoredIdentity\(parsed, stored\)\);/);
  assert.match(src, /skippedExternalIds\.add\(String\(id\)\);\s*filteredOut \+= 1;[\s\S]{0,200}return;/);
  // ตัดสินก่อนดาวน์โหลดไฟล์แนบและก่อนบันทึก
  assert.ok(src.indexOf('const entryGaps = taskEntryGaps') < src.indexOf('Always download every listed attachment'));
  assert.ok(src.indexOf('const entryGaps = taskEntryGaps') < src.indexOf('await upsertCandidate(client, parsed'));
  assert.match(src, /provider\.enrichContacts && hasFullName\(parsed\)\) \{/);
  assert.match(src, /reasonCounts, skippedExternalIds \}\);/);
  const repo = fs.readFileSync(new URL('../src/db/repositories.js', import.meta.url), 'utf8');
  assert.match(repo, /jsonb_build_object\('skipped_external_ids', \$15::jsonb\)/);
  assert.match(repo, /SELECT jsonb_array_elements_text\(r\.funnel->'skipped_external_ids'\)/);
});
