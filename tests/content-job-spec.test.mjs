import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyJobFamily,
  resolveContentJobSpec,
} from '../src/core/content-job-spec.js';
import {
  buildContentPrompt,
  campaignContext,
  sanitizeImageStyle,
  selectRelevantTrends,
} from '../src/core/content-gen.js';
import { resolvePosterDirection } from '../src/core/poster.js';

test('resolves a generic ERP title to driver from strong department evidence', () => {
  const spec = resolveContentJobSpec({
    title: 'พนักงาน',
    snapshot: {
      department: 'Labor Contract - Driver (ปี 56)',
      site_name: 'โรงพยาบาลตัวอย่าง',
    },
  });

  assert.equal(spec.position, 'พนักงานขับรถ');
  assert.equal(spec.family, 'C');
  assert.equal(spec.source, 'snapshot.department');
  assert.equal(spec.confidence, 'derived');
});

test('resolves PR/reception roles into Presentation-Forward family', () => {
  const pr = resolveContentJobSpec({
    title: 'เจ้าหน้าที่',
    snapshot: { department: 'Public Relations / PR' },
  });
  const reception = classifyJobFamily('Receptionist ต้อนรับลูกค้า');

  assert.equal(pr.position, 'พนักงานประชาสัมพันธ์');
  assert.equal(pr.family, 'A');
  assert.equal(reception?.canonicalPosition, 'พนักงานต้อนรับ');
});

test('an explicit role wins and the workplace never changes its identity', () => {
  const spec = resolveContentJobSpec({
    title: 'พนักงานประชาสัมพันธ์',
    snapshot: {
      site_name: 'โรงพยาบาลตัวอย่าง',
      location: 'อาคารผู้ป่วยนอก',
    },
  });

  assert.equal(spec.position, 'พนักงานประชาสัมพันธ์');
  assert.equal(spec.family, 'A');
  assert.equal(spec.source, 'title');
});

test('does not invent a role from a hospital location', () => {
  const spec = resolveContentJobSpec({
    title: 'พนักงาน',
    snapshot: {
      site_name: 'โรงพยาบาลตัวอย่าง',
      location: 'กรุงเทพฯ',
      unit_name: 'โรงพยาบาลตัวอย่าง',
    },
  });

  assert.equal(spec.position, null);
  assert.equal(spec.needsConfirmation, true);
});

test('candidate-spec context keeps role, family, client and location separate', () => {
  const context = campaignContext({
    title: 'พนักงาน',
    province: 'กรุงเทพฯ',
    snapshot: {
      department: 'Labor Contract - Driver',
      unit_name: 'โรงพยาบาลตัวอย่าง',
      work_addr: 'ถนนตัวอย่าง',
    },
  });

  assert.match(context, /ตำแหน่งงานจริง: พนักงานขับรถ/);
  assert.match(context, /Job Family: .*Transport\/Driver/);
  assert.match(context, /หน่วยงาน\/ลูกค้า: โรงพยาบาลตัวอย่าง/);
  assert.doesNotMatch(context, /ตำแหน่งงานจริง:.*โรงพยาบาล/);
});

test('new prompt includes reviewer feedback and excludes generic or unrelated trends', () => {
  const prompt = buildContentPrompt({
    title: 'พนักงาน',
    snapshot: { department: 'Driver' },
    rejectionFeedback: [{
      reason: 'ตำแหน่งต้องเป็นพนักงานขับรถ ไม่ใช่พนักงานโรงพยาบาล',
      caption: 'รับสมัครพนักงานโรงพยาบาล',
    }],
    trends: [
      { label: 'เปิดรับด่วน เริ่มงานได้ทันที', for_caption: true },
      { label: 'เช็กเส้นทางก่อนออกรถ', for_caption: true },
      { label: 'บุคลิกดี งานประชาสัมพันธ์', for_caption: true },
    ],
  });

  assert.match(prompt, /ตำแหน่งงานจริง: พนักงานขับรถ/);
  assert.match(prompt, /Feedback จากผู้ตรวจ/);
  assert.match(prompt, /ตำแหน่งต้องเป็นพนักงานขับรถ/);
  assert.match(prompt, /เช็กเส้นทางก่อนออกรถ/);
  assert.doesNotMatch(prompt, /เปิดรับด่วน เริ่มงานได้ทันที/);
  assert.doesNotMatch(prompt, /บุคลิกดี งานประชาสัมพันธ์/);
});

test('image guidance strips requests for embedded text and QR codes', () => {
  const style = sanitizeImageStyle(
    'คนขับรถยิ้มในลานจอดรถ, ใส่ข้อความ สมัครด่วน, พร้อม QR Code มุมขวา',
  );
  assert.match(style, /คนขับรถยิ้มในลานจอดรถ/);
  assert.doesNotMatch(style, /ข้อความ|สมัครด่วน|QR Code/iu);
});

test('trend selector only returns same-family signals', () => {
  const selected = selectRelevantTrends([
    { label: 'เทคนิคการขับรถปลอดภัย', for_caption: true },
    { label: 'ต้อนรับลูกค้าด้วยรอยยิ้ม', for_caption: true },
    { label: 'เปิดรับด่วน', for_caption: true },
  ], { family: 'C' }, 'caption');

  assert.deepEqual(selected.map((x) => x.label), ['เทคนิคการขับรถปลอดภัย']);
});

test('poster direction varies by Job Family instead of using one fixed template', () => {
  assert.equal(resolvePosterDirection({ jobFamily: 'A' }), 'human-editorial');
  assert.equal(resolvePosterDirection({ jobFamily: 'B' }), 'tech-signal');
  assert.equal(resolvePosterDirection({ jobFamily: 'C' }), 'bold-local');
});

test('an active relevant trend can override the family fallback', () => {
  assert.equal(resolvePosterDirection({
    jobFamily: 'C',
    trendLabels: ['ภาพคนจริง โทนอบอุ่นและเป็นกันเอง'],
  }), 'human-editorial');
  assert.equal(resolvePosterDirection({
    jobFamily: 'A',
    trendLabels: ['Industrial tech grid'],
  }), 'tech-signal');
});
