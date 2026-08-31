import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosterSvg, POSTER_TEMPLATE_ID, POSTER_TEMPLATE_VERSION, withPosterTemplate } from '../src/core/poster-template.js';

test('Template กลางเก็บ Version และแสดงเวลาสองบรรทัดโดยไม่ทำรายละเอียดหาย', () => {
  const fields = withPosterTemplate({
    title: 'หัวหน้าไซด์',
    location: 'โรงงานคูโบต้า นวนคร',
    salaryTotal: '15,000',
    quantity: '1 อัตรา',
    qualifications: ['อายุ 20-55 ปี'],
    benefits: [],
    worktime: 'จันทร์ - ศุกร์ • 7.00 - 17.00 น.',
    imageSide: 'right',
  });
  const svg = buildPosterSvg(fields, '/source-image', '/logo-SO.webp');
  assert.equal(fields.templateId, POSTER_TEMPLATE_ID);
  assert.equal(fields.templateVersion, POSTER_TEMPLATE_VERSION);
  assert.match(svg, /17\.00 น\./);
  assert.match(svg, />SO<\/text>/);
  assert.match(svg, />PEOPLE<\/text>/);
});
