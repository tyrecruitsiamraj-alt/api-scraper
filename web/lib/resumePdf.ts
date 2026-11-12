/** Chromium PDF generation for resumes (Thai-safe via browser render). HTML มาจาก resume-template.ts */
export { buildResumeHtml } from './resume-template';

function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function resumeFileName(fullName: unknown): string {
  const base = txt(fullName)
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${base || 'resume'}.pdf`;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const puppeteer = await import('puppeteer-core');

  let browser;
  if (isServerless) {
    // chromium-min downloads the browser pack to /tmp (avoids Next.js bundler
    // stripping bin/). Pack URL may be overridden via CHROMIUM_PACK_URL.
    const chromiumMod = await import('@sparticuz/chromium-min');
    const chromium = chromiumMod.default;
    const packUrl =
      process.env.CHROMIUM_PACK_URL ||
      'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';
    browser = await puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(packUrl),
      headless: true,
    });
  } else {
    // Local: prefer system Chrome/Edge.
    const candidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean) as string[];

    let executablePath: string | undefined;
    const { existsSync } = await import('node:fs');
    for (const p of candidates) {
      if (existsSync(p)) {
        executablePath = p;
        break;
      }
    }
    if (!executablePath) {
      throw new Error('ไม่พบ Chrome/Edge สำหรับสร้าง PDF — ติดตั้ง Chrome หรือตั้ง CHROME_PATH');
    }
    browser = await puppeteer.default.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    // Wait for Google Fonts (Kanit) if network available; don't hang forever offline.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    // Extra beat for remote stylesheet images/fonts after first paint.
    await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 300));
    }).catch(() => {});
    // ขอบกระดาษมาจาก @page ของแต่ละแบบฟอร์ม (แบบแถบข้างไม่มีขอบ แถบสีชิดกระดาษ)
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
