import type { Page } from '@playwright/test';

/** ชื่อชั่วคราวตอนเพิ่มกลุ่มด้วยเลขกลุ่ม — ยังไม่ใช่ชื่อจริงบน Facebook */
export const PLACEHOLDER_GROUP_NAME = /^Group\s+\d+$/i;

/** ข้อความที่ไม่ใช่ชื่อกลุ่ม (หน้า error / ยังไม่ล็อกอิน / ค่าเริ่มต้นตอนอ่านไม่ได้) */
const NOT_A_NAME = /^(facebook|กลุ่มส่วนตัว|private group|notifications|การแจ้งเตือน)$|ไม่พร้อมใช้งาน|isn.?t available|not available|เข้าสู่ระบบ|log in/i;

/** "(12) งานขับรถ หางานขับรถ | Facebook" → "งานขับรถ หางานขับรถ" ; คืน null ถ้าไม่ใช่ชื่อกลุ่ม */
export function cleanGroupName(raw: string | null | undefined): string | null {
  const name = String(raw ?? '')
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s*\|\s*Facebook\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 150) return null;
  if (NOT_A_NAME.test(name) || PLACEHOLDER_GROUP_NAME.test(name)) return null;
  return name;
}

/** อ่านชื่อกลุ่มจากหน้ากลุ่มที่เปิดอยู่: h1 ก่อน แล้วค่อยใช้ชื่อแท็บ */
export async function readGroupName(page: Page): Promise<string | null> {
  const h1 = await page.locator('div[role="main"] h1, h1').first().innerText({ timeout: 5000 }).catch(() => '');
  return cleanGroupName(h1) ?? cleanGroupName(await page.title().catch(() => ''));
}

/** บันทึกชื่อกลุ่มลงตาราง groups (อ่านไม่ได้/บันทึกไม่ได้ = ข้ามเงียบ ๆ ไม่ให้งานโพสต์พัง) */
export async function rememberGroupName(fbGroupId: string, name: string | null): Promise<boolean> {
  if (!name || !process.env.DATABASE_URL) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../../server/db');
    return Boolean(await db.saveGroupName(String(fbGroupId), name));
  } catch (e) {
    console.warn(`[group-name] บันทึกชื่อกลุ่ม ${fbGroupId} ไม่ได้: ${(e as Error).message}`);
    return false;
  }
}
