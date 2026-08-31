import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { buildPosterSvg, withPosterTemplate } from './poster-template.js';

/**
 * สร้างโปสเตอร์รับสมัครงาน SO WORK! (1080×1080) จากข้อมูล structured + รูปฉากงานจริงจาก AI
 * โดยเรนเดอร์ HTML → PNG ด้วย Playwright chromium (worker มี playwright อยู่แล้ว).
 * ตัวหนังสือไทยคมชัด 100% เพราะเป็น text จริงบน template ไม่ใช่ AI วาด.
 *
 * ไม่มีรูปคน (personDataUri = null) ก็ได้ — เลย์เอาต์จะขยายข้อความเต็มแทน (fail-soft).
 * ต้องมีฟอนต์ไทยบนเครื่อง worker (Mac มี Thonburi/Sukhumvit; scraper เรนเดอร์หน้าไทยได้อยู่แล้ว).
 */

function logoDataUri() {
  const candidates = [
    path.resolve(process.cwd(), 'web/public/logo-SO.webp'),
    path.resolve(process.cwd(), 'public/logo-SO.webp'),
  ];
  const logoPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!logoPath) return null;
  return `data:image/webp;base64,${fs.readFileSync(logoPath).toString('base64')}`;
}

/**
 * @param {object} fields ข้อมูลโปสเตอร์ (title, salaryTotal, qualifications[], ...)
 * @param {string|null} personDataUri  data:image/png;base64,... (พื้นหลังทึบหรือใสก็ได้) หรือ null
 * @returns {Promise<{bytes: Buffer, mime: string} | null>}
 */
export async function renderPoster(fields, personDataUri = null) {
  if (!fields || !fields.title) return null;
  let browser = null;
  try {
    const normalized = withPosterTemplate(fields);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    const svg = buildPosterSvg(normalized, personDataUri, logoDataUri());
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1080px;height:1080px;overflow:hidden}</style></head><body>${svg}</body></html>`, { waitUntil: 'networkidle', timeout: 30_000 });
    const el = await page.$('#poster');
    const bytes = await el.screenshot({ type: 'png' });
    return { bytes, mime: 'image/png' };
  } catch (e) {
    console.warn(`  [poster] เรนเดอร์ไม่สำเร็จ: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
