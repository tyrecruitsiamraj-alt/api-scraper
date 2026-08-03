import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecruitContent } from '../src/core/content-factual-validator.js';

const driverCampaign = {
  title: 'พนักงานขับรถส่วนกลาง',
  positions: 'พนักงานขับรถส่วนกลาง',
  province: 'กรุงเทพมหานคร',
  qty: 2,
  snapshot: {
    income: 'เงินเดือน 15,000 บาท',
    work_schedule: 'จันทร์-ศุกร์ 08.30-17.30 น.',
    education: 'ม.3 ขึ้นไป',
  },
};

test('accepts facts grounded in the requisition', () => {
  const result = validateRecruitContent({
    campaign: driverCampaign,
    caption: 'เปิดรับสมัคร พนักงานขับรถส่วนกลาง 2 อัตรา ทำงานกรุงเทพมหานคร เงินเดือน 15,000 บาท',
    poster: {
      title: 'พนักงานขับรถส่วนกลาง',
      badge: 'เปิดรับสมัคร',
      location: 'กรุงเทพมหานคร',
      worktime: 'จันทร์-ศุกร์ 08.30-17.30 น.',
      salaryTotal: '15,000 บาท',
      salaryBreakdown: 'เงินเดือน 15,000 บาท',
      qualifications: ['ม.3 ขึ้นไป'],
      benefits: [],
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.poster_validated, true);
  assert.deepEqual(result.errors, []);
});

test('rejects a role inferred from the workplace', () => {
  const result = validateRecruitContent({
    campaign: {
      ...driverCampaign,
      snapshot: { ...driverCampaign.snapshot, site_name: 'โรงพยาบาลตัวอย่าง' },
    },
    caption: 'เปิดรับสมัคร พนักงานประชาสัมพันธ์ ประจำโรงพยาบาลตัวอย่าง',
    poster: {
      title: 'พนักงานประชาสัมพันธ์',
      badge: 'เปิดรับสมัคร',
      qualifications: [],
      benefits: [],
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'position_not_in_caption'));
  assert.ok(result.errors.some((e) => e.code === 'poster_position_mismatch'));
});

test('rejects unsupported urgency, benefit and salary', () => {
  const result = validateRecruitContent({
    campaign: driverCampaign,
    caption: 'ด่วน! พนักงานขับรถส่วนกลาง เงินเดือน 25,000 บาท มีโบนัส',
    poster: {
      title: 'พนักงานขับรถส่วนกลาง',
      badge: 'รับสมัครด่วน',
      salaryTotal: '25,000 บาท',
      qualifications: [],
      benefits: ['ประกันสุขภาพ'],
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'unsupported_number'));
  assert.ok(result.errors.some((e) => e.code === 'unsupported_claim'));
  assert.ok(result.errors.some((e) => e.code === 'unsupported_benefit'));
});

test('binds an approval check to the exact normalized caption', () => {
  const first = validateRecruitContent({
    campaign: driverCampaign,
    caption: 'เปิดรับสมัคร  พนักงานขับรถส่วนกลาง 2 อัตรา',
  });
  assert.equal(first.poster_validated, false);
  const normalizedSame = validateRecruitContent({
    campaign: driverCampaign,
    caption: 'เปิดรับสมัคร พนักงานขับรถส่วนกลาง 2 อัตรา',
  });
  const changed = validateRecruitContent({
    campaign: driverCampaign,
    caption: 'เปิดรับสมัคร พนักงานขับรถส่วนกลาง 2 อัตรา เงินเดือน 25,000 บาท',
  });
  assert.equal(first.content_hash, normalizedSame.content_hash);
  assert.notEqual(first.content_hash, changed.content_hash);
  assert.equal(changed.valid, false);
});
