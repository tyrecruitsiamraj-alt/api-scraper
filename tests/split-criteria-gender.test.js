import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCriteria } from '../src/core/candidate-match.js';

test('JobBKK: ส่งเพศไปกรองที่เว็บด้วย และยังกรองซ้ำในระบบ', () => {
  const r = splitCriteria({ position: 'ผู้ประสานงาน', gender: 'ชาย', education: 'ปวช.' }, { siteGender: true });
  assert.equal(r.siteCriteria.gender, 'ชาย');
  assert.equal(r.localFilters.gender, 'ชาย');
  assert.equal(r.siteCriteria.education, undefined);
});

test('เว็บอื่น: เพศกรองในระบบอย่างเดียวเหมือนเดิม', () => {
  const r = splitCriteria({ position: 'ผู้ประสานงาน', gender: 'ชาย' });
  assert.equal(r.siteCriteria.gender, undefined);
  assert.equal(r.localFilters.gender, 'ชาย');
});
