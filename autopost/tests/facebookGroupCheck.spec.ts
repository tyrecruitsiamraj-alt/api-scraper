import type { Page } from '@playwright/test';
import { test } from './humanBrowser.fixture';
import { facebookLogin, loadDynamicConfig, runLog, humanPause, isAccountLimitedMessage } from '../src/helpers';
import { randomInt } from '../src/helpers/humanBehavior';
import { ensureGroupMembership, readGroupPageHint, type MembershipState } from '../src/helpers/groupMembership';
import { PLACEHOLDER_GROUP_NAME, readGroupName, rememberGroupName } from '../src/helpers/groupName';

/**
 * เช็กกลุ่มของบัญชี (เจ้าของ 19 พ.ย. 2569: "บัญชี ก เข้าร่วมแล้วกี่กลุ่ม กลุ่มไหนยังไม่เข้า") — ไม่โพสต์
 * 1) เปิดหน้า "กลุ่มของคุณ" ครั้งเดียว อ่านทุกกลุ่มที่บัญชีเป็นสมาชิก → เทียบกับกลุ่มในระบบ
 * 2) กดเข้าร่วมกลุ่มที่ยังไม่เข้าไม่เกิน GROUPCHECK_JOINS_PER_DAY (ค่าเริ่ม 3) · อ่านชื่อจริงของกลุ่มที่ยังชื่อ "Group <เลข>"
 * เหตุ: 120 กลุ่มที่เพิ่มด้วยเลขกลุ่ม 13–17 พ.ย. ไม่มีบัญชีไหนเปิดเลย · กดเข้าร่วมตอนโพสต์ได้แค่กลุ่มที่ใบสั่งเลือก
 * บันทึกรอบใช้ level 'info'/'warn' เท่านั้น — 'success' ถูกนับเป็นวันโพสต์แรก (อายุบัญชี)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require('../server/db');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { joinedGroupToken } = require('../server/joined-groups') as { joinedGroupToken: (href: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { groupSlugFromUrl } = require('../server/group-post-link') as { groupSlugFromUrl: (url: string) => string };

const JOINED_LIST_URL = 'https://www.facebook.com/groups/joins/?nav_source=tab';
/** คำบนการ์ดที่ไม่ใช่ชื่อกลุ่ม */
const NOT_NAME = /^(ดูกลุ่ม|view group|เข้าร่วมแล้ว|joined|คุณโพสต์|you last|last visited|เข้าชมล่าสุด|\d+\s)/i;

function joinsPerDay(): number {
  const n = Number(process.env.GROUPCHECK_JOINS_PER_DAY);
  return Number.isFinite(n) && n >= 0 ? Math.min(10, Math.floor(n)) : 3;
}

/** เลื่อนหน้ารายชื่อจนไม่มีกลุ่มใหม่โผล่ 3 รอบติด แล้วคืน [{ token, name }] ทั้งหมด */
async function readJoinedGroups(page: Page): Promise<{ entries: { token: string; name: string }[]; headerCount: number | null }> {
  const found = new Map<string, string>();
  const collect = async () => {
    const links = await page
      .locator('div[role="main"] a[href*="/groups/"]')
      .evaluateAll((els) => els.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLElement).innerText || '' })))
      .catch(() => [] as { href: string; text: string }[]);
    for (const l of links) {
      const token = joinedGroupToken(l.href);
      if (!token) continue;
      const name = String(l.text).split('\n').map((s) => s.trim()).find((s) => s.length >= 2 && !NOT_NAME.test(s)) || '';
      if (!found.has(token) || (!found.get(token) && name)) found.set(token, name);
    }
  };
  let still = 0;
  for (let i = 0; i < 60 && still < 3; i++) {
    const before = found.size;
    await collect();
    still = found.size === before ? still + 1 : 0;
    await page.mouse.wheel(0, randomInt(900, 1600)).catch(() => {});
    await humanPause(page, 1500, 3000);
  }
  await collect();
  const header = await page.locator('div[role="main"]').first().innerText({ timeout: 3000 }).catch(() => '');
  const m = /(?:กลุ่มทั้งหมดที่คุณเข้าร่วม|All groups you've joined)\s*\((\d+)\)/i.exec(header);
  return { entries: [...found.entries()].map(([token, name]) => ({ token, name })), headerCount: m ? Number(m[1]) : null };
}

const JOIN_TO_STATE: Record<Exclude<MembershipState, 'limit'>, string> = {
  member: 'member',
  visitor: 'visitor',
  joined: 'member',
  pending: 'pending',
  questions: 'questions',
  unknown: 'unknown',
};

