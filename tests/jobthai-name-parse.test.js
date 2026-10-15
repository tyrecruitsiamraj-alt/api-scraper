import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { extractJobThaiName, parseResumeHtml } from '../src/providers/jobthai/parser.js';

test('extractJobThaiName reads separate คำนำหน้า when ชื่อ/นามสกุล are bare', () => {
  const text = [
    'คำนำหน้า นาย',
    'ชื่อ สมชาย',
    'นามสกุล ใจดี',
    'ที่อยู่ กรุงเทพมหานคร 10110',
  ].join('\n');
  const got = extractJobThaiName(text, null);
  assert.equal(got.prefix, 'นาย');
  assert.equal(got.first_name, 'สมชาย');
  assert.equal(got.last_name, 'ใจดี');
  assert.equal(got.name, 'นาย สมชาย ใจดี');
});

test('extractJobThaiName peels title glued inside ชื่อ', () => {
  const text = 'ชื่อ นายสมชาย นามสกุล ใจดี';
  const got = extractJobThaiName(text, null);
  assert.equal(got.prefix, 'นาย');
  assert.equal(got.first_name, 'สมชาย');
  assert.equal(got.last_name, 'ใจดี');
});

test('extractJobThaiName takes title from head1 when labels are bare', () => {
  const html = `
    <div id="detailshow">
      <span class="head1 black">นาย สมชาย ใจดี</span>
      <div>ชื่อ สมชาย</div>
      <div>นามสกุล ใจดี</div>
    </div>
  `;
  const $ = cheerio.load(html);
  const text = 'ชื่อ สมชาย\nนามสกุล ใจดี';
  const got = extractJobThaiName(text, $);
  assert.equal(got.prefix, 'นาย');
  assert.equal(got.first_name, 'สมชาย');
  assert.equal(got.last_name, 'ใจดี');
});

test('parseResumeHtml keeps JobThai คำนำหน้า on the saved record', () => {
  const html = `
    <html><body>
      <div id="detailshow">
        <div>คำนำหน้า</div><div>นางสาว</div>
        <div>ชื่อ</div><div>สมใจ</div>
        <div>นามสกุล</div><div>ดีมาก</div>
        <div>ที่อยู่ กรุงเทพมหานคร 10110</div>
      </div>
      <div>เพศ หญิง อายุ 28 ปี</div>
    </body></html>
  `;
  const rec = parseResumeHtml(html, { sourceUrl: 'https://www.jobthai.com/resume/1', index: 1 });
  assert.equal(rec.prefix, 'นางสาว');
  assert.equal(rec.first_name, 'สมใจ');
  assert.equal(rec.last_name, 'ดีมาก');
  assert.match(rec.name, /^นางสาว /);
});
