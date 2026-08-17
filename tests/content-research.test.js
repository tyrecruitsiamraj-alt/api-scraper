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

test('ตัดคำแนะนำให้ AI วาดข้อความหรือเบอร์โทรออกจากสไตล์ภาพ', () => {
  const result = sanitizeResearchForRole({
    angles: ['เน้นรายได้ที่ยืนยันแล้ว'],
    hooks: ['เปิดรับหัวหน้าไซต์'],
    imageStyles: [
      "ภาพกราฟิกพร้อมคำว่า 'สมัครเลย' และเบอร์โทรชัดเจน",
      'หัวหน้าไซต์ถือแผนงานสวนในพื้นที่กลางแจ้ง',
    ],
  }, 'หัวหน้าไซด์');
  assert.equal(result.imageStyle, 'หัวหน้าไซต์ถือแผนงานสวนในพื้นที่กลางแจ้ง');
  assert.doesNotMatch(result.imageStyle, /สมัครเลย|เบอร์โทร/);
});

test('ตัดฮุกที่ยกข้อมูลติดต่อ รายได้ และเงื่อนไขจากโพสต์อื่น', () => {
  const result = sanitizeResearchForRole({
    angles: ['สื่อบทบาทคุมทีมงานสวน', 'รายได้ 20,000++ พร้อม OT'],
    hooks: ['หัวหน้าไซด์ที่ชอบทำงานกลางแจ้ง', 'โทร 012-345-6789 รู้ผลทันที'],
    imageStyles: ['หัวหน้าไซต์ตรวจแผนงานในสวน'],
  }, 'หัวหน้าไซด์');
  assert.deepEqual(result.angles, ['สื่อบทบาทคุมทีมงานสวน']);
  assert.deepEqual(result.hooks, ['หัวหน้าไซด์ที่ชอบทำงานกลางแจ้ง']);
});
