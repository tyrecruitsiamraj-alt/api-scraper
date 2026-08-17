import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContentQuality } from '../src/core/content-quality.js';

const campaign = {
  title: 'พนักงานขับรถผู้บริหาร',
  province: 'กรุงเทพมหานคร เขตห้วยขวาง',
  qty: 2,
  request_snapshot: {
    position: 'พนักงานขับรถผู้บริหาร',
    location: 'กรุงเทพมหานคร เขตห้วยขวาง',
    qty: 2,
    income: 'รายได้รวม 18,000 บาท',
    work_schedule: 'วันจันทร์ - วันศุกร์ เวลา 08.00-17.00 น.',
    gender: 'ชาย',
    age_min: 25,
    age_max: 45,
  },
};

const goodCaption = `🚗 เปิดรับสมัคร พนักงานขับรถผู้บริหาร
สถานที่ทำงาน กรุงเทพมหานคร เขตห้วยขวาง
รับ 2 อัตรา
รายได้รวม 18,000 บาท
ทำงานวันจันทร์ - วันศุกร์ เวลา 08.00-17.00 น.
เพศชาย อายุ 25-45 ปี
สนใจทักแชทได้เลย #สมัครงาน #งานขับรถ`;

test('ประกาศที่ข้อมูลตรงใบขอผ่านด่านตรวจ', () => {
  const result = evaluateContentQuality({ campaign, caption: goodCaption, imageReady: true });
  assert.equal(result.blocking, false);
  assert.ok(['pass', 'warning'].includes(result.status));
  assert.equal(result.checks.filter((item) => item.status === 'fail').length, 0);
});

test('ไม่มีภาพต้นฉบับจาก AI ถูกบล็อกแม้ข้อความถูกต้อง', () => {
  const result = evaluateContentQuality({ campaign, caption: goodCaption, imageReady: false });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'visual')?.status, 'fail');
});

test('เงินเดือนผิดจากใบขอถูกบล็อก', () => {
  const result = evaluateContentQuality({ campaign, caption: goodCaption.replace('18,000 บาท', '25,000 บาท') });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'income')?.status, 'fail');
});

test('สวัสดิการที่แต่งเพิ่มถูกบล็อก', () => {
  const result = evaluateContentQuality({ campaign, caption: `${goodCaption}\nสวัสดิการครบ มีรถรับส่ง` });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'benefits')?.status, 'fail');
});

test('ข้อความแต่งเพิ่มบนโปสเตอร์ถูกบล็อกแม้ caption ถูกต้อง', () => {
  const result = evaluateContentQuality({
    campaign,
    caption: goodCaption,
    posterFields: { title: 'พนักงานขับรถผู้บริหาร', benefits: ['งานมั่นคง', 'รถรับส่ง'] },
  });
  assert.equal(result.blocking, true);
  assert.deepEqual(result.posterFields?.benefits, ['งานมั่นคง', 'รถรับส่ง']);
  assert.equal(result.checks.find((item) => item.code === 'benefits')?.status, 'fail');
});

test('จุดขายเชิงโฆษณาที่ ERP ไม่ได้ยืนยันถูกบล็อก', () => {
  const result = evaluateContentQuality({ campaign, caption: `${goodCaption}\nโอกาสเติบโตและสภาพแวดล้อมที่ดี` });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'benefits')?.status, 'fail');
});

test('เบอร์โทรหรือ LINE ที่ไม่ได้มาจาก ERP ถูกบล็อก', () => {
  const result = evaluateContentQuality({ campaign, caption: `${goodCaption}\nติดต่อโทร 099-999-9999 หรือ LINE: fakejob` });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'contact')?.status, 'fail');
});

test('มีรายได้ถูกหนึ่งตัวแต่แอบเพิ่มตัวเลขอื่นยังถูกบล็อก', () => {
  const result = evaluateContentQuality({ campaign, caption: goodCaption.replace('18,000 บาท', '18,000–25,000 บาท') });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'income')?.status, 'fail');
});

test('ตัวเลขรายได้ซ้ำบนโปสเตอร์ถูกบล็อกเป็นปัญหา layout', () => {
  const result = evaluateContentQuality({
    campaign,
    caption: goodCaption,
    imageReady: true,
    posterFields: { salaryTotal: '18,000', salaryBreakdown: '18,000' },
  });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'poster_salary_layout')?.status, 'fail');
});

test('ใบขอที่มีเพียงชื่อตำแหน่งกว้างเกินไปถูกบล็อก', () => {
  const result = evaluateContentQuality({
    campaign: {
      title: 'พนักงาน',
      province: 'กรุงเทพมหานคร',
      qty: 1,
      request_snapshot: { position: 'พนักงาน', location: 'กรุงเทพมหานคร', qty: 1 },
    },
    caption: 'เปิดรับสมัครพนักงาน กรุงเทพมหานคร จำนวน 1 คน',
  });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'source_position')?.status, 'fail');
});

test('ใบขอไม่มีสถานที่ทำงานถูกบล็อกก่อนโพสต์', () => {
  const result = evaluateContentQuality({
    campaign: { ...campaign, province: null, request_snapshot: { ...campaign.request_snapshot, location: '', work_addr: '' } },
    caption: goodCaption,
  });
  assert.equal(result.checks.find((item) => item.code === 'location')?.status, 'fail');
});

test('ร่างที่ไม่มีหลักฐานสำรวจตลาดถูกบล็อก', () => {
  const result = evaluateContentQuality({
    campaign,
    caption: goodCaption,
    imageReady: true,
    researchGate: { ready: false, issues: ['ยังไม่พบโพสต์ Facebook'] },
  });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'market_research')?.status, 'fail');
});

test('ร่างที่มีหลักฐาน Google และ Facebook ผ่านด่านวิจัย', () => {
  const result = evaluateContentQuality({
    campaign,
    caption: goodCaption,
    imageReady: true,
    researchGate: { ready: true, googleEvidence: 3, facebookEvidence: 2, issues: [] },
  });
  assert.equal(result.checks.find((item) => item.code === 'market_research')?.status, 'pass');
});
