import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDuplicateCandidates, phoneKey, emailKey } from '../src/core/candidate-duplicates.js';

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
