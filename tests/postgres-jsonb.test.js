import test from 'node:test';
import assert from 'node:assert/strict';
import { stringifyForJsonb } from '../src/db/repositories.js';

test('candidate JSON removes Unicode NUL values rejected by PostgreSQL jsonb', () => {
  const encoded = stringifyForJsonb([{ school: 'มหาวิทยาลัย\u0000ทดสอบ' }]);
  assert.equal(encoded.includes('\\u0000'), false);
  assert.deepEqual(JSON.parse(encoded), [{ school: 'มหาวิทยาลัยทดสอบ' }]);
});

test('missing candidate arrays are stored as empty JSON arrays', () => {
  assert.equal(stringifyForJsonb(undefined), '[]');
});

test('qualification reasons remain a JSON array instead of a PostgreSQL array literal', () => {
  const encoded = stringifyForJsonb(['location_mismatch', 'education_below_minimum']);
  assert.deepEqual(JSON.parse(encoded), ['location_mismatch', 'education_below_minimum']);
  assert.equal(encoded.startsWith('['), true);
});
