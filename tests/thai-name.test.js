import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyThaiNameSplit,
  isKnownNamePrefix,
  namePrefixNeedsFix,
  splitThaiFullName,
} from '../src/core/thai-name.js';

test('splitThaiFullName keeps spaced titles', () => {
  assert.deepEqual(splitThaiFullName('นาย สมชาย ใจดี'), {
    prefix: 'นาย',
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    name: 'นาย สมชาย ใจดี',
  });
  assert.deepEqual(splitThaiFullName('นางสาว สมใจ ดีมาก'), {
    prefix: 'นางสาว',
    first_name: 'สมใจ',
    last_name: 'ดีมาก',
    name: 'นางสาว สมใจ ดีมาก',
  });
});

test('splitThaiFullName peels glued titles without eating the given name', () => {
  assert.deepEqual(splitThaiFullName('นายสมชาย ใจดี'), {
    prefix: 'นาย',
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    name: 'นาย สมชาย ใจดี',
  });
  assert.deepEqual(splitThaiFullName('นางสาวสมใจ ดีมาก'), {
    prefix: 'นางสาว',
    first_name: 'สมใจ',
    last_name: 'ดีมาก',
    name: 'นางสาว สมใจ ดีมาก',
  });
});

test('splitThaiFullName does not strip short glued remainders like นายก', () => {
  const split = splitThaiFullName('นายก ใจดี');
  assert.equal(split.prefix, '');
  assert.equal(split.first_name, 'นายก');
  assert.equal(split.last_name, 'ใจดี');
});

test('namePrefixNeedsFix detects blank and mangled titles', () => {
  assert.equal(namePrefixNeedsFix({ full_name: 'นาย สมชาย ใจดี', prefix: '' }), true);
  assert.equal(namePrefixNeedsFix({
    full_name: 'นายสมชาย ใจดี',
    prefix: 'นายสมชาย',
    first_name: 'ใจดี',
  }), true);
  assert.equal(namePrefixNeedsFix({
    full_name: 'นาย สมชาย ใจดี',
    prefix: 'นาย',
    first_name: 'สมชาย',
    last_name: 'ใจดี',
  }), false);
  assert.equal(isKnownNamePrefix('นาย'), true);
  assert.equal(isKnownNamePrefix('นายสมชาย'), false);
});

test('applyThaiNameSplit repairs mangled JobBKK-style rows', () => {
  const row = {
    name: 'นายสมชาย ใจดี',
    prefix: 'นายสมชาย',
    first_name: 'ใจดี',
    last_name: '',
  };
  applyThaiNameSplit(row);
  assert.equal(row.prefix, 'นาย');
  assert.equal(row.first_name, 'สมชาย');
  assert.equal(row.last_name, 'ใจดี');
  assert.equal(row.name, 'นาย สมชาย ใจดี');
});
