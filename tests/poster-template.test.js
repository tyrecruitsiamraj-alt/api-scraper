import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPosterLayoutDelta,
  buildPosterSvg,
  getPosterLayerBoxes,
  normalizePosterLayout,
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
