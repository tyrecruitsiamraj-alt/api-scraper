import type { Page } from '@playwright/test';
import { humanClick, humanPause } from './humanBehavior';

/**
 * สถานะการเป็นสมาชิกกลุ่มก่อนโพสต์
 *  member     = เห็นช่องเขียนโพสต์อยู่แล้ว
 *  joined     = กดเข้าร่วมแล้วได้เป็นสมาชิกทันที → โพสต์ต่อได้
 *  pending    = ส่งคำขอแล้ว (หรือเคยส่งไว้) รอแอดมินอนุมัติ → ข้ามรอบนี้
 *  questions  = กลุ่มให้ตอบคำถามก่อนเข้า — บอทไม่ตอบแทน ปิดหน้าต่างแล้วข้าม
 *  limit      = กดเข้าร่วมครบโควต้าของรอบนี้แล้ว → ข้าม
 *  unknown    = ไม่เจอทั้งช่องโพสต์และปุ่มเข้าร่วม
 */
export type MembershipState = 'member' | 'joined' | 'pending' | 'questions' | 'limit' | 'unknown';

/** โควต้ากดเข้าร่วมกลุ่มต่อรอบโพสต์ — กดหลายกลุ่มรวดเดียว Facebook มักมองว่าเป็นสแปม */
export function maxJoinsPerRun(): number {
  const n = Number(process.env.AUTO_JOIN_MAX_PER_RUN);
  return Number.isFinite(n) && n >= 0 ? Math.min(20, Math.floor(n)) : 5;
}

export const MEMBERSHIP_MESSAGE: Record<Exclude<MembershipState, 'member'>, string> = {
  joined: 'ยังไม่ได้เป็นสมาชิก ระบบกดเข้าร่วมกลุ่มให้แล้ว',
  pending: 'ยังไม่ได้เป็นสมาชิก ส่งคำขอเข้ากลุ่มแล้ว รอแอดมินอนุมัติ',
  questions: 'ยังไม่ได้เป็นสมาชิก กลุ่มให้ตอบคำถามก่อนเข้า ต้องเข้าร่วมเอง',
  limit: 'ยังไม่ได้เป็นสมาชิก รอบนี้กดเข้าร่วมกลุ่มครบโควต้าแล้ว',
  unknown: 'ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม',
};

/** ช่องเขียนโพสต์ในหน้ากลุ่ม — Facebook ใช้หลายคำ (ไทย/อังกฤษ) และบางทีมีแค่ aria-label */
export const COMPOSER_TRIGGER = [
  'div[role="button"]:has-text("เขียนอะไรสักหน่อย")',
  'div[role="button"]:has-text("เขียนบางอย่าง")',
  'div[role="button"]:has-text("สร้างโพสต์สาธารณะ")',
  'div[role="button"]:has-text("Write something")',
  'div[role="button"]:has-text("Create a public post")',
  'div[role="button"][aria-label*="เขียนอะไร"]',
  'div[role="button"][aria-label*="สร้างโพสต์"]',
  'div[role="button"][aria-label*="Write something"]',
  'div[role="button"][aria-label*="Create a public post"]',
].join(', ');
const JOIN_BUTTON =
  'div[role="button"]:has-text("เข้าร่วมกลุ่ม"), div[role="button"][aria-label="เข้าร่วมกลุ่ม"], div[role="button"]:has-text("Join group"), div[role="button"][aria-label="Join group"]';
const PENDING_MARK =
  'div[role="button"]:has-text("ยกเลิกคำขอ"), div[role="button"]:has-text("Cancel request"), div[role="button"]:has-text("รอดำเนินการ"), div[role="button"]:has-text("Pending")';
const QUESTIONS_DIALOG_TEXT = /ตอบคำถาม|คำถามสำหรับการเป็นสมาชิก|Answer questions|membership questions/i;

async function visible(page: Page, selector: string, timeout: number): Promise<boolean> {
  return page.locator(selector).first().isVisible({ timeout }).catch(() => false);
}

/**
 * ตรวจว่าเป็นสมาชิกกลุ่มหรือยัง ถ้ายังและยังมีโควต้า กดเข้าร่วมให้
 * @param budget ตัวนับโควต้าของรอบนี้ (ใช้ร่วมกันทุกกลุ่มในรอบ)
 */
export async function ensureGroupMembership(
  page: Page,
  budget: { used: number; max: number },
  userLabel: string,
): Promise<MembershipState> {
  if (await visible(page, COMPOSER_TRIGGER, 10000)) return 'member';
  if (await visible(page, PENDING_MARK, 1500)) return 'pending';
  const join = page.locator(JOIN_BUTTON).first();
  if (!(await join.isVisible({ timeout: 3000 }).catch(() => false))) return 'unknown';
  if (budget.used >= budget.max) return 'limit';

  budget.used += 1;
  console.log(`🤝 [${userLabel}] ยังไม่ได้เป็นสมาชิก — กดเข้าร่วมกลุ่ม (${budget.used}/${budget.max} ของรอบนี้)`);
  await humanPause(page, 600, 1400);
  await humanClick(page, join);
  await page.waitForTimeout(3500);

  // กลุ่มที่ให้ตอบคำถาม: เปิดหน้าต่างคำถามขึ้นมา — ไม่ตอบแทน ปิดแล้วข้าม
  const dialog = page.locator('div[role="dialog"]').last();
  const dialogText = (await dialog.innerText({ timeout: 1500 }).catch(() => '')) || '';
  if (QUESTIONS_DIALOG_TEXT.test(dialogText)) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    // บางกลุ่มส่งคำขอไปแล้วแม้ยังไม่ตอบ — ถ้าเห็นปุ่มยกเลิกคำขอถือว่ารออนุมัติ
    return (await visible(page, PENDING_MARK, 1500)) ? 'pending' : 'questions';
  }
  if (await visible(page, PENDING_MARK, 4000)) return 'pending';
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  if (await visible(page, COMPOSER_TRIGGER, 10000)) return 'joined';
  return (await visible(page, PENDING_MARK, 1500)) ? 'pending' : 'unknown';
}

/** ข้อความบนหน้ากลุ่มที่น่าจะบอกเหตุผลว่าทำไมไม่มีช่องโพสต์ (ใช้เขียน log) */
export async function readGroupPageHint(page: Page): Promise<string> {
  const text = await page
    .locator('div[role="main"]')
    .first()
    .innerText({ timeout: 3000 })
    .catch(() => '');
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && line.length <= 160);
  const hint =
    lines.find((line) => /โพสต์|อนุมัติ|แอดมิน|ผู้ดูแล|จำกัด|ปิด|ถูกระงับ|ส่วนตัว|post|approv|admin|restrict|paused|private/i.test(line)) ||
    lines.slice(0, 2).join(' / ');
  // วงเล็บตัดท้ายข้อความในหน้าเว็บ — เปลี่ยนเป็นวงเล็บเหลี่ยม
  return hint.replace(/[()]/g, (c) => (c === '(' ? '[' : ']')).slice(0, 160);
}
