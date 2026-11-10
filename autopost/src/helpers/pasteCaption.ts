import * as fs from 'fs';
import * as path from 'path';
import type { Locator, Page } from '@playwright/test';
import { humanPause } from './humanBehavior';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pastedMatches, isCaptionPasteEnabled } = require('../../server/caption-paste') as {
  pastedMatches: (editorText: string, caption: string) => boolean;
  isCaptionPasteEnabled: () => boolean;
};

/** ล็อกคลิปบอร์ดทั้งเครื่อง — หลายบัญชีวางพร้อมกันไม่ได้ (คลิปบอร์ดมีอันเดียว) */
const LOCK_PATH = path.join(process.cwd(), '.auth', '.clipboard.lock');
const LOCK_WAIT_MS = 30_000;
const LOCK_STALE_MS = 20_000;

async function acquireClipboardLock(): Promise<(() => void) | null> {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const until = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < until) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => fs.rmSync(LOCK_PATH, { force: true });
    } catch {
      try {
        if (Date.now() - fs.statSync(LOCK_PATH).mtimeMs > LOCK_STALE_MS) fs.rmSync(LOCK_PATH, { force: true });
      } catch {
        /* ล็อกเพิ่งถูกปล่อย */
      }
      await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 400)));
    }
  }
  return null;
}

/**
 * วางข้อความประกาศลงช่องโพสต์ (คัดลอกแล้ววางแบบคน) — คืน false ให้ผู้เรียกพิมพ์แบบเดิมแทน
 * ใช้คลิปบอร์ดจริงของเครื่อง + กดวางจริง และตรวจว่าที่วางลงไปคือข้อความของงานนี้ ถ้าไม่ใช่ ลบทิ้งก่อนคืน false
 */
export async function pasteCaption(page: Page, editor: Locator, caption: string, userLabel: string): Promise<boolean> {
  if (!isCaptionPasteEnabled() || !caption.trim()) return false;
  const release = await acquireClipboardLock();
  if (!release) {
    console.log(`⚠️ [${userLabel}] คลิปบอร์ดถูกบัญชีอื่นใช้อยู่นานเกินไป — พิมพ์แทน`);
    return false;
  }
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.facebook.com' }).catch(() => {});
    const wrote = await page
      .evaluate(async (text) => {
        await navigator.clipboard.writeText(text);
        return true;
      }, caption)
      .catch(() => false);
    if (!wrote) {
      console.log(`⚠️ [${userLabel}] เขียนคลิปบอร์ดไม่ได้ — พิมพ์แทน`);
      return false;
    }
    await humanPause(page, 700, 1800);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await humanPause(page, 900, 1600);
  } finally {
    release();
  }

  const got = await editor.innerText().catch(() => '');
  if (pastedMatches(got, caption)) {
    console.log(`📋 [${userLabel}] วางข้อความประกาศแล้ว`);
    return true;
  }
  console.log(`⚠️ [${userLabel}] ข้อความที่วางไม่ตรงประกาศของงานนี้ — ลบแล้วพิมพ์แทน`);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await humanPause(page, 300, 700);
  return false;
}
