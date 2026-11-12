import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroupLinks } from '../src/core/group-links.js';

test('อ่านลิงก์กลุ่มหลายบรรทัด ทั้งลิงก์เต็ม ลิงก์มีพารามิเตอร์ และเลขล้วน', () => {
  const r = parseGroupLinks([
    'https://www.facebook.com/groups/1481054599057270/',
    'https://www.facebook.com/groups/585014218865197/?ref=share&mibextid=NSMWBT',
    '  facebook.com/groups/302837696487513  ',
    '',
    '642114699248215',
  ].join('\n'));
  assert.deepEqual(r.ids, ['1481054599057270', '585014218865197', '302837696487513', '642114699248215']);
  assert.deepEqual(r.invalid, []);
  assert.equal(r.repeated, 0);
});

test('เลขซ้ำในรอบเดียวกันนับครั้งเดียว และบอกจำนวนที่ซ้ำ', () => {
  const r = parseGroupLinks('https://www.facebook.com/groups/1481054599057270/\n1481054599057270\r\nhttps://m.facebook.com/groups/1481054599057270?ref=x');
  assert.deepEqual(r.ids, ['1481054599057270']);
  assert.equal(r.repeated, 2);
});

test('ลิงก์ที่ไม่มีเลขกลุ่มรายงานว่าอ่านไม่ได้ ไม่เดาเลข', () => {
  const r = parseGroupLinks([
    'https://www.facebook.com/groups/hangankhabrot/',
    'https://www.facebook.com/share/g/1AbCdEfGh/',
    'หางานขับรถ กทม',
    '12345',
    'https://www.facebook.com/groups/585014218865197/posts/1234567890123456/',
  ].join('\n'));
  assert.deepEqual(r.ids, ['585014218865197']);
  assert.deepEqual(r.invalid, [
    'https://www.facebook.com/groups/hangankhabrot/',
    'https://www.facebook.com/share/g/1AbCdEfGh/',
    'หางานขับรถ กทม',
    '12345',
  ]);
});

test('หลายลิงก์ในบรรทัดเดียว (คั่นช่องว่าง/จุลภาค) อ่านได้ทุกอัน · ข้อความชื่อต่อท้ายไม่ทำให้ผิด', () => {
  const r = parseGroupLinks('https://www.facebook.com/groups/1481054599057270, https://www.facebook.com/groups/585014218865197\n642114699248215 หางานขับรถ กทม');
  assert.deepEqual(r.ids, ['1481054599057270', '585014218865197', '642114699248215']);
  assert.deepEqual(r.invalid, []);
});

test('ค่าว่าง', () => {
  assert.deepEqual(parseGroupLinks(''), { ids: [], invalid: [], repeated: 0 });
  assert.deepEqual(parseGroupLinks(null), { ids: [], invalid: [], repeated: 0 });
});
