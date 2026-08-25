import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMarketResearch, buildResearchSeeds, isJobSearchQuery, parseEngagementText, parseGoogleSuggestResponse } from '../src/core/market-research.js';

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

test('ขยายคำค้นของหัวหน้าไซด์ไปยังคำที่คนหางานภูมิทัศน์ใช้', () => {
  const seeds = buildResearchSeeds({ position: 'หัวหน้าไซด์', roleEvidence: 'Landscape Management งานดูแลสวน' });
  assert.ok(seeds.includes('หางานภูมิทัศน์'));
  assert.ok(seeds.includes('งาน หัวหน้าคนสวน'));
  assert.equal(seeds.some((item) => item.includes('พนักงานขับรถ')), false);
});

test('ไม่มีหลักฐาน Facebook ต้องหยุดก่อนคิด Caption และรูป', () => {
  const gate = assessMarketResearch({ evidence: [{ source_type: 'google_trends' }] });
  assert.equal(gate.ready, false);
  assert.equal(gate.googleEvidence, 1);
  assert.equal(gate.facebookEvidence, 0);
});

test('ตรวจครบทุกกลุ่มแล้วไม่พบโพสต์ตรงตำแหน่ง เป็น market gap ไม่ใช่ system failure', () => {
  const gate = assessMarketResearch({
    evidence: [{ source_type: 'google_trends' }],
    facebookCoverageComplete: true,
    facebookScannedGroups: 42,
  });
  assert.equal(gate.ready, true);
  assert.equal(gate.facebookEvidence, 0);
  assert.equal(gate.facebookMarketGap, true);
  assert.equal(gate.facebookScannedGroups, 42);
});

test('โหมด Preview ใช้หลักฐาน Google อย่างเดียวได้โดยไม่ผ่อนกฎ Production', () => {
  const evidence = [{ source_type: 'google_trends' }];
  assert.equal(assessMarketResearch({ evidence }, { requireFacebook: false }).ready, true);
  assert.equal(assessMarketResearch({ evidence }, { requireFacebook: true }).ready, false);
});

test('ผ่าน Research Gate เมื่อมี Google และ Facebook ที่ตรวจย้อนกลับได้', () => {
  const gate = assessMarketResearch({ evidence: [
    { source_type: 'google_trends' },
    { source_type: 'facebook_post', reactions: 10, comments: 2, shares: 1 },
  ] });
  assert.equal(gate.ready, true);
});

test('รับเฉพาะคำแนะนำที่มีเจตนาหางาน ไม่รับคำแปลหรือความรู้ทั่วไป', () => {
  assert.equal(isJobSearchQuery('หางานภูมิทัศน์ ชลบุรี'), true);
  assert.equal(isJobSearchQuery('สมัครงาน landscape'), true);
  assert.equal(isJobSearchQuery('งาน หัวหน้า คน สวน'), true);
  assert.equal(isJobSearchQuery('ภูมิทัศน์ แปลว่า'), false);
  assert.equal(isJobSearchQuery('ภูมิทัศน์วัฒนธรรม'), false);
  assert.equal(isJobSearchQuery('งาน ภูมิ ทัศน์ คือ'), false);
});
