import type { Locator, Page } from '@playwright/test';
import { humanClick, humanPause } from './humanBehavior';

/**
 * สถานะการเป็นสมาชิกกลุ่มก่อนโพสต์
 *  member     = เห็นช่องเขียนโพสต์ และไม่มีปุ่มเข้าร่วมกลุ่ม
 *  visitor    = เห็นช่องเขียนโพสต์ แต่ยังมีปุ่มเข้าร่วมกลุ่ม — กลุ่มสาธารณะที่โพสต์ได้โดยไม่ต้องเป็นสมาชิก (ยังไม่ได้เข้า)
 *  joined     = กดเข้าร่วมแล้วได้เป็นสมาชิกทันที → โพสต์ต่อได้
 *  pending    = ส่งคำขอแล้ว (หรือเคยส่งไว้) รอแอดมินอนุมัติ → ข้ามรอบนี้
 *  questions  = กลุ่มให้ตอบคำถามก่อนเข้า — บอทไม่ตอบแทน ปิดหน้าต่างแล้วข้าม
 *  limit      = กดเข้าร่วมครบโควต้าของรอบนี้แล้ว → ข้าม
 *  unknown    = ไม่เจอทั้งช่องโพสต์และปุ่มเข้าร่วม
 */
export type MembershipState = 'member' | 'visitor' | 'joined' | 'pending' | 'questions' | 'limit' | 'unknown';

/** โควต้ากดเข้าร่วมกลุ่มต่อรอบโพสต์ — กดหลายกลุ่มรวดเดียว Facebook มักมองว่าเป็นสแปม */
export function maxJoinsPerRun(): number {
  const n = Number(process.env.AUTO_JOIN_MAX_PER_RUN);
  return Number.isFinite(n) && n >= 0 ? Math.min(20, Math.floor(n)) : 5;
}

export const MEMBERSHIP_MESSAGE: Record<Exclude<MembershipState, 'member'>, string> = {
  visitor: 'ยังไม่ได้เป็นสมาชิก แต่กลุ่มนี้โพสต์ได้โดยไม่ต้องเข้าร่วม',
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
 * ปุ่ม "เข้าร่วมกลุ่ม" ของกลุ่มนี้ (อยู่ส่วนหัวกลุ่ม ช่วงบนของหน้า) — ปุ่มเข้าร่วมของ "กลุ่มแนะนำ" ในฟีดด้านล่างไม่นับ
 * (กดผิดปุ่ม = บัญชีไปเข้ากลุ่มที่ไม่เกี่ยว)
 */
async function headerJoinButton(page: Page): Promise<Locator | null> {
  const all = page.locator(JOIN_BUTTON);
  const n = Math.min(await all.count().catch(() => 0), 6);
  for (let i = 0; i < n; i += 1) {
    const btn = all.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const top = await btn.evaluate((el) => el.getBoundingClientRect().top + window.scrollY).catch(() => Infinity);
    if (top < 900) return btn;
  }
  return null;
}

/**
 * ตรวจว่าเป็นสมาชิกกลุ่มหรือยัง ถ้ายังและยังมีโควต้า กดเข้าร่วมให้
 * 20 พ.ย. 2569: เดิมเห็นช่องเขียนโพสต์ = ตีว่าเป็นสมาชิกทันที กลุ่มสาธารณะที่โพสต์ได้โดยไม่ต้องเข้าจึงถูกนับว่าเข้าแล้ว
 * รอบเช็กกลุ่ม 12 รอบไม่เคยกดเข้าร่วมสักกลุ่ม ("เป็นสมาชิกอยู่แล้ว 3" ทุกรอบ) → ดูปุ่มเข้าร่วมที่หัวกลุ่มด้วย
 * @param budget ตัวนับโควต้าของรอบนี้ (ใช้ร่วมกันทุกกลุ่มในรอบ)
 * @param opts.joinWhenVisitor รอบเช็กกลุ่ม = กดเข้าร่วมแม้โพสต์ได้อยู่แล้ว (เจ้าของเคาะ 20 พ.ย. 2569) · รอบโพสต์ไม่กด โพสต์ต่อเลย
 */
export async function ensureGroupMembership(
  page: Page,
  budget: { used: number; max: number },
  userLabel: string,
  opts: { joinWhenVisitor?: boolean } = {},
): Promise<MembershipState> {
  const canPost = await visible(page, COMPOSER_TRIGGER, 10000);
  const join = await headerJoinButton(page);
  if (canPost && !join) return 'member';
  if (canPost && !opts.joinWhenVisitor) return 'visitor';
  if (!canPost && (await visible(page, PENDING_MARK, 1500))) return 'pending';
  if (!join) return 'unknown';
  if (budget.used >= budget.max) return canPost ? 'visitor' : 'limit';

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
  if (await visible(page, PENDING_MARK, 1500)) return 'pending';
  const stillJoin = await headerJoinButton(page);
  if (await visible(page, COMPOSER_TRIGGER, 10000)) return stillJoin ? 'visitor' : 'joined';
  return 'unknown';
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

/**
 * จดสถานะสมาชิกกลุ่มของบัญชีลงตาราง group_memberships (หน้าเว็บนับ "บัญชีนี้เข้าร่วมแล้วกี่กลุ่ม")
 * เครื่องที่ไม่ต่อฐานตรง / บันทึกไม่ได้ = ข้ามเงียบ ๆ ไม่ให้งานโพสต์พัง
 */
export async function rememberMembership(userId: string, fbGroupId: string, state: MembershipState, note: string | null = null): Promise<void> {
  if (state === 'limit' || !process.env.DATABASE_URL) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../../server/db');
    // visitor จากรอบโพสต์ = ไม่ได้กดเข้าร่วม (แค่เห็นว่าโพสต์ได้) ไม่นับว่าลองเข้าแล้ว
    await db.recordGroupMembership(userId, fbGroupId, state === 'joined' ? 'member' : state, note, { joinTried: state !== 'member' && state !== 'visitor' });
  } catch (e) {
    console.warn(`[membership] บันทึกสถานะสมาชิกกลุ่ม ${fbGroupId} ไม่ได้: ${(e as Error).message}`);
  }
}
