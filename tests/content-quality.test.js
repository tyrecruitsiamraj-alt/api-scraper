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
  const result = evaluateContentQuality({ campaign, caption: goodCaption });
  assert.equal(result.blocking, false);
  assert.ok(['pass', 'warning'].includes(result.status));
  assert.equal(result.checks.filter((item) => item.status === 'fail').length, 0);
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
