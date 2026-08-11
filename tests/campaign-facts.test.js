import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTrustedPosterFacts, extractCampaignFacts, preflightCampaign, visualBriefFromFacts } from '../src/core/campaign-facts.js';

const driverCampaign = {
  title: 'พนักงาน',
  province: 'โรงพยาบาลกรุงเทพดุสิต',
  qty: 1,
  request_snapshot: {
    position: 'พนักงาน',
    department: 'Labor Contract - Driver',
    location: 'โรงพยาบาลกรุงเทพดุสิต ถนนเพชรบุรี',
    income: '12000',
    work_schedule: 'ทำงาน 10 ชั่วโมง มี OT',
  },
};

test('แปลชื่อตำแหน่งกว้างจากเงื่อนไข ERP ที่ระบุบทบาทชัด', () => {
  const facts = extractCampaignFacts(driverCampaign);
  assert.equal(facts.position, 'พนักงานขับรถ');
  assert.equal(facts.positionWasInferred, true);
  assert.equal(preflightCampaign(driverCampaign).ready, true);
  assert.match(visualBriefFromFacts(facts), /พนักงานขับรถ/);
  assert.match(visualBriefFromFacts(facts), /Driver/);
});

test('ล็อกข้อมูลบนโปสเตอร์ให้ใช้ ERP แม้โมเดลส่งตัวเลขหรืออาชีพผิด', () => {
  const poster = applyTrustedPosterFacts({
    title: 'พยาบาล', location: 'โรงพยาบาล', worktime: '08.00-17.00', salaryTotal: '120', salaryBreakdown: '120',
  }, driverCampaign);
  assert.equal(poster.title, 'พนักงานขับรถ');
  assert.equal(poster.location, 'โรงพยาบาลกรุงเทพดุสิต ถนนเพชรบุรี');
  assert.equal(poster.worktime, 'ทำงาน 10 ชั่วโมง มี OT');
  assert.equal(poster.salaryTotal, '12,000');
  assert.equal(poster.salaryBreakdown, '12000');
});

test('หยุดงานก่อนสร้างเมื่อ ERP ขาดข้อมูลสำคัญ', () => {
  const result = preflightCampaign({ title: 'พนักงาน', request_snapshot: { position: 'พนักงาน' } });
  assert.equal(result.ready, false);
  assert.deepEqual(result.issues, [
    'ต้องระบุตำแหน่งงานให้ชัดเจน',
    'ต้องระบุสถานที่ทำงาน',
    'ต้องระบุรายได้ หรือยืนยันว่าไม่เปิดเผยรายได้',
  ]);
});

test('งานที่ยืนยันว่าไม่เปิดเผยรายได้เดินต่อได้โดยไม่แต่งตัวเลข', () => {
  const campaign = { ...driverCampaign, request_snapshot: { ...driverCampaign.request_snapshot, income: '', income_disclosure: 'ไม่เปิดเผยรายได้' } };
  assert.equal(preflightCampaign(campaign).ready, true);
  assert.equal(applyTrustedPosterFacts({ salaryTotal: '20000' }, campaign).salaryTotal, '');
});
