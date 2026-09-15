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

function handlesHtml(layers) {
  return layers.map((layer) => `
    <button type="button" data-poster-handle="${layer.id}" aria-label="ลาก${layer.label}"
      style="position:absolute;left:${(layer.x / POSTER_CANVAS) * 100}%;top:${(layer.y / POSTER_CANVAS) * 100}%;width:${(layer.w / POSTER_CANVAS) * 100}%;height:${(layer.h / POSTER_CANVAS) * 100}%;border:2px solid rgba(13,95,184,.85);background:transparent;cursor:grab">
      <span style="position:absolute;left:4px;top:4px;background:#0d5fb8;color:#fff;border-radius:999px;padding:2px 8px;font:12px sans-serif">${layer.label}</span>
    </button>`).join('');
}

function editorHtml(fields) {
  const svg = buildPosterSvg(fields, null, null);
  const layers = getPosterLayerBoxes(fields);
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>จัดวางรูป Content</title>
<style>
  html,body{margin:0;background:#f5f5f7;font-family:Tahoma,sans-serif;color:#163652}
  #hint{margin:20px 24px 0;font-size:14px}
  #stage{width:540px;height:540px;position:relative;margin:16px 24px 24px;background:#fff;overflow:hidden;border-radius:24px;box-shadow:0 20px 50px rgba(11,42,85,.18)}
  #art svg{width:100%;height:100%;display:block;pointer-events:none}
  #handles{position:absolute;inset:0}
</style></head>
<body>
  <p id="hint">ลากรูปหรือข้อความไปวางตำแหน่งใหม่</p>
  <div id="stage">
    <div id="art">${svg}</div>
    <div id="handles">${handlesHtml(layers)}</div>
  </div>
  <input id="layout" value='${JSON.stringify(fields.layout)}' />
  <script>
    const CANVAS = ${POSTER_CANVAS};
    let layout = ${JSON.stringify(fields.layout)};
    const stage = document.getElementById('stage');
    let drag = null;
    stage.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-poster-handle]');
      if (!handle) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      drag = { id: handle.dataset.posterHandle, x: event.clientX, y: event.clientY, layout };
    });
    stage.addEventListener('pointermove', async (event) => {
      if (!drag) return;
      const box = stage.getBoundingClientRect();
      const scale = CANVAS / box.width;
      const dx = (event.clientX - drag.x) * scale;
      const dy = (event.clientY - drag.y) * scale;
      window.__pending = { id: drag.id, dx, dy };
      const painted = await window.soPaint(drag.layout, drag.id, dx, dy);
      layout = painted.layout;
      document.getElementById('art').innerHTML = painted.svg;
      document.getElementById('handles').innerHTML = painted.handles;
      document.getElementById('layout').value = JSON.stringify(painted.layout);
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
  await page.exposeFunction('soPaint', (layout, key, dx, dy) => {
    const nextLayout = applyPosterLayoutDelta(layout, key, dx, dy);
    const next = withPosterTemplate({ ...sample, layout: nextLayout });
    return {
      layout: next.layout,
      svg: buildPosterSvg(next, null, null),
      handles: handlesHtml(getPosterLayerBoxes(next)),
    };
  });
  await page.setContent(editorHtml(sample), { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#hint').innerText(), 'ลากรูปหรือข้อความไปวางตำแหน่งใหม่');

  const title = page.locator('[data-poster-handle="title"]');
  const before = await title.boundingBox();
  assert.ok(before);
  await title.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 48, before.y + before.height / 2 + 32, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => Boolean(window.__pending));

  const pending = await page.evaluate(() => window.__pending);
  assert.equal(pending.id, 'title');
  assert.ok(pending.dx > 20, `dx should move right, got ${pending.dx}`);
  assert.ok(pending.dy > 8, `dy should move down, got ${pending.dy}`);

  const saved = JSON.parse(await page.inputValue('#layout'));
  assert.equal(saved.title.x, applyPosterLayoutDelta(emptyPosterLayout(), 'title', pending.dx, pending.dy).title.x);
  const persisted = buildPosterSvg({ ...sample, layout: saved }, null, null);
  assert.match(persisted, new RegExp(`data-poster-layer="title"[^>]*translate\\(${saved.title.x} ${saved.title.y}\\)`));
  const after = await title.boundingBox();
  assert.ok(after.x > before.x + 10);
});
