import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEngagement } from '../src/core/orchestrator-measure.js';

test('คะแนนให้ความสำคัญกับผู้สนใจและหารด้วยจำนวนกลุ่ม', () => {
  const oneGroup = calculateEngagement({
    comments: 2, leads: 1, shares: 1, likes: 10,
    sampleSize: 1, highScore: 5, leadWeight: 5, mature: true,
  });
  const twoGroups = calculateEngagement({
    comments: 2, leads: 1, shares: 1, likes: 10,
    sampleSize: 2, highScore: 5, leadWeight: 5, mature: true,
  });
  assert.equal(oneGroup.score, 10);
  assert.equal(oneGroup.verdict, 'high');
  assert.equal(twoGroups.score, 5);
});

test('ยังไม่ตัดสินแพ้ก่อนครบเวลารอเก็บผล', () => {
  const result = calculateEngagement({
    comments: 0, leads: 0, shares: 0, likes: 0,
    sampleSize: 1, highScore: 5, leadWeight: 5, mature: false,
  });
  assert.equal(result.score, 0);
  assert.equal(result.verdict, 'pending');
});
