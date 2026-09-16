import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPosterFieldsDelta,
  applyPosterLayoutDelta,
  buildPosterSvg,
  createPosterImageExtra,
  createPosterTextExtra,
  getPosterLayerBoxes,
  normalizePosterExtras,
  normalizePosterLayout,
  normalizePosterStandard,
  posterStandardFromFields,
  applyPosterStandard,
  POSTER_CAMPAIGN_SOURCE,
  POSTER_TEMPLATE_ID,
  POSTER_TEMPLATE_VERSION,
  withPosterTemplate,
} from '../src/core/poster-template.js';

const sample = {
  title: 'หัวหน้าไซด์',
  location: 'โรงงานคูโบต้า นวนคร',
  salaryTotal: '15,000',
  quantity: '1 อัตรา',
  qualifications: ['อายุ 20-55 ปี'],
  benefits: [],
  worktime: 'จันทร์ - ศุกร์ • 7.00 - 17.00 น.',
  imageSide: 'right',
};

test('Template กลางเก็บ Version และแสดงเวลาสองบรรทัดโดยไม่ทำรายละเอียดหาย', () => {
  const fields = withPosterTemplate(sample);
  const svg = buildPosterSvg(fields, '/source-image', '/logo-SO.webp');
  assert.equal(fields.templateId, POSTER_TEMPLATE_ID);
  assert.equal(fields.templateVersion, POSTER_TEMPLATE_VERSION);
  assert.match(svg, /17\.00 น\./);
  assert.match(svg, />SO<\/text>/);
  assert.match(svg, />PEOPLE<\/text>/);
  assert.match(svg, /WE MAKE IT EASY/);
  assert.match(svg, />บาท</);
  assert.doesNotMatch(svg, /เปิดรับสมัครด่วน/);
  assert.doesNotMatch(svg, /สนใจสมัคร ทักเลย/);
});

test('โปสเตอร์รุ่นเก่าจัดวางใหม่ตามแบบ SO PEOPLE ไม่เอาคุณสมบัติไปแทนสวัสดิการ', () => {
  const svg = buildPosterSvg({
    ...sample,
    templateVersion: 2,
    badge: 'เปิดรับสมัครด่วน',
    qualifications: ['เพศชาย', 'อายุ 25-45 ปี'],
    benefits: ['ประกันสังคม', 'โบนัสประจำปี'],
    layout: { title: { x: 80, y: -40 } },
    extras: [{
      id: 't1',
      kind: 'text',
      x: 70,
      y: 640,
      w: 200,
      h: 60,
      text: 'ข้อความใหม่',
      provenance: { origin: 'operator_text', addedAt: '2026-09-15T00:00:00.000Z' },
    }],
  });
  assert.match(svg, /ประกันสังคม/);
  assert.match(svg, /โบนัสประจำปี/);
  assert.doesNotMatch(svg, /เพศชาย/);
  assert.doesNotMatch(svg, /ข้อความใหม่/);
  assert.doesNotMatch(svg, /data-poster-layer="title"[^>]*translate\(80 -40\)/);
});

test('แบบมาตรฐานรุ่นเก่าไม่ถูกยัดข้อความทดลองหรือเลเยอร์ซ้ำลงงานใหม่', () => {
  const applied = applyPosterStandard({
    ...sample,
    title: 'คนสวน',
    salaryTotal: '14,000',
  }, {
    templateVersion: 2,
    layout: { title: { x: 80, y: -40 } },
    extras: [{ kind: 'text', x: 70, y: 640, w: 200, h: 60, text: 'ข้อความใหม่' }],
  });
  assert.equal(applied.title, 'คนสวน');
  assert.equal(applied.layout.title.x, 0);
  assert.equal(applied.extras.some((item) => item.text === 'ข้อความใหม่'), false);
});

