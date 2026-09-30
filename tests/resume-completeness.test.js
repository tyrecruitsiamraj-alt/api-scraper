import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isResumeAttachmentsComplete,
  isResumeBodyComplete,
  isResumeDeliveryComplete,
  resumeAttachmentGaps,
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
    attachments: [{ title: 'resume.pdf', source_url: 'https://www.jobbkk.com/resumes/download_attach/1' }],
    profile_image_url: 'https://www.jobbkk.com/img/profile.jpg',
    ...overrides,
  };
}

function okAssets() {
  return [
    {
      kind: 'attachment',
      download_status: 'success',
      byte_size: 1200,
      content: Buffer.from('pdf'),
    },
    {
      kind: 'profile',
      download_status: 'success',
      byte_size: 800,
      content: Buffer.from('jpg'),
    },
  ];
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
  assert.equal(isResumeDeliveryComplete(row, okAssets()), false);
});

test('missing attachments are incomplete', () => {
  const gaps = resumeAttachmentGaps(completeBody({ attachments: [] }), []);
  assert.ok(gaps.includes('attachments_missing'));
  assert.equal(isResumeAttachmentsComplete(completeBody({ attachments: [] }), []), false);
});

test('partial attachment downloads are incomplete', () => {
  const row = completeBody({
    attachments: [
      { title: 'a.pdf', source_url: 'https://www.jobbkk.com/a' },
      { title: 'b.pdf', source_url: 'https://www.jobbkk.com/b' },
    ],
  });
  const assets = [{
    kind: 'attachment', download_status: 'success', byte_size: 100, content: Buffer.from('a'),
  }];
  assert.ok(resumeAttachmentGaps(row, assets).includes('attachments_incomplete'));
});

test('failed profile download is incomplete when profile url exists', () => {
  const gaps = resumeAttachmentGaps(completeBody(), [{
    kind: 'attachment', download_status: 'success', byte_size: 100, content: Buffer.from('a'),
  }]);
  assert.ok(gaps.includes('profile'));
});

test('JobThai without file links only requires profile binary', () => {
  const row = completeBody({ attachments: [], platform: 'jobthai' });
  assert.deepEqual(resumeAttachmentGaps(row, [], { platform: 'jobthai' }), ['profile']);
  assert.equal(isResumeAttachmentsComplete(row, [{
    kind: 'profile', download_status: 'success', byte_size: 50, content: Buffer.from('x'),
  }], { platform: 'jobthai' }), true);
});

test('fully filled resume with attachments is delivery-complete', () => {
  assert.equal(isResumeDeliveryComplete(completeBody(), okAssets()), true);
});
