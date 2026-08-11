import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPerformanceInsight,
  learningFeatures,
  patternDecision,
  postingSlot,
} from '../src/core/content-second-brain.js';

test('จัดช่วงเวลาโพสต์ตามเวลาไทย', () => {
  assert.equal(postingSlot('2026-08-11T01:30:00.000Z'), 'Tue เช้า 05:00-09:59');
  assert.equal(postingSlot('2026-08-11T12:30:00.000Z'), 'Tue เย็น 18:00-21:59');
});

test('ดึงแนวข้อความและสไตล์ภาพจากหลักฐานการสร้าง', () => {
  assert.deepEqual(learningFeatures({
    generationNotes: { style: 'เน้นรายได้', imageStyle: 'ภาพพนักงานขับรถจริง' },
    postedAt: '2026-08-11T01:30:00.000Z',
  }), {
    captionStyle: 'เน้นรายได้',
    imageStyle: 'ภาพพนักงานขับรถจริง',
    postingSlot: 'Tue เช้า 05:00-09:59',
  });
});

test('ยังไม่สรุปผลจากตัวอย่างเดียวและยืนยันเมื่อครบสามแคมเปญ', () => {
  assert.equal(patternDecision({ campaign_count: 1, avg_engagement_score: 20 }), 'collecting');
  assert.equal(patternDecision({ campaign_count: 3, avg_engagement_score: 7 }), 'preferred');
  assert.equal(patternDecision({ campaign_count: 3, avg_engagement_score: 2 }), 'avoid');
});

test('อธิบายบทเรียนด้วยภาษาคนและจำนวนหลักฐาน', () => {
  const text = formatPerformanceInsight({
    pattern_type: 'image_style', pattern_value: 'ภาพหน้างานจริง',
    avg_engagement_score: 6.25, campaign_count: 3, post_count: 8,
  }, 'preferred');
  assert.match(text, /สไตล์ภาพ/);
  assert.match(text, /3 แคมเปญ \/ 8 โพสต์/);
});