test('เลเยอร์โปสเตอร์ลากได้และตำแหน่งที่บันทึกติดไปกับ SVG ชุดถัดไป', () => {
  const moved = withPosterTemplate({
    ...sample,
    layout: { title: { x: 40, y: -20 }, photo: { x: -30, y: 10 }, cta: { x: 0, y: 18 } },
  });
  const svg = buildPosterSvg(moved, '/source-image', '/logo-SO.webp');
  assert.match(svg, /data-poster-layer="photo"[^>]*translate\(-30 10\)/);
  assert.match(svg, /data-poster-layer="title"[^>]*translate\(40 -20\)/);
  assert.match(svg, /data-poster-layer="cta"[^>]*translate\(0 18\)/);
  assert.match(svg, /href="\/source-image"/);
  const titleBox = getPosterLayerBoxes(moved).find((layer) => layer.id === 'title');
  const original = getPosterLayerBoxes(sample).find((layer) => layer.id === 'title');
  assert.equal(titleBox.x, original.x + 40);
  assert.equal(titleBox.y, original.y - 20);
  const again = buildPosterSvg(moved, '/source-image', '/logo-SO.webp');
  assert.equal(svg, again);
});

test('layout จากฟอร์มเก็บเฉพาะเลเยอร์ที่รู้จักและตัดค่าเพี้ยน', () => {
  const layout = normalizePosterLayout({
    title: { x: '12.4', y: 8 },
    hacker: { x: 99, y: 99 },
    photo: { x: 5000, y: -4000 },
  });
  assert.equal(layout.title.x, 12);
  assert.equal(layout.title.y, 8);
  assert.equal(layout.photo.x, 900);
  assert.equal(layout.photo.y, -900);
  assert.equal(layout.logo.x, 0);
  assert.equal(layout.hacker, undefined);
  const next = applyPosterLayoutDelta(layout, 'logo', 15, -4);
  assert.equal(next.logo.x, 15);
  assert.equal(next.logo.y, -4);
  assert.equal(next.title.x, 12);
});

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('เพิ่มรูปและข้อความบนโปสเตอร์แล้วลากได้โดยไม่สลับภาพต้นฉบับ', () => {
  const uploaded = createPosterImageExtra({ src: PIXEL, origin: 'operator_upload', filename: 'badge.jpg', x: 80, y: 90, w: 160, h: 120 });
  const fromBrief = createPosterImageExtra({ origin: 'campaign_source', x: 400, y: 200, w: 180, h: 220 });
  const note = createPosterTextExtra({ text: 'รอบด่วนวันนี้', x: 70, y: 640, w: 300, h: 80 });
  assert.equal(uploaded.provenance.origin, 'operator_upload');
  assert.equal(fromBrief.src, POSTER_CAMPAIGN_SOURCE);
  const fields = withPosterTemplate({
    ...sample,
    extras: [uploaded, fromBrief, note],
  });
  const svg = buildPosterSvg(fields, '/source-image', '/logo-SO.webp');
  assert.match(svg, /data-poster-layer="extra:[^"]+"[^>]*translate\(80 90\)/);
  assert.match(svg, /href="data:image\/png;base64,/);
  assert.match(svg, /href="\/source-image"/);
  assert.match(svg, /รอบด่วนวันนี้/);
  const boxes = getPosterLayerBoxes(fields);
  assert.equal(boxes.some((layer) => layer.id === 'title'), true);
  assert.equal(boxes.filter((layer) => String(layer.id).startsWith('extra:')).length, 3);
  const moved = applyPosterFieldsDelta(fields, `extra:${uploaded.id}`, 40, 12);
  assert.equal(moved.extras[0].x, 120);
  assert.equal(moved.extras[0].y, 102);
  assert.equal(moved.layout.title.x, 0);
  assert.match(buildPosterSvg(moved, '/source-image', null), /href="\/source-image"/);
});

test('รูปสต็อกหรือไฟล์ไม่มีที่มาถูกทิ้ง ไม่แอบสลับเข้าโปสเตอร์', () => {
  const extras = normalizePosterExtras([
    { id: 'stock', kind: 'image', x: 10, y: 10, w: 100, h: 100, src: 'https://stock.example/photo.jpg' },
    { id: 'noprop', kind: 'image', x: 10, y: 10, w: 100, h: 100, src: PIXEL },
    { id: 'ok', kind: 'image', x: 12, y: 20, w: 120, h: 120, src: PIXEL, provenance: { origin: 'operator_upload', filename: 'site.png', addedAt: '2026-09-15T00:00:00.000Z' } },
  ]);
  assert.equal(extras.length, 1);
  assert.equal(extras[0].id, 'ok');
  assert.equal(extras[0].provenance.origin, 'operator_upload');
});

test('แบบมาตรฐานเก็บตำแหน่งและข้อความ แต่ไม่เก็บรูปคนจากงานอื่น', () => {
  const uploaded = createPosterImageExtra({ src: PIXEL, origin: 'operator_upload', filename: 'face-job-a.jpg', x: 80, y: 90, w: 160, h: 120 });
  const fromBrief = createPosterImageExtra({ origin: 'campaign_source', x: 400, y: 200, w: 180, h: 220 });
  const note = createPosterTextExtra({ text: 'รอบด่วนวันนี้', x: 70, y: 640, w: 300, h: 80 });
  const jobA = withPosterTemplate({
    ...sample,
    title: 'พนักงานขับรถงาน A',
    salaryTotal: '15,000',
    layout: { title: { x: 24, y: -12 }, photo: { x: -40, y: 8 }, cta: { x: 0, y: 16 } },
    extras: [uploaded, fromBrief, note],
  });
  const standard = posterStandardFromFields(jobA);
  const packed = JSON.stringify(standard);
  assert.equal(/data:image/i.test(packed), false);
  assert.equal(packed.includes('face-job-a'), false);
  assert.equal(packed.includes(PIXEL), false);
  assert.equal(standard.layout.title.x, 24);
  assert.equal(standard.layout.photo.x, -40);
  assert.equal(standard.extras.some((item) => item.kind === 'text' && item.text === 'รอบด่วนวันนี้'), true);
  assert.equal(standard.extras.some((item) => item.kind === 'source_photo_slot'), true);
  assert.equal(standard.extras.some((item) => item.kind === 'upload_slot'), true);

  const jobB = applyPosterStandard({
    ...sample,
    title: 'แม่บ้านงาน B',
    salaryTotal: '12,000',
    location: 'โรงงานชลบุรี',
  }, {
    ...standard,
    extras: [
      ...standard.extras,
      { kind: 'image', src: PIXEL, provenance: { origin: 'operator_upload' }, x: 10, y: 10, w: 100, h: 100 },
    ],
  });
  assert.equal(jobB.title, 'แม่บ้านงาน B');
  assert.equal(jobB.salaryTotal, '12,000');
  assert.equal(jobB.location, 'โรงงานชลบุรี');
  assert.equal(jobB.layout.title.x, 24);
  assert.equal(jobB.layout.photo.x, -40);
  assert.equal(jobB.extras.some((item) => item.kind === 'text' && item.text === 'รอบด่วนวันนี้'), true);
  assert.equal(jobB.extras.some((item) => item.src === POSTER_CAMPAIGN_SOURCE), true);
  assert.equal(jobB.extras.some((item) => String(item.src || '').includes('data:image')), false);
  assert.equal(JSON.stringify(jobB.extras).includes(PIXEL), false);
});

test('แบบมาตรฐานที่ถูกฉีด data URI จะถูกตัดทิ้ง', () => {
  const cleaned = normalizePosterStandard({
    layout: { title: { x: 8, y: 0 } },
    extras: [
      { kind: 'text', x: 20, y: 30, w: 200, h: 60, text: `data:image/png;base64,${PIXEL}` },
      { kind: 'image', x: 40, y: 40, w: 120, h: 120, src: PIXEL, provenance: { origin: 'operator_upload' } },
      { kind: 'text', x: 50, y: 700, w: 240, h: 64, text: 'ทักเลย' },
    ],
  });
  assert.ok(cleaned);
  assert.equal(cleaned.extras.some((item) => item.kind === 'text' && item.text === 'ทักเลย'), true);
  assert.equal(cleaned.extras.some((item) => /data:image/i.test(JSON.stringify(item))), false);
  assert.equal(applyPosterStandard(sample, cleaned).extras.some((item) => item.kind === 'image' && item.src !== POSTER_CAMPAIGN_SOURCE), false);
});
