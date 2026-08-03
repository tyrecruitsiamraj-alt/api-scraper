import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreRecruitContent } from '../src/core/content-quality-score.js';

const campaign = {
  title: 'พนักงานขับรถ',
  positions: 'พนักงานขับรถ',
  province: 'กรุงเทพมหานคร',
  qty: 3,
  snapshot: { location: 'กรุงเทพมหานคร' },
};
const jobSpec = { position: 'พนักงานขับรถ', family: 'driver' };
const poster = {
  title: 'พนักงานขับรถ',
  qualifications: ['มีใบขับขี่', 'มีความรับผิดชอบ'],
  benefits: ['รายได้ตามโครงสร้างบริษัท'],
};
const validation = {
  valid: true,
  poster_validated: true,
  errors: [],
  evidence_hash: 'evidence-1',
};

test('complete recruit content passes the deterministic quality gate', () => {
  const result = scoreRecruitContent({
    campaign,
    jobSpec,
    poster,
    factualValidation: validation,
    hasImage: true,
    caption: `รับสมัคร พนักงานขับรถ 3 อัตรา\nพื้นที่ กรุงเทพมหานคร\nสนใจสมัคร ทักทีมสรรหาได้เลย\n#งานขับรถ #สมัครงาน`,
  });
  assert.equal(result.hard_gate_passed, true);
  assert.ok(result.overall_score >= 70);
});

test('caption for a different role is blocked even when it looks complete', () => {
  const result = scoreRecruitContent({
    campaign,
    jobSpec,
    poster,
    factualValidation: validation,
    hasImage: true,
    caption: `รับสมัคร ประชาสัมพันธ์ 3 อัตรา\nพื้นที่ กรุงเทพมหานคร\nสนใจสมัคร ทักทีมสรรหาได้เลย\n#สมัครงาน #หางาน`,
  });
  assert.equal(result.hard_gate_passed, false);
  assert.ok(result.blockers.includes('caption_missing_resolved_position'));
});

test('poster position mismatch is a hard blocker', () => {
  const result = scoreRecruitContent({
    campaign,
    jobSpec,
    poster: { ...poster, title: 'ประชาสัมพันธ์' },
    factualValidation: validation,
    hasImage: true,
    caption: `รับสมัคร พนักงานขับรถ 3 อัตรา\nพื้นที่ กรุงเทพมหานคร\nสนใจสมัคร ทักทีมสรรหาได้เลย\n#งานขับรถ #สมัครงาน`,
  });
  assert.equal(result.hard_gate_passed, false);
  assert.ok(result.blockers.includes('poster_position_mismatch'));
});

test('missing factual poster validation cannot reach approval', () => {
  const result = scoreRecruitContent({
    campaign,
    jobSpec,
    poster,
    factualValidation: { valid: true, poster_validated: false, errors: [] },
    hasImage: true,
    caption: `รับสมัคร พนักงานขับรถ 3 อัตรา\nพื้นที่ กรุงเทพมหานคร\nสนใจสมัคร ทักทีมสรรหาได้เลย\n#งานขับรถ #สมัครงาน`,
  });
  assert.equal(result.hard_gate_passed, false);
  assert.ok(result.blockers.includes('poster_not_validated'));
});
