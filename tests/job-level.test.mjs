import test from 'node:test';
import assert from 'node:assert/strict';
import { keepLevelTerms } from '../src/core/job-family.js';

// 16 พ.ย. 2569 LMO6911012: หน้าที่คุมทีมพนักงานดูแลสวน — เจ้าของ "ค้นหาคนสวน ต่อให้เจอก็ไม่ตอบโจทย์"
test('งานระดับหัวหน้า: เก็บเฉพาะคำค้นตำแหน่งคุมคน', () => {
  const terms = ['หัวหน้าคนสวน', 'หัวหน้างานสวน', 'ผู้ควบคุมงานสวน', 'โฟร์แมน', 'ซุปเปอร์ไวเซอร์', 'พนักงานดูแลสวน', 'คนสวน', 'ช่างจัดสวน'];
  assert.deepEqual(keepLevelTerms(terms, 'supervisor'), ['หัวหน้าคนสวน', 'หัวหน้างานสวน', 'ผู้ควบคุมงานสวน', 'โฟร์แมน', 'ซุปเปอร์ไวเซอร์']);
  assert.deepEqual(keepLevelTerms(['คนสวน'], 'supervisor'), [], 'คำจาก Trends/คำที่เคยได้คนเยอะ ระดับพนักงาน ไม่ถูกเติม');
});

test('งานระดับพนักงาน หรือไม่รู้ระดับ: ไม่ตัดอะไร', () => {
  assert.deepEqual(keepLevelTerms(['คนสวน', 'หัวหน้าคนสวน'], 'staff'), ['คนสวน', 'หัวหน้าคนสวน']);
  assert.deepEqual(keepLevelTerms(['คนสวน'], undefined), ['คนสวน']);
});
