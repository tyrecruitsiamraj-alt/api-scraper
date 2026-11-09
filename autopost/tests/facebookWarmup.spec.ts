import type { Page } from '@playwright/test';
import { test } from './humanBrowser.fixture';
import { facebookLogin, loadDynamicConfig, runLog, humanPause, humanClick, isAccountLimitedMessage } from '../src/helpers';
import { randomInt } from '../src/helpers/humanBehavior';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { warmupSessionPlan } = require('../server/post-pacing') as {
  warmupSessionPlan: () => { feed_sec: number; groups: number; group_sec: number; likes: number };
};

/**
 * อุ่นเครื่องบัญชีใหม่ (เจ้าของเคาะ 9 พ.ย. 2569) — เลื่อนฟีด เข้าดูกลุ่ม กดถูกใจบ้าง · ไม่โพสต์ ไม่คอมเมนต์ ไม่แชร์
 * เหตุ: บัญชีชุด 28 ต.ค. ไม่เคยทำอะไรนอกจากโพสต์ แล้วโดนจำกัด 29 จาก 34 บัญชีในสัปดาห์แรก
 * บันทึกรอบใช้ level 'info' เท่านั้น — 'success' ถูกนับเป็นวันโพสต์แรก (อายุบัญชี)
 */

const LIKE_SEL = 'div[role="button"][aria-label="ถูกใจ"], div[role="button"][aria-label="Like"]';

/** เลื่อนหน้าแบบคนอ่าน: เลื่อนลงทีละช่วง หยุดอ่าน บางทีเลื่อนขึ้นนิดหน่อย */
async function scrollFor(page: Page, seconds: number, onPause?: () => Promise<void>) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    await page.mouse.wheel(0, randomInt(250, 700)).catch(() => {});
    await humanPause(page, 1500, 6000);
    if (Math.random() < 0.15) {
      await page.mouse.wheel(0, -randomInt(100, 300)).catch(() => {});
      await humanPause(page, 800, 2000);
    }
    if (Math.random() < 0.1) await humanPause(page, 6000, 15000);
    if (onPause) await onPause();
  }
}

/** กดถูกใจโพสต์ที่อยู่บนจอ 1 โพสต์ · คืน 'liked' | 'none' | 'limited' (Facebook ขึ้นว่าจำกัด) */
async function likeOneVisible(page: Page): Promise<'liked' | 'none' | 'limited'> {
  const viewport = page.viewportSize();
  const buttons = await page.locator(LIKE_SEL).all();
  for (const btn of buttons) {
    if ((await btn.getAttribute('aria-pressed').catch(() => null)) === 'true') continue;
    const box = await btn.boundingBox().catch(() => null);
    if (!box || !viewport || box.y < 80 || box.y + box.height > viewport.height - 40) continue;
    await humanClick(page, btn);
    await humanPause(page, 1500, 3000);
    const dialog = await page.locator('[role="dialog"], [role="alertdialog"]').allInnerTexts().catch(() => [] as string[]);
    if (dialog.some((t) => isAccountLimitedMessage(t))) {
      await page.keyboard.press('Escape').catch(() => {});
      return 'limited';
    }
    return 'liked';
  }
  return 'none';
}

test('อุ่นเครื่องบัญชีใหม่: เลื่อนฟีด เข้าดูกลุ่ม กดถูกใจ (ไม่โพสต์)', async ({ page }) => {
  const userId = String(process.env.WARMUP_USER_ID || '').trim();
  if (!userId) throw new Error('งานอุ่นเครื่องไม่มี WARMUP_USER_ID');

  const config = await loadDynamicConfig();
  const user = config.users.find((item) => String(item.id) === userId);
  if (!user) throw new Error(`ไม่พบบัญชี Facebook ${userId}`);
  if (!user.email || !user.password) throw new Error('บัญชี Facebook ยังไม่มี Email/Password บนเครื่องที่ผูกไว้');

  // กลุ่มที่บัญชีนี้เกี่ยวข้อง: กลุ่มประจำ หรือกลุ่มจากงานโพสต์ของบัญชี (แบบเดียวกับ facebookPreflight)
  const homeIds = new Set((Array.isArray(user.group_ids) ? user.group_ids : []).map(String));
  const orderIds = new Set(
    config.assignments
      .filter((a) => String(a.user_id) === userId)
      .flatMap((a) => (Array.isArray(a.group_ids) ? a.group_ids.map(String) : [])),
  );
  const pool = config.groups.filter((g) => g.fb_group_id && (homeIds.has(String(g.id)) || orderIds.has(String(g.id))));

  const plan = warmupSessionPlan();
  const groups = [...pool].sort(() => Math.random() - 0.5).slice(0, plan.groups);
  test.setTimeout((plan.feed_sec + groups.length * (plan.group_sec + 60) + 5 * 60) * 1000);

  const label = user.name || user.id;
  const activePage = await facebookLogin(page, user.email, user.password, {
    userLabel: label,
    sessionKey: String(user.env_key || user.id || user.email || 'default'),
    checkpointWaitMinutes: 2,
  });
  await activePage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  let path = activePage.url();
  try {
    path = new URL(activePage.url()).pathname;
  } catch {
    /* ใช้ทั้งลิงก์ */
  }
  if (/login|checkpoint|noLogIn|recover|verification/i.test(path)) {
    throw new Error(`บัญชียังเข้า Facebook ไม่ได้ (${activePage.url()}) — ยังไม่ผ่านการยืนยันตัวตน`);
  }
  await humanPause(activePage, 2000, 4000);

  // ฟีดช่วงแรก + กดถูกใจตามแผน (กดเป็นช่วง ๆ ไม่รัว)
  let liked = 0;
  let limited = false;
  const firstFeed = Math.round(plan.feed_sec * 0.6);
  await scrollFor(activePage, firstFeed, async () => {
    if (limited || liked >= plan.likes || Math.random() > 0.2) return;
    const r = await likeOneVisible(activePage);
    if (r === 'liked') liked += 1;
    if (r === 'limited') limited = true;
  });

  let visited = 0;
  for (const g of groups) {
    try {
      await activePage.goto(`https://www.facebook.com/groups/${g.fb_group_id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await humanPause(activePage, 2000, 4000);
      await scrollFor(activePage, plan.group_sec);
      visited += 1;
    } catch (e) {
      console.warn(`[warmup] เปิดกลุ่ม ${g.fb_group_id} ไม่ได้: ${(e as Error).message}`);
    }
  }

  await activePage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
  await scrollFor(activePage, plan.feed_sec - firstFeed);

  const minutes = Math.round((plan.feed_sec + visited * plan.group_sec) / 60);
  const msg = `อุ่นเครื่องบัญชี: เลื่อนฟีดและดูกลุ่มราว ${minutes} นาที · เข้าดู ${visited} กลุ่ม · กดถูกใจ ${liked} โพสต์ (ไม่โพสต์)`;
  console.log(`🔥 [${label}] ${msg}`);
  await runLog({ level: 'info', message: msg, user_id: user.id, meta: { kind: 'warmup', groups: visited, likes: liked } });
  if (limited) {
    const warn = 'อุ่นเครื่องบัญชี: Facebook ขึ้นว่าจำกัดการใช้งานตอนกดถูกใจ — หยุดกดถูกใจ';
    console.log(`⚠️ [${label}] ${warn}`);
    await runLog({ level: 'warn', message: warn, user_id: user.id, meta: { kind: 'warmup_limited' } });
  }
});
