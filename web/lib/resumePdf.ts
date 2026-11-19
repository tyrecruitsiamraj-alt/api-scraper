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

/** ชื่อไฟล์ตามชนิด (resume.pdf → resume.jpg / resume.png) */
export function resumeFileNameAs(fullName: unknown, ext: 'pdf' | 'jpg' | 'png'): string {
  return resumeFileName(fullName).replace(/\.pdf$/, `.${ext}`);
}

/** เปิด HTML เรซูเม่ใน Chrome (รอฟอนต์) แล้วให้ use ทำไฟล์จากหน้านั้น */
async function withResumePage<T>(html: string, use: (page: any) => Promise<T>, viewport?: { width: number; height: number; deviceScaleFactor: number }): Promise<T> {
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
    if (viewport) await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    // Wait for Google Fonts (Kanit) if network available; don't hang forever offline.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    // Extra beat for remote stylesheet images/fonts after first paint.
    await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 300));
    }).catch(() => {});
    return await use(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  // ขอบกระดาษมาจาก @page ของแต่ละแบบฟอร์ม (แบบแถบข้างไม่มีขอบ แถบสีชิดกระดาษ)
  return withResumePage(html, async (page) => Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })));
}

export type ResumeImageType = 'png' | 'jpeg';

/**
 * เรซูเม่เป็นรูป (เจ้าของ 19 พ.ย. 2569: "อยากโหลดได้หลายสกุลไฟล์ เช่น jpg png")
 * กว้างเท่า A4 (794px) ความละเอียด 2 เท่า · เกินหนึ่งหน้า = รูปยาวต่อกันลงไป หน้าตาเดียวกับตัวอย่างในหน้าต่างดาวน์โหลด
 */
export async function htmlToImage(html: string, type: ResumeImageType): Promise<Buffer> {
  return withResumePage(
    html,
    async (page) => Buffer.from(await page.screenshot({ type, fullPage: true, ...(type === 'jpeg' ? { quality: 92 } : {}) })),
    { width: 794, height: 1123, deviceScaleFactor: 2 },
  );
}
