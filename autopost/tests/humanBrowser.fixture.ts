import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import * as path from 'path';
import { browserProfileFor, isProfileInUseError } from '../src/helpers/browserProfile';

/**
 * Chrome ที่ใช้กับ Facebook
 *
 * มี FB_PROFILE_ID (เครื่องโพสต์ใส่ให้ = id บัญชี) → เปิดโปรไฟล์ Chrome ถาวรของบัญชีนั้น (.profiles/<id>)
 * เจ้าของเคาะ 10 พ.ย. 2569: เดิมทุกรอบเปิด Chrome ใหม่เปล่า ๆ แล้วใส่คุกกี้ ทุกบัญชีจอขนาดเดียวกัน
 * และ user agent ตายตัวที่ไม่ตรงกับ Chrome จริงในเครื่อง — ดูไม่เหมือนเบราว์เซอร์ที่คนใช้
 * โปรไฟล์ถาวรเก็บประวัติ แคช คุกกี้ เหมือนคนเปิด Chrome ของตัวเองทุกวัน · ปิดได้ด้วย FB_PERSISTENT_PROFILE=0
 *
 * ไม่มี FB_PROFILE_ID หรือปิดไว้ → Chrome ใหม่แบบเดิม
 */
const PROFILE_WAIT_MS = 10 * 60_000;

async function launchProfile(dir: string, headless: boolean, opts: ReturnType<typeof browserProfileFor>): Promise<BrowserContext> {
  const until = Date.now() + PROFILE_WAIT_MS;
  for (;;) {
    try {
      return await chromium.launchPersistentContext(dir, {
        channel: 'chrome',
        headless,
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: opts.viewport,
        locale: 'th-TH',
        timezoneId: 'Asia/Bangkok',
      });
    } catch (e) {
      // อีกงานของบัญชีเดียวกันเปิดโปรไฟล์อยู่ (เช่น เก็บคอมเมนต์ยังไม่จบ) — รอให้ปิดก่อน
      if (!isProfileInUseError(e) || Date.now() > until) {
        if (isProfileInUseError(e)) {
          throw new Error('บัญชีนี้มี Chrome อีกหน้าต่างเปิดอยู่นานเกิน 10 นาที (โพสต์หรือเก็บคอมเมนต์) ปิดหน้าต่างนั้นแล้วสั่งใหม่');
        }
        throw e;
      }
      console.log('[profile] โปรไฟล์ของบัญชีนี้ถูกใช้อยู่ — รอ 30 วินาที');
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use, testInfo) => {
    const headless = testInfo.project.use.headless === true;
    const profileId = String(process.env.FB_PROFILE_ID || '').trim();
    const persistent = profileId && String(process.env.FB_PERSISTENT_PROFILE ?? '1') !== '0';
    let context: BrowserContext;
    let close: () => Promise<void>;
    if (persistent) {
      const opts = browserProfileFor(profileId);
      const dir = path.join(process.cwd(), '.profiles', opts.dirName);
      console.log(`[profile] เปิดโปรไฟล์ Chrome ของบัญชี ${profileId} (${opts.viewport.width}x${opts.viewport.height})`);
      context = await launchProfile(dir, headless, opts);
      close = () => context.close();
    } else {
      const browser = await chromium.launch({
        channel: 'chrome',
        headless,
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['--disable-blink-features=AutomationControlled'],
      });
      context = await browser.newContext({ viewport: { width: 1366, height: 658 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
      close = () => browser.close();
    }
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await use(context);
    await close().catch(() => {});
  },
  page: async ({ context }, use) => {
    // โปรไฟล์ถาวรเปิดมาพร้อมแท็บว่าง 1 แท็บ — ใช้แท็บนั้น ไม่เปิดแท็บเพิ่ม
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

export { expect } from '@playwright/test';
