import fs from 'node:fs';
import path from 'node:path';
import { buildPosterSvg, withPosterTemplate } from './poster-template.js';

/**
 * สร้างโปสเตอร์รับสมัครงาน SO WORK! (1080×1080) จากข้อมูล structured + รูปฉากงานจริงจาก AI
 * โดยเรนเดอร์ HTML → PNG ด้วย Chromium.
 *
 * บนเครื่อง local/worker ใช้ Playwright. บน Vercel ใช้ชุดเดียวกับสร้าง PDF
 * เพราะ Playwright ไม่มีไฟล์เบราว์เซอร์ใน serverless.
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
  return new Error(`ประกอบโปสเตอร์ไม่สำเร็จ กรุณาลองใหม่ (${raw.slice(0, 90)})`);
}

/**
 * @param {object} fields ข้อมูลโปสเตอร์ (title, salaryTotal, qualifications[], ...)
 * @param {string|null} personDataUri  data:image/png;base64,... หรือ null
 * @returns {Promise<{bytes: Buffer, mime: string} | null>}
 */
export async function renderPoster(fields, personDataUri = null) {
  if (!fields || !fields.title) return null;
  let browser = null;
  try {
    const normalized = withPosterTemplate(fields);
    browser = await launchPosterBrowser();
    const page = await browser.newPage();
    if (typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width: 1080, height: 1080 });
    } else if (typeof page.setViewport === 'function') {
      await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    }
    const svg = buildPosterSvg(normalized, personDataUri, logoDataUri());
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1080px;height:1080px;overflow:hidden}</style></head><body>${svg}</body></html>`,
      { waitUntil: 'domcontentloaded', timeout: 20_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    const el = await page.$('#poster') || await page.$('svg');
    let bytes;
    try {
      bytes = el
        ? await el.screenshot({ type: 'png' })
        : await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } });
    } catch {
      bytes = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } });
    }
    return { bytes: Buffer.from(bytes), mime: 'image/png' };
  } catch (error) {
    throw composeError(error);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
