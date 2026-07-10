/* eslint-disable no-console */
/**
 * POC — พิสูจน์ว่าเปิดหลาย Chrome โพสต์ขนานกันได้ (แนวคิดของ enqueuePostRunJobsPerUser)
 * จำลอง N บัญชี แต่ละบัญชี = Chrome 1 ตัว เปิดพร้อมกัน พิมพ์ caption ลงหน้า "สร้างโพสต์"
 * ปลอม (data: URL — ไม่แตะ Facebook จริง ไม่เสีย credit ไม่เสี่ยงแบน) พร้อม human delay
 * แล้ววัด RAM จริงบนเครื่องนี้ + เทียบเวลากับกรณีรันทีละตัว
 *
 *   node scripts/poc-parallel-chrome.js [N]     (default N=2)
 */
const { chromium } = require('@playwright/test');
const { execSync, exec } = require('child_process');

const N = Math.max(1, Math.min(8, Number(process.argv[2]) || 2));
const GROUPS_PER_ACCOUNT = 3; // จำลองโพสต์ 3 กลุ่ม/บัญชี
const t0 = Date.now();
const clk = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

/** หน้า composer ปลอม — หน้าตาเหมือนกล่องสร้างโพสต์ FB เพื่อให้เห็นภาพชัดในแต่ละหน้าต่าง */
function composerHtml(account) {
  return `<!doctype html><meta charset="utf-8"><title>${account} — โพสต์</title>
  <body style="font-family:system-ui;background:#f0f2f5;margin:0;display:flex;justify-content:center;padding-top:40px">
  <div style="width:500px;background:#fff;border-radius:12px;box-shadow:0 2px 12px #0002;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee;padding-bottom:12px">
      <div style="width:40px;height:40px;border-radius:50%;background:#1877F2;color:#fff;display:grid;place-items:center;font-weight:700">${account.slice(-1)}</div>
      <div><b>${account}</b><div style="font-size:12px;color:#65676b">🌐 สาธารณะ · POC (ไม่ใช่ Facebook จริง)</div></div>
    </div>
    <div id="composer" contenteditable="true" role="textbox"
      style="min-height:120px;font-size:17px;padding:12px 4px;outline:none"
      data-placeholder="เขียนอะไรสักหน่อย..."></div>
    <button style="width:100%;background:#1877F2;color:#fff;border:0;border-radius:8px;padding:10px;font-size:15px;font-weight:600">โพสต์</button>
  </div></body>`;
}

async function humanType(page, sel, text) {
  const el = page.locator(sel);
  await el.click();
  // พิมพ์เป็นชิ้น (เหมือน humanBehavior จริง) — เร็วกว่าทีละตัวมากแต่ยังดูเป็นมนุษย์
  for (let i = 0; i < text.length; i += 6) {
    await page.keyboard.insertText(text.slice(i, i + 6));
    await sleep(40 + Math.random() * 80);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** RAM รวมของ chrome.exe (MB) — Windows. ต้อง ASYNC ไม่งั้น execSync บล็อก event loop
 * ที่ขับ Playwright ทั้ง N ตัวอยู่ → ทุกอย่างช้าลงมหาศาล (บทเรียนจาก POC รอบแรก) */
function chromeRamMB() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH', (err, out) => {
      if (err || !out) return resolve(null);
      let kb = 0;
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/"([\d.,]+) K"/);
        if (m) kb += Number(m[1].replace(/[.,]/g, ''));
      }
      resolve(Math.round(kb / 1024));
    });
  });
}

async function runAccount(idx) {
  const account = `บัญชี ${idx + 1}`;
  console.log(`[${account}] ${clk()} 🚀 เปิด Chrome`);
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  // จัดตำแหน่งหน้าต่างไม่ให้ทับกัน
  await page.setViewportSize({ width: 520, height: 620 });
  for (let g = 1; g <= GROUPS_PER_ACCOUNT; g++) {
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(composerHtml(account)));
    console.log(`[${account}] ${clk()} ✍️  พิมพ์โพสต์ กลุ่มที่ ${g}/${GROUPS_PER_ACCOUNT}`);
    await humanType(page, '#composer', `รับสมัครพนักงานขับรถผู้บริหาร ด่วน! สนใจทักแชท (${account} · กลุ่ม ${g})`);
    await sleep(600 + Math.random() * 900); // human review ก่อนกดโพสต์
    console.log(`[${account}] ${clk()} ✅ โพสต์กลุ่มที่ ${g} เสร็จ`);
    await sleep(500 + Math.random() * 700); // delay ระหว่างกลุ่ม (ย่อจากจริง 60-150s)
  }
  console.log(`[${account}] ${clk()} 🏁 ปิด Chrome (ครบ ${GROUPS_PER_ACCOUNT} กลุ่ม)`);
  await browser.close();
}

(async () => {
  console.log(`\n=== POC: เปิด ${N} Chrome โพสต์ขนานกัน (บัญชีละ ${GROUPS_PER_ACCOUNT} กลุ่ม) ===`);
  const ramBase = (await chromeRamMB()) || 0;
  console.log(`RAM chrome.exe ก่อนเริ่ม: ${ramBase} MB (Chrome ที่เปิดอยู่เดิม)\n`);

  let ramPeak = ramBase;
  const sampler = setInterval(async () => {
    const r = await chromeRamMB();
    if (r && r > ramPeak) ramPeak = r;
  }, 800);

  await Promise.all(Array.from({ length: N }, (_, i) => runAccount(i)));

  clearInterval(sampler);
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  const perAccount = wall / 1; // ทุกบัญชีเริ่มพร้อมกัน → เวลารวม ≈ เวลา 1 บัญชี
  const ramForN = Math.max(0, ramPeak - ramBase);
  const perChrome = ramForN / N;

  console.log(`\n=== สรุป ===`);
  console.log(`เวลารวม (ขนาน ${N} บัญชี): ${wall}s`);
  console.log(`ถ้ารันทีละบัญชี (sequential) จะใช้ ≈ ${(wall * N).toFixed(1)}s → ขนานเร็วขึ้น ~${N}x`);
  console.log(`RAM: peak ${ramPeak} MB, ของ POC (peak-base) ≈ ${ramForN} MB สำหรับ ${N} Chrome → ~${Math.round(perChrome)} MB/Chrome (หน้าปลอมเบา)`);
  console.log(`หมายเหตุ: หน้ากลุ่ม Facebook จริงหนักกว่านี้มาก (~0.8-1.2 GB/Chrome) → 32GB แนะนำ WORKER_CONCURRENCY=15`);
})().catch((e) => {
  console.error('POC error:', e.message || e);
  process.exit(1);
});
