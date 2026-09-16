import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContentQuality, operatorCanApprove, operatorFacingQuality } from '../src/core/content-quality.js';
import { withPosterTemplate } from '../src/core/poster-template.js';

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

const goodPoster = withPosterTemplate({
  title: 'พนักงานขับรถผู้บริหาร',
  location: 'กรุงเทพมหานคร เขตห้วยขวาง',
  salaryTotal: '18,000 บาท',
  quantity: '2 อัตรา',
  qualifications: ['เพศชาย อายุ 25-45 ปี'],
  benefits: [],
  imageSide: 'right',
});

test('ประกาศที่ข้อมูลตรงใบขอผ่านด่านตรวจ', () => {
  const result = evaluateContentQuality({ campaign, caption: goodCaption, posterFields: goodPoster, imageReady: true });
  assert.equal(result.blocking, false);
  assert.ok(['pass', 'warning'].includes(result.status));
  assert.equal(result.checks.filter((item) => item.status === 'fail').length, 0);
});

test('Quality Gate ระบุชัดเมื่อสำรวจ Facebook ครบแล้วแต่ตลาดไม่มีโพสต์ตรงตำแหน่ง', () => {
  const result = evaluateContentQuality({
    campaign,
    caption: goodCaption,
    posterFields: goodPoster,
    imageReady: true,
    researchGate: {
      ready: true,
      googleEvidence: 3,
      facebookEvidence: 0,
      facebookMarketGap: true,
      facebookScannedGroups: 42,
    },
  });
  assert.equal(result.blocking, false);
  assert.match(result.checks.find((item) => item.code === 'market_research')?.message ?? '', /42 กลุ่ม/);
});

test('ใบขอที่เปิดกว้างเรื่องเพศ ห้ามให้ Caption หรือโปสเตอร์แต่งเป็นชายหรือหญิง', () => {
  const openGender = {
    ...campaign,
    request_snapshot: { ...campaign.request_snapshot, gender: 'O' },
  };
  const result = evaluateContentQuality({
    campaign: openGender,
    caption: goodCaption.replace('เพศชาย อายุ 25-45 ปี', 'เพศชาย อายุ 25-45 ปี'),
    imageReady: true,
    posterFields: { qualifications: ['เพศหญิง อายุ 25-45 ปี'] },
  });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'gender')?.status, 'fail');
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

test('คุณสมบัติหรือช่องทางที่ AI เติมเองถูกบล็อกแม้ข้อมูลหลักถูกต้อง', () => {
  const result = evaluateContentQuality({
    campaign,
    caption: `${goodCaption}\nมีใบขับขี่ ท.2 พร้อมเริ่มงาน แอดไลน์ด่วน`,
  });
  assert.equal(result.blocking, true);
  assert.equal(result.checks.find((item) => item.code === 'controlled_claims')?.status, 'fail');
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

test('จัดวางเลเยอร์ใหม่ไม่ทำให้ Quality Gate มองว่าสลับภาพต้นฉบับ', () => {
  const poster = withPosterTemplate({
    ...goodPoster,
    layout: { photo: { x: -40, y: 12 }, title: { x: 24, y: -8 } },
  });
  const result = evaluateContentQuality({ campaign, caption: goodCaption, posterFields: poster, imageReady: true });
  assert.equal(result.checks.find((item) => item.code === 'visual')?.status, 'pass');
  assert.equal(result.checks.find((item) => item.code === 'visual_template')?.status, 'pass');
  assert.equal(result.checks.find((item) => item.code === 'visual_layers')?.status, 'pass');
  assert.equal(result.blocking, false);
});

test('ข้อความที่เพิ่มบนโปสเตอร์ยังถูก Quality Gate ตรวจ และไฟล์รูปไม่ไปปนตัวเลขรายได้', () => {
  const poster = withPosterTemplate({
    ...goodPoster,
    extras: [
      {
        id: 'note1',
        kind: 'text',
        x: 80,
        y: 640,
        w: 300,
        h: 80,
        text: 'งานมั่นคง',
        provenance: { origin: 'operator_text', addedAt: '2026-09-15T00:00:00.000Z' },
      },
    ],
  });
  const failed = evaluateContentQuality({ campaign, caption: goodCaption, posterFields: poster, imageReady: true });
  assert.equal(failed.blocking, true);
  assert.equal(failed.checks.find((item) => item.code === 'benefits')?.status, 'fail');

  const imageOnly = withPosterTemplate({
    ...goodPoster,
    extras: [{
      id: 'pic1',
      kind: 'image',
      x: 40,
      y: 40,
      w: 120,
      h: 120,
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      provenance: { origin: 'operator_upload', filename: 'site.jpg', addedAt: '2026-09-15T00:00:00.000Z' },
    }],
  });
  const passed = evaluateContentQuality({ campaign, caption: goodCaption, posterFields: imageOnly, imageReady: true });
  assert.equal(passed.checks.find((item) => item.code === 'income')?.status, 'pass');
  assert.equal(passed.checks.find((item) => item.code === 'visual_extra_layers')?.status, 'pass');
  assert.equal(passed.posterFields?.extras?.[0]?.src, '[operator-image]');
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

test('ร่างเก่าที่ไม่มี research_gate ไม่ถูกบล็อกถ้าข้อเท็จจริงตรงใบขอ', () => {
  const result = evaluateContentQuality({ campaign, caption: goodCaption, posterFields: goodPoster, imageReady: true });
  assert.equal(result.checks.some((item) => item.code === 'market_research'), false);
  assert.equal(result.blocking, false);
  assert.equal(operatorCanApprove(result, { hasSourceImage: true }), true);
});

test('โปสเตอร์รุ่นเก่ายังอนุมัติได้ เพราะระบบประกอบเทมเพลตใหม่ให้เอง', () => {
  const stale = evaluateContentQuality({
    campaign,
    caption: goodCaption,
    posterFields: { ...goodPoster, templateVersion: 2 },
    imageReady: true,
  });
  assert.equal(stale.checks.find((item) => item.code === 'visual_template')?.status, 'fail');
  assert.equal(stale.blocking, true);
  assert.equal(operatorCanApprove(stale, { hasSourceImage: true }), true);
  const view = operatorFacingQuality(stale);
  assert.equal(view.status, 'warning');
  assert.equal(view.blocking, false);
  assert.equal(operatorCanApprove(stale, { isPreview: true, hasSourceImage: true }), false);
});

test('สวัสดิการที่แต่งเองยังปิดปุ่มอนุมัติ', () => {
  const invented = evaluateContentQuality({
    campaign,
    caption: `${goodCaption}\nสวัสดิการครบ มีรถรับส่ง`,
    posterFields: goodPoster,
    imageReady: true,
  });
  assert.equal(invented.blocking, true);
  assert.equal(operatorCanApprove(invented, { hasSourceImage: true }), false);
  assert.equal(operatorFacingQuality(invented).status, 'fail');
});
