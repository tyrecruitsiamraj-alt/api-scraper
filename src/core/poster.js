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
 *
 * รูปต้นฉบับไม่ถูกฝัง data URI ซ้ำใน SVG — เลเยอร์เพิ่มรูปชี้ URL สั้นชุดเดียว
 * แล้ว Playwright เป็นคนป้อนไฟล์ จึงประกอบบน Vercel ได้แม้มีรูปเพิ่ม.
 */

const PERSON_HREF = 'https://so-poster.invalid/person';
const LOGO_HREF = 'https://so-poster.invalid/logo';

function logoPath() {
  const candidates = [
    path.resolve(process.cwd(), 'web/public/logo-SO.webp'),
    path.resolve(process.cwd(), 'public/logo-SO.webp'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function decodeDataUri(dataUri) {
  const match = String(dataUri || '').trim().match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const subtype = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  return {
    mime: `image/${subtype === 'jpg' ? 'jpeg' : subtype}`,
    bytes: Buffer.from(match[2].replace(/\s+/g, ''), 'base64'),
  };
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
    const person = decodeDataUri(personDataUri);
    const sourceLogo = logoPath();
    const logoBytes = sourceLogo ? fs.readFileSync(sourceLogo) : null;
    const logoMime = sourceLogo?.endsWith('.png') ? 'image/png' : 'image/webp';
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    await page.route('https://so-poster.invalid/**', async (route) => {
      const url = route.request().url();
      if (url.startsWith(PERSON_HREF) && person) {
        await route.fulfill({ status: 200, contentType: person.mime, body: person.bytes });
        return;
      }
      if (url.startsWith(LOGO_HREF) && logoBytes) {
        await route.fulfill({ status: 200, contentType: logoMime, body: logoBytes });
        return;
      }
      await route.abort();
    });
    const svg = buildPosterSvg(
      normalized,
      person ? PERSON_HREF : null,
      logoBytes ? LOGO_HREF : null,
    );
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1080px;height:1080px;overflow:hidden}</style></head><body>${svg}</body></html>`,
      { waitUntil: 'load', timeout: 20_000 },
    );
    const el = await page.$('#poster') || await page.$('svg');
    if (!el) throw new Error('ไม่พบโปสเตอร์บนหน้าเรนเดอร์');
    const bytes = await el.screenshot({ type: 'png' });
    return { bytes, mime: 'image/png' };
  } catch (e) {
    console.warn(`  [poster] เรนเดอร์ไม่สำเร็จ: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
