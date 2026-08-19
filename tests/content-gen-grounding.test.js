import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedCaption } from '../src/core/content-gen.js';
import { evaluateContentQuality } from '../src/core/content-quality.js';

const campaign = {
  title: 'หัวหน้าไซด์',
  province: 'โรงงานคูโบต้า นวนคร',
  qty: 1,
  request_snapshot: {
    position: 'หัวหน้าไซด์',
    location: 'โรงงานคูโบต้า นวนคร',
    qty: 1,
    income: '15000',
    work_schedule: 'จันทร์ - ศุกร์ 7.00 - 17.00 น.',
    gender: 'O',
    age_min: 20,
    age_max: 55,
    job_family: 'Landscape Management',
    job_description: 'ควบคุมทีมดูแลสวนและพื้นที่สีเขียว\nตรวจสอบคุณภาพงานประจำวัน',
  },
};

test('Caption สำรองใช้เฉพาะข้อเท็จจริง ERP และผ่าน factual gate', () => {
  const caption = buildGroundedCaption(campaign);
  assert.match(caption, /หัวหน้าไซด์/);
  assert.match(caption, /โรงงานคูโบต้า นวนคร/);
  assert.match(caption, /15,000 บาท/);
  assert.match(caption, /ควบคุมทีมดูแลสวนและพื้นที่สีเขียว/);
  assert.match(caption, /ตรวจสอบคุณภาพงานประจำวัน/);
  assert.doesNotMatch(caption, /รายได้ดี|งานมั่นคง|สวัสดิการครบ|แอดไลน์|โทร/);
  const quality = evaluateContentQuality({
    campaign,
    caption,
    researchGate: { ready: true, googleEvidence: 2, facebookEvidence: 1, issues: [] },
  });
  assert.equal(quality.blocking, false);
});

test('Caption ไม่เอา metadata ที่ ERP รวมมาแสดงเป็นหน้าที่หลัก', () => {
  const mixedMetadata = {
    ...campaign,
    request_snapshot: {
      ...campaign.request_snapshot,
      location: 'โรงงารคูโบต้า นวนคร',
      job_description: 'รายได้รวม 15000 · เวลางาน จันทร์ - ศุกร์ • 7.00 - 17.00 น. · เพศ O · อายุ 20-55 ปี · หน่วยงาน บริษัท สยามคูโบต้าคอร์ปอเรชั่น จำกัด',
    },
  };
  const caption = buildGroundedCaption(mixedMetadata);
  assert.match(caption, /โรงงานคูโบต้า นวนคร/);
  assert.doesNotMatch(caption, /หน้าที่หลัก/);
  assert.doesNotMatch(caption, /เพศ O|หน่วยงาน บริษัท/);
});

test('Caption ใส่เบอร์เฉพาะเมื่อมีอยู่ในข้อมูลต้นทาง', () => {
  const withPhone = {
    ...campaign,
    request_snapshot: { ...campaign.request_snapshot, contact_phone: '02-123-4567' },
  };
  assert.match(buildGroundedCaption(withPhone), /📞 ติดต่อ: 02-123-4567/);
  assert.doesNotMatch(buildGroundedCaption(campaign), /📞 ติดต่อ:/);
});
