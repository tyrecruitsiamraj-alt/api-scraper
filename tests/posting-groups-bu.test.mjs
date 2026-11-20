import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 20 พ.ย. 2569: คลังเกิน 200 กลุ่มแล้วหัวก้อน LBD/LBA/LM พร้อมจำนวนกลุ่มหายทั้งหมด
test('หัวก้อนธุรกิจพร้อมจำนวนกลุ่มขึ้นเสมอ จำกัดแค่รายการข้างในก้อน', () => {
  const src = fs.readFileSync(new URL('../web/components/PostingGroupsManager.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /mustNarrow/);
  assert.match(src, /groupByBusinessUnit\(visible, \(g\) => g\.department\)/);
  assert.match(src, /bu\.items\.slice\(0, MAX_ROWS\)/);
  const page = fs.readFileSync(new URL('../web/app/(app)/settings/posting/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.indexOf('<PostingGroupsManager') < page.indexOf('<AccountGroupCoverage'), 'คลังกลุ่มอยู่ก่อนตารางบัญชี');
});
