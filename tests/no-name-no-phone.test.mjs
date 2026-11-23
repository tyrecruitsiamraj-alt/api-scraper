import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lacksNameAndPhone } from '../src/core/resume-completeness.js';

// 23 พ.ย. 2569 เจ้าของเลือก: ซ่อนชื่อแต่มีเบอร์ = ส่ง Jarvis · ไม่มีทั้งชื่อและเบอร์ = ไม่ใส่ใบงาน
test('only people with neither a name nor a phone are kept out of an order', () => {
  assert.equal(lacksNameAndPhone({ name: '', phone: '' }), true);
  assert.equal(lacksNameAndPhone({ name: '', phone: '', email: 'a@gmail.com' }), true);
  assert.equal(lacksNameAndPhone({ name: '', phone: '0812345678' }), false);
  assert.equal(lacksNameAndPhone({ name: 'สมชาย ใจดี', phone: '' }), false);
  assert.equal(lacksNameAndPhone({ full_name: 'สมชาย ใจดี' }), false);
});

test('the pipeline saves them to the library but does not link them to the order, and records name_hidden', () => {
  const src = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(src, /const keepOutOfTask = lacksNameAndPhone\(parsed\);/);
  assert.match(src, /const taskLink = keepOutOfTask \? null : await linkCandidateToTask\(client, \{/);
  assert.match(src, /if \(parsed\.name_hidden\) await markCandidateNameHidden\(client, cand\.id\);/);
  const repo = fs.readFileSync(new URL('../src/db/repositories.js', import.meta.url), 'utf8');
  assert.match(repo, /UPDATE candidates SET name_hidden = true WHERE id = \$1 AND COALESCE\(TRIM\(full_name\), ''\) = ''/);
  assert.match(fs.readFileSync(new URL('../src/db/schema-032.sql', import.meta.url), 'utf8'), /ADD COLUMN IF NOT EXISTS name_hidden boolean/);
});
