import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDuplicateCandidates, phoneKey, emailKey, nameKey } from '../src/core/candidate-duplicates.js';

test('phone matches on last 9 digits, email ignores example.com', () => {
  assert.equal(phoneKey('0812345678'), phoneKey('66812345678'));
  assert.equal(phoneKey('12345'), '');
  assert.equal(emailKey('A@Example.com'), '');
  assert.equal(emailKey('Somchai@Gmail.com'), 'somchai@gmail.com');
});

test('same phone or same email join one group; newest row leads', () => {
  const rows = [
    { id: 'a', phone_norm: '0811111111', email_norm: 'x@gmail.com', last_updated_at: '2026-10-01' },
    { id: 'b', phone_norm: '66811111111', email_norm: '', last_updated_at: '2026-10-05' },
    { id: 'c', phone_norm: '0822222222', email_norm: 'x@gmail.com', last_updated_at: '2026-09-01' },
    { id: 'd', phone_norm: '0833333333', email_norm: 'd@gmail.com', last_updated_at: '2026-10-09' },
  ];
  const { leaderOf, membersOf, hiddenIds } = groupDuplicateCandidates(rows);
  assert.equal(leaderOf.get('a'), 'b');
  assert.equal(leaderOf.get('c'), 'b');
  assert.deepEqual(membersOf.get('b'), ['b', 'a', 'c']);
  assert.deepEqual(hiddenIds.sort(), ['a', 'c']);
  assert.equal(leaderOf.has('d'), false);
});

test('a value shared by many rows (call center number) does not merge people', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, phone_norm: '020000000', email_norm: `p${i}@gmail.com`, last_updated_at: null }));
  const { hiddenIds, membersOf } = groupDuplicateCandidates(rows);
  assert.equal(hiddenIds.length, 0);
  assert.equal(membersOf.size, 0);
});

// 23 พ.ย. 2569: แถวที่ไม่มีแหล่งที่มา 282 แถว ส่วนใหญ่เป็นแถวค้างของคนที่มีอยู่แล้ว ไม่มีเบอร์ให้จับคู่
test('a row with no source joins the one sourced row with the same name; the sourced row leads', () => {
  const rows = [
    { id: 'old', full_name: 'นายชุมพล กั้วอำไพ', has_source: false, last_updated_at: '2026-11-23' },
    { id: 'real', full_name: 'ชุมพล  กั้วอำไพ', has_source: true, phone_norm: '0812223333', last_updated_at: '2026-11-01' },
  ];
  const { leaderOf, hiddenIds } = groupDuplicateCandidates(rows);
  assert.equal(leaderOf.get('old'), 'real');
  assert.deepEqual(hiddenIds, ['old']);
});

test('name alone never joins two sourced rows, two sourced namesakes, a first name only, or different phones', () => {
  const rows = [
    { id: 's1', full_name: 'สมชาย ใจดี', has_source: true },
    { id: 's2', full_name: 'นาย สมชาย ใจดี', has_source: true },
    { id: 'o1', full_name: 'สมชาย ใจดี', has_source: false },
    { id: 's3', full_name: 'มานี มีนา', has_source: true, phone_norm: '0811111111' },
    { id: 'o2', full_name: 'มานี มีนา', has_source: false, phone_norm: '0899999999' },
    { id: 's4', full_name: 'ปิติ', has_source: true },
    { id: 'o3', full_name: 'ปิติ', has_source: false },
  ];
  assert.deepEqual(groupDuplicateCandidates(rows).hiddenIds, []);
  assert.equal(nameKey('ปิติ'), '');
  assert.equal(nameKey('น.ส. มานี  มีนา'), nameKey('มานี มีนา'));
});

test('rows without has_source keep the old rule (newest leads)', () => {
  const rows = [
    { id: 'a', phone_norm: '0811111111', last_updated_at: '2026-10-01' },
    { id: 'b', phone_norm: '0811111111', last_updated_at: '2026-10-05' },
  ];
  assert.equal(groupDuplicateCandidates(rows).leaderOf.get('a'), 'b');
});
