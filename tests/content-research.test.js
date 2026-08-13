import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeResearchForRole } from '../src/core/content-research.js';

test('ตัดคำแนะนำภาพที่เป็นอาชีพอื่นออกจาก research', () => {
  const result = sanitizeResearchForRole({
    angles: ['เน้นดูแลทีมงานสวน', 'ขับรถส่งของเริ่มงานทันที'],
    hooks: ['หัวหน้าไซต์งานภูมิทัศน์', 'สมัครพนักงานขับรถ'],
    imageStyles: ['หัวหน้าไซต์ถือแผนงานกลางสวน', 'driver beside a truck'],
  }, 'หัวหน้าไซต์งานภูมิทัศน์');
  assert.deepEqual(result.angles, ['เน้นดูแลทีมงานสวน']);
  assert.deepEqual(result.hooks, ['หัวหน้าไซต์งานภูมิทัศน์']);
  assert.equal(result.imageStyle, 'หัวหน้าไซต์ถือแผนงานกลางสวน');
});
