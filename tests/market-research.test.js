import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEngagementText, parseGoogleSuggestResponse } from '../src/core/market-research.js';

test('อ่านคำแนะนำการค้นหาภาษาไทยจาก Google response', () => {
  const result = parseGoogleSuggestResponse('["พนักงานขับรถ",["งานขับรถผู้บริหาร","สมัครงานขับรถ","หางานคนขับรถ"]]');
  assert.deepEqual(result, ['งานขับรถผู้บริหาร', 'สมัครงานขับรถ', 'หางานคนขับรถ']);
});

test('อ่านยอด engagement ภาษาไทยและหน่วยย่อจากข้อความ Facebook', () => {
  assert.deepEqual(parseEngagementText('ถูกใจ 1.2K ความคิดเห็น 35 แชร์ 8'), {
    reactions: 1200, comments: 35, shares: 8,
  });
});

test('ข้อมูลที่อ่านไม่พบให้เป็นศูนย์โดยไม่เดา', () => {
  assert.deepEqual(parseEngagementText('เปิดรับสมัครพนักงานขับรถ'), {
    reactions: 0, comments: 0, shares: 0,
  });
});