test('เช็กกลุ่มของบัญชี: อ่านกลุ่มที่เข้าแล้ว + กดเข้าร่วมกลุ่มที่ยังไม่เข้า (ไม่โพสต์)', async ({ page }) => {
  const userId = String(process.env.GROUPCHECK_USER_ID || '').trim();
  if (!userId) throw new Error('งานเช็กกลุ่มไม่มี GROUPCHECK_USER_ID');
  if (!process.env.DATABASE_URL) throw new Error('งานเช็กกลุ่มต้องรันบนเครื่องที่ต่อฐานข้อมูลตรง (DATABASE_URL)');

  const config = await loadDynamicConfig();
  const user = config.users.find((item) => String(item.id) === userId);
  if (!user) throw new Error(`ไม่พบบัญชี Facebook ${userId}`);
  if (!user.email || !user.password) throw new Error('บัญชี Facebook ยังไม่มี Email/Password บนเครื่องที่ผูกไว้');
  const maxJoins = joinsPerDay();
  test.setTimeout((10 + maxJoins * 4) * 60 * 1000);

  const label = user.name || user.id;
  const activePage = await facebookLogin(page, user.email, user.password, {
    userLabel: label,
    sessionKey: String(user.env_key || user.id || user.email || 'default'),
    checkpointWaitMinutes: 2,
  });
  await activePage.goto(JOINED_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  let path = activePage.url();
  try {
    path = new URL(activePage.url()).pathname;
  } catch {
    /* ใช้ทั้งลิงก์ */
  }
  if (/login|checkpoint|noLogIn|recover|verification/i.test(path)) {
    throw new Error(`บัญชียังเข้า Facebook ไม่ได้ (${activePage.url()}) — ยังไม่ผ่านการยืนยันตัวตน`);
  }
  await humanPause(activePage, 2500, 5000);

  const { entries, headerCount } = await readJoinedGroups(activePage);
  if (!entries.length) {
    // อ่านไม่ได้ = ไม่รู้ว่าอยู่กลุ่มไหน → ไม่กดเข้าร่วมรอบนี้ (กันกดกลุ่มที่เป็นสมาชิกอยู่แล้ว)
    const msg = 'เช็กกลุ่มของบัญชี: อ่านรายชื่อกลุ่มที่เข้าร่วมแล้วไม่ได้ ไม่ได้กดเข้าร่วมกลุ่มไหน';
    console.log(`⚠️ [${label}] ${msg}`);
    await runLog({ level: 'warn', message: msg, user_id: user.id, meta: { kind: 'group_check', read: 0 } });
    return;
  }
  const saved = await db.saveJoinedGroupsList(user.id, entries);
  const partial = headerCount != null && headerCount > entries.length ? ` · Facebook บอก ${headerCount} กลุ่ม อ่านได้ ${entries.length}` : '';
  const listMsg = `เช็กกลุ่มของบัญชี: เป็นสมาชิก ${saved.member} จาก ${saved.total} กลุ่มในระบบ (บัญชีอยู่ทั้งหมด ${entries.length} กลุ่มบน Facebook${partial})`;
  console.log(`📋 [${label}] ${listMsg}`);
  await runLog({
    level: 'info',
    message: listMsg,
    user_id: user.id,
    meta: { kind: 'group_check', read: entries.length, header_count: headerCount, member: saved.member, total: saved.total, names: saved.names },
  });

  const targets: { fb_group_id: string; name: string | null }[] = await db.pickGroupsToJoin(user.id, maxJoins);
  const budget = { used: 0, max: targets.length };
  const tally: Record<string, number> = {};
  for (const [i, g] of targets.entries()) {
    if (i > 0) await humanPause(activePage, 60_000, 150_000);
    try {
      await activePage.goto(`https://www.facebook.com/groups/${g.fb_group_id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await humanPause(activePage, 3000, 6000);
      await db.saveGroupSlug(g.fb_group_id, groupSlugFromUrl(activePage.url())).catch(() => false);
      if (!g.name || PLACEHOLDER_GROUP_NAME.test(String(g.name).trim())) {
        await rememberGroupName(g.fb_group_id, await readGroupName(activePage));
      }
      // โพสต์ได้โดยไม่ต้องเข้า ก็กดเข้าร่วมด้วย (เจ้าของเคาะ 20 พ.ย. 2569) — โพสต์ของสมาชิกมักไม่ต้องรออนุมัติ
      const state = await ensureGroupMembership(activePage, budget, String(label), { joinWhenVisitor: true });
      if (state === 'limit') break;
      const hint = state === 'unknown' ? await readGroupPageHint(activePage) : '';
      await db.recordGroupMembership(user.id, g.fb_group_id, JOIN_TO_STATE[state], hint || null, { joinTried: true });
      tally[state] = (tally[state] || 0) + 1;
      const dialogs = await activePage.locator('[role="dialog"], [role="alertdialog"]').allInnerTexts().catch(() => [] as string[]);
      if (dialogs.some((t) => isAccountLimitedMessage(t))) {
        const warn = 'เช็กกลุ่มของบัญชี: Facebook ขึ้นว่าจำกัดการใช้งานตอนกดเข้าร่วมกลุ่ม — หยุดกดเข้าร่วม';
        console.log(`⚠️ [${label}] ${warn}`);
        await runLog({ level: 'warn', message: warn, user_id: user.id, group_id: g.fb_group_id, meta: { kind: 'group_check_limited' } });
        break;
      }
    } catch (e) {
      console.warn(`[group-check] เปิดกลุ่ม ${g.fb_group_id} ไม่ได้: ${(e as Error).message}`);
    }
  }
  if (targets.length) {
    const words: Record<string, string> = { member: 'เป็นสมาชิกอยู่แล้ว', visitor: 'กดแล้วยังไม่ได้เข้า', joined: 'เข้าร่วมได้เลย', pending: 'รอแอดมินอนุมัติ', questions: 'ต้องตอบคำถามเอง', unknown: 'ไม่เจอปุ่มเข้าร่วม' };
    const parts = Object.entries(tally).map(([k, n]) => `${words[k] || k} ${n}`);
    const msg = `เช็กกลุ่มของบัญชี: กดเข้าร่วม ${budget.used} กลุ่ม${parts.length ? ` (${parts.join(' · ')})` : ''} (ไม่โพสต์)`;
    console.log(`🤝 [${label}] ${msg}`);
    await runLog({ level: 'info', message: msg, user_id: user.id, meta: { kind: 'group_check_join', tried: budget.used, ...tally } });
  }
});
