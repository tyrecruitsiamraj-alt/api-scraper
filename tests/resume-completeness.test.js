import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isResumeBodyComplete,
  isResumeDeliveryComplete,
  resumeBodyGaps,
  resumeContactGaps,
} from '../src/core/resume-completeness.js';

function completeBody(overrides = {}) {
  return {
    name: 'นายทดสอบ ครบ',
    gender: 'ชาย',
    age: '28',
    address: 'นนทบุรี',
    province: 'นนทบุรี',
    education: [{ institution: 'มหาวิทยาลัยตัวอย่าง', degree: 'ปริญญาตรี' }],
    work_experience: [{ company: 'บริษัท เอ', position: 'พนักงานขับรถ' }],
    phone: '0812345678',
    email: 'ok@example.com',
    ...overrides,
  };
}

test('resumeBodyGaps lists every missing required body field', () => {
  const gaps = resumeBodyGaps({ name: '', education: [], work_experience: [] });
  assert.ok(gaps.includes('name'));
  assert.ok(gaps.includes('gender'));
  assert.ok(gaps.includes('age'));
  assert.ok(gaps.includes('address'));
  assert.ok(gaps.includes('education'));
  assert.ok(gaps.includes('work_experience'));
});

test('year-only work stubs are incomplete', () => {
  const gaps = resumeBodyGaps(completeBody({
    work_experience: [{ year: '2022', company: '', position: '' }],
  }));
  assert.ok(gaps.includes('work_experience'));
  assert.equal(isResumeBodyComplete(completeBody({
    work_experience: [{ year: '2022', company: '', position: '' }],
  })), false);
});

test('ไม่มีประสบการณ์ counts as complete work', () => {
  assert.equal(isResumeBodyComplete(completeBody({
    work_experience: [{ position: 'ไม่มีประสบการณ์', company: '' }],
  })), true);
});

test('complete body without contact is body-complete but not delivery-complete', () => {
  const row = completeBody({ phone: '', email: '' });
  assert.equal(isResumeBodyComplete(row), true);
  assert.deepEqual(resumeContactGaps(row), ['contact']);
  assert.equal(isResumeDeliveryComplete(row), false);
});

test('fully filled resume is delivery-complete', () => {
  assert.equal(isResumeDeliveryComplete(completeBody()), true);
});
