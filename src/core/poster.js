import fs from 'node:fs';
import path from 'node:path';
import { buildPosterSvg, withPosterTemplate } from './poster-template.js';

/**
 * สร้างโปสเตอร์รับสมัครงาน SO WORK! (1080×1080) จากข้อมูล structured + รูปฉากงานจริงจาก AI
 * โดยเรนเดอร์ HTML → PNG ด้วย Chromium.
 * ตัวหนังสือไทยคมชัด 100% เพราะเป็น text จริงบน template ไม่ใช่ AI วาด.
 *
 * บนเครื่อง local/worker ใช้ Playwright. บน Vercel ใช้ชุดเดียวกับสร้าง PDF
 * เพราะ Playwright ไม่มีไฟล์เบราว์เซอร์ใน serverless.
 *
 * รูปต้นฉบับไม่ถูกฝัง data URI ซ้ำใน SVG — เลเยอร์เพิ่มรูปชี้ URL สั้นชุดเดียว.
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

async function launchPosterBrowser() {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (serverless) {
    const puppeteer = await import('puppeteer-core');
    const chromiumMod = await import('@sparticuz/chromium-min');
    const chromium = chromiumMod.default;
    const packUrl = process.env.CHROMIUM_PACK_URL
      || 'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';
    return puppeteer.default.launch({
      args: [...chromium.args, '--disable-dev-shm-usage', '--font-render-hinting=none'],
      defaultViewport: { width: 1080, height: 1080 },
      executablePath: await chromium.executablePath(packUrl),
      headless: true,
    });
  }
  const { chromium } = await import('playwright');
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
  });
}

function composeError(error) {
  const raw = error instanceof Error ? error.message : String(error || '');
  console.warn(`  [poster] เรนเดอร์ไม่สำเร็จ: ${raw}`);
  if (/Executable doesn't exist|lib64|Failed to launch/i.test(raw)) {
    return new Error('ประกอบโปสเตอร์ไม่สำเร็จ ระบบกำลังเปิดเครื่องประกอบรูป กรุณาลองอีกครั้ง');
  }
  return new Error('ประกอบโปสเตอร์ไม่สำเร็จ กรุณาลองใหม่');
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
    browser = await launchPosterBrowser();
    const page = await browser.newPage();
    if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1080, height: 1080 });
    } else if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    }
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
      { waitUntil: 'domcontentloaded', timeout: 20_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    const el = await page.$('#poster') || await page.$('svg');
    if (!el) throw new Error('ไม่พบโปสเตอร์บนหน้าเรนเดอร์');
    const bytes = await el.screenshot({ type: 'png' });
    return { bytes, mime: 'image/png' };
  } catch (error) {
    throw composeError(error);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
