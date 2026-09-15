import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  applyPosterLayoutDelta,
  buildPosterSvg,
  emptyPosterLayout,
  getPosterLayerBoxes,
  POSTER_CANVAS,
  withPosterTemplate,
} from '../src/core/poster-template.js';

const sample = withPosterTemplate({
  title: 'พนักงานขับรถ',
  location: 'เขตห้วยขวาง กรุงเทพฯ',
  salaryTotal: '12,000 บาท',
  quantity: '1 อัตรา',
  qualifications: ['ชาย อายุ 25-45 ปี'],
  benefits: ['ประกันสังคม'],
  worktime: 'วันละ 10 ชม.',
  imageSide: 'right',
  contactLine: '081-234-5678',
});

function editorHtml(fields) {
  const svg = buildPosterSvg(fields, null, null);
  const layers = getPosterLayerBoxes(fields);
  const handles = layers.map((layer) => `
    <button type="button" data-poster-layer="${layer.id}" aria-label="ลาก${layer.label}"
      style="position:absolute;left:${(layer.x / POSTER_CANVAS) * 100}%;top:${(layer.y / POSTER_CANVAS) * 100}%;width:${(layer.w / POSTER_CANVAS) * 100}%;height:${(layer.h / POSTER_CANVAS) * 100}%;border:2px solid rgba(13,95,184,.85);background:transparent;cursor:grab">
      <span style="position:absolute;left:4px;top:4px;background:#0d5fb8;color:#fff;border-radius:999px;padding:2px 8px;font:12px sans-serif">${layer.label}</span>
    </button>`).join('');
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>จัดวางรูป Content</title>
<style>
  html,body{margin:0;background:#f5f5f7;font-family:Tahoma,sans-serif}
  #stage{width:540px;height:540px;position:relative;margin:24px;background:#fff;overflow:hidden}
  #stage svg{width:100%;height:100%;display:block;pointer-events:none}
</style></head>
<body>
  <p id="hint">ลากรูปหรือข้อความไปวางตำแหน่งใหม่</p>
  <div id="stage">${svg}${handles}</div>
  <input id="layout" value='${JSON.stringify(fields.layout)}' />
  <script>
    const CANVAS = ${POSTER_CANVAS};
    const startLayout = ${JSON.stringify(fields.layout)};
    const stage = document.getElementById('stage');
    let drag = null;
    stage.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-poster-layer]');
      if (!handle) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      drag = { id: handle.dataset.posterLayer, x: event.clientX, y: event.clientY };
    });
    stage.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const box = stage.getBoundingClientRect();
      const scale = CANVAS / box.width;
      const dx = (event.clientX - drag.x) * scale;
      const dy = (event.clientY - drag.y) * scale;
      window.__pending = { id: drag.id, dx, dy };
    });
    stage.addEventListener('pointerup', () => { drag = null; });
  </script>
</body></html>`;
}

test('ลากชื่อตำแหน่งบนพรีวิวแล้วตำแหน่งติดไปกับ layout ที่จะบันทึก', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await page.setContent(editorHtml(sample), { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#hint').innerText(), 'ลากรูปหรือข้อความไปวางตำแหน่งใหม่');

  const title = page.locator('[data-poster-layer="title"]');
  const before = await title.boundingBox();
  assert.ok(before);
  await title.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 48, before.y + before.height / 2 + 24);
  await page.mouse.up();

  const pending = await page.evaluate(() => window.__pending);
  assert.ok(pending);
  assert.equal(pending.id, 'title');
  assert.ok(pending.dx > 20, `dx should move right, got ${pending.dx}`);
  assert.ok(pending.dy > 8, `dy should move down, got ${pending.dy}`);

  const saved = applyPosterLayoutDelta(emptyPosterLayout(), pending.id, pending.dx, pending.dy);
  const persisted = buildPosterSvg({ ...sample, layout: saved }, null, null);
  assert.match(persisted, new RegExp(`data-poster-layer="title"[^>]*translate\\(${saved.title.x} ${saved.title.y}\\)`));
  const nextBox = getPosterLayerBoxes({ ...sample, layout: saved }).find((layer) => layer.id === 'title');
  const original = getPosterLayerBoxes(sample).find((layer) => layer.id === 'title');
  assert.equal(nextBox.x, original.x + saved.title.x);
  assert.equal(nextBox.y, original.y + saved.title.y);
});
