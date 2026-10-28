import type { Page, Locator } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { PostItem } from '../types/config';
import { postLog } from './postLog';

/** ตรงกับสคริปต์ต้นฉบับ — จับ aria-label บนลิงก์เวลา */
const ARIA_RECENT_RE = /วินาที|นาที|เมื่อสักครู่|just now|secs|mins/i;

/** รองรับข้อความเวลาใน title/ข้อความลิงก์ (เช่น FB ภาษาไทย) */
const RECENT_LABEL_RE =
  /วินาที|นาที|เมื่อสักครู่|เมื่อวาน|just now|secs?|mins?|minutes?|hours?|ชม\.?|hr\.?|m\b|s\b|\d+\s*นาที|\d+\s*วินาที/i;

function normalizeFbHref(href: string): string {
  const raw = href.split('?')[0];
  return raw.startsWith('http') ? raw : `https://www.facebook.com${raw}`;
}

function hrefIsGroupPostToGroup(href: string, gID: string): boolean {
  if (!href || !gID) return false;
  const esc = gID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // รองรับหลายรูปแบบ:
  // - /groups/{gID}/posts/{postId}
  // - /groups/{gID}/permalink/{postId}
  // - ?story_fbid={postId}&id={gID}
  if (new RegExp(`/groups/${esc}/posts/`, 'i').test(href)) return true;
  if (new RegExp(`/groups/${esc}/permalink/`, 'i').test(href)) return true;
  try {
    const u = new URL(href.startsWith('http') ? href : `https://www.facebook.com${href}`);
    const story = u.searchParams.get('story_fbid');
    const id = u.searchParams.get('id');
    if (story && id && String(id) === String(gID)) return true;
  } catch {
    // ignore parse errors
  }
  return false;
}

/** ลิงก์โปรไฟล์/กิจกรรมของสมาชิกในกลุ่ม — ไม่ใช่ permalink โพสต์ (มักถูกจับผิดตอนอ่าน aria-label เวลา) */
function hrefIsGroupMemberProfileOrActivity(href: string): boolean {
  return /\/groups\/\d+\/user\//i.test(href);
}

/** ใช้เฉพาะลิงก์ที่ชี้ไปโพสต์ในกลุ่มนี้จริง ๆ */
function isValidGroupPostHref(href: string, gID: string): boolean {
  if (!href || hrefIsGroupMemberProfileOrActivity(href)) return false;
  // ต้องส่ง href แบบเดิม (มี query ได้) เพื่อรองรับ story_fbid&id
  const u = normalizeFbHref(href);
  return hrefIsGroupPostToGroup(u, gID);
}

/** เมื่อลิงก์เวลาไปผิดที่ — ดึง permalink จากลิงก์ /groups/{gID}/posts/ ใน article เดียวกัน */
async function findGroupPostPermalinkInArticle(article: Locator, gID: string): Promise<string | null> {
  const sels = [
    `a[href*="/groups/${gID}/posts/"]`,
    `a[href*="/groups/${gID}/permalink/"]`,
    `a[href*="story_fbid"][href*="id=${gID}"]`,
    `a[href*="story_fbid"][href*="id%3D${gID}"]`,
  ];
  for (const sel of sels) {
    const links = article.locator(sel);
    const n = await links.count();
    const maxK = Math.min(n, 12);
    for (let k = 0; k < maxK; k++) {
      const link = links.nth(k);
      const href = await link.getAttribute('href').catch(() => null);
      if (href && isValidGroupPostHref(href, gID)) {
        return normalizeFbHref(href).split('?')[0];
      }
    }
  }
  return null;
}

async function linkTimeBlob(link: Locator): Promise<string> {
  const [label, title, text] = await Promise.all([
    link.getAttribute('aria-label').catch(() => ''),
    link.getAttribute('title').catch(() => ''),
    link.innerText().catch(() => ''),
  ]);
  return `${label || ''} ${title || ''} ${text || ''}`.trim();
}
const SHEET_POST_TIMEOUT_MS = Math.min(120000, Math.max(5000, Number(process.env.SHEET_POST_TIMEOUT_MS) || 45000));
/** ดีฟอลต์ 8000ms ตามสคริปต์เดิมที่ใช้ได้ */
const MY_CONTENT_WAIT_MS = Math.min(30000, Math.max(3000, Number(process.env.MY_CONTENT_WAIT_MS) || 8000));

function normalizeGroupName(raw: string): string {
  return raw
    .replace(/\u200b|\ufeff/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normLink(href: string): string {
  return normalizeFbHref(href).split('?')[0].replace(/\/$/, '');
}

function squashText(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** ให้คะแนนว่าโพสต์ตรงกับข้อความประกาศแค่ไหน: นับบรรทัดต้น ๆ ของประกาศ (ยาว ≥ 8 ตัว) ที่เจอในโพสต์ */
export function captionMatchScore(postText: string, caption: string): number {
  const text = squashText(postText);
  if (!text) return 0;
  const lines = String(caption || '')
    .split(/\n+/)
    .map((l) => squashText(l).slice(0, 40))
    .filter((l) => l.length >= 8)
    .slice(0, 6);
  return lines.filter((l) => text.includes(l)).length;
}

/** ลิงก์โพสต์ที่แถวอื่นในระบบใช้แล้วในกลุ่มนี้ (worker มี DATABASE_URL) — ห้ามหยิบซ้ำ */
async function loadKnownGroupLinks(gID: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!process.env.DATABASE_URL) return out;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../../server/db');
    const hints = await db.getFindLinkHints([gID], []);
    for (const l of hints.knownLinks[String(gID)] || []) out.add(normLink(l));
  } catch (e) {
    console.warn(`[saveToSheet] อ่านลิงก์เดิมของกลุ่ม ${gID} ไม่ได้: ${(e as Error).message}`);
  }
  return out;
}

export interface SaveToSheetOptions {
  assignmentId?: string;
  userId?: string;
  jobId?: string;
  groupId?: string;
  customerPhone?: string;
}

async function pushPostRecord(
  request: APIRequestContext,
  sheetUrl: string,
  posterName: string,
  postItem: PostItem,
  groupName: string,
  memberCount: string,
  finalLink: string,
  status: string,
  postLogOpts?: SaveToSheetOptions
): Promise<void> {
  console.log(`[saveToSheet] เจอลิงก์โพสต์ (${status}): ${finalLink}`);
  // ไม่มี sheet_url (บัญชีส่วนใหญ่) → ไม่ต้องยิง Sheet; ลิงก์ไปที่ post_logs อย่างเดียว
  if (sheetUrl) {
    await request
      .post(sheetUrl, {
        timeout: SHEET_POST_TIMEOUT_MS,
        data: {
          action: 'NEW_POST',
          posterName,
          owner: postItem.owner,
          jobTitle: postItem.title,
          company: postItem.company,
          groupName: normalizeGroupName(groupName),
          memberCount,
          postLink: finalLink,
          status,
        },
      })
      .catch((err) => {
        console.error('[saveToSheet] POST ไป Sheet ไม่สำเร็จ:', (err as Error).message);
      });
  }
  if (postLogOpts) {
    await postLog({
      poster_name: posterName,
      owner: postItem.owner,
      job_title: postItem.title,
      company: postItem.company,
      group_name: normalizeGroupName(groupName),
      member_count: memberCount,
      post_link: finalLink,
      post_status: status,
      comment_count: 0,
      customer_phone: postLogOpts.customerPhone,
      assignment_id: postLogOpts.assignmentId,
      user_id: postLogOpts.userId,
      job_id: postLogOpts.jobId,
      group_id: postLogOpts.groupId,
    });
  }
}

/**
 * สแกนหน้า my_posted / my_pending หลัง goto แล้ว (ลำดับและเวลารอตามสคริปต์ต้นฉบับ)
 */
/** กด Escape จนไม่มี dialog — ก่อน goto ไปหน้าอื่น */
async function ensureNoDialogBlockingNavigation(page: Page): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const vis = await page.locator('[role="dialog"]').first().isVisible({ timeout: 450 }).catch(() => false);
    if (!vis) return;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(350);
  }
}

/**
 * ดึงลิงก์จากฟีดกลุ่ม (fallback หลัง my_posted / my_pending ไม่เจอ)
 */
async function tryExtractLinkFromGroupFeed(page: Page, posterName: string, gID: string): Promise<string | null> {
  if (!posterName.trim()) return null;
  try {
    await page.waitForTimeout(1000);
    const main = page.locator('[role="main"]').first();
    await main
      .evaluate((el: HTMLElement) => {
        el.scrollTop = 0;
      })
      .catch(() => {});
    await page.waitForTimeout(400);

    const articles = main.locator('div[role="article"]');
    const ac = await articles.count();
    const maxArt = Math.min(ac, 14);
    for (let i = 0; i < maxArt; i++) {
      const art = articles.nth(i);
      const snippet = (await art.innerText().catch(() => '')).slice(0, 900);
      if (!snippet.includes(posterName)) continue;

      const links = art.locator('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]');
      const lc = await links.count();
      const maxL = Math.min(lc, 30);
      for (let j = 0; j < maxL; j++) {
        const link = links.nth(j);
        const href = await link.getAttribute('href').catch(() => null);
        if (!href) continue;
        const blob = await linkTimeBlob(link);
        const looksPost = href.includes('/posts/') || href.includes('permalink') || href.includes('story_fbid');
        if (!looksPost) continue;
        if (RECENT_LABEL_RE.test(blob)) {
          return normalizeFbHref(href).split('?')[0];
        }
      }

      if (i < 4) {
        const groupPostLinks = art.locator(`a[href*="/groups/${gID}/posts/"]`);
        const gc = await groupPostLinks.count();
        if (gc > 0) {
          const h = await groupPostLinks.first().getAttribute('href');
          if (h && hrefIsGroupPostToGroup(h, gID)) {
            return normalizeFbHref(h).split('?')[0];
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** ลิงก์โพสต์ล่าสุดใน article (ดูจากลิงก์เวลา "x นาที" แล้วค่อยหา permalink ใน article เดียวกัน) */
async function recentPostLinkInArticle(article: Locator, gID: string): Promise<string | null> {
  const allLinks = article.locator('a[role="link"]');
  const linkCount = Math.min(await allLinks.count(), 80);
  for (let j = 0; j < linkCount; j++) {
    const link = allLinks.nth(j);
    const href = await link.getAttribute('href').catch(() => null);
    if (!href) continue;
    const label = await link.getAttribute('aria-label').catch(() => null);
    const recent = (label && ARIA_RECENT_RE.test(label)) || RECENT_LABEL_RE.test(await linkTimeBlob(link));
    if (!recent) continue;
    const abs = isValidGroupPostHref(href, gID)
      ? normalizeFbHref(href).split('?')[0]
      : await findGroupPostPermalinkInArticle(article, gID);
    if (abs) return abs;
  }
  return null;
}

async function scanMyContentCurrentPage(
  page: Page,
  request: APIRequestContext,
  status: string,
  posterName: string,
  postItem: PostItem,
  groupName: string,
  memberCount: string,
  sheetUrl: string,
  gID: string,
  postLogOpts?: SaveToSheetOptions,
  knownLinks: Set<string> = new Set()
): Promise<boolean> {
  const articles = page.locator('div[role="article"]').filter({ hasText: posterName });
  const count = Math.min(await articles.count(), 20);
  const caption = String((postItem as { caption?: string }).caption || '');

  // เก็บทุกโพสต์ของเราที่เพิ่งโพสต์ แล้วเลือกตัวที่ข้อความตรงกับประกาศมากสุด
  // ลิงก์ที่แถวอื่นใช้แล้ว = โพสต์เก่าของเรา ไม่หยิบ (เคยหยิบผิดจนลิงก์ซ้ำ 4 โพสต์ 27 ต.ค. 2569)
  const candidates: Array<{ link: string; score: number; order: number }> = [];
  for (let i = 0; i < count; i++) {
    const article = articles.nth(i);
    const link = await recentPostLinkInArticle(article, gID);
    if (!link || knownLinks.has(normLink(link)) || candidates.some((c) => c.link === link)) continue;
    const score = caption ? captionMatchScore(await article.innerText().catch(() => ''), caption) : 0;
    candidates.push({ link, score, order: i });
  }

  if (candidates.length === 0 && count > 0) {
    const quick = articles.nth(0).locator(`a[href*="/groups/${gID}/posts/"]`).first();
    if (await quick.isVisible({ timeout: 2000 }).catch(() => false)) {
      const h = await quick.getAttribute('href');
      if (h && hrefIsGroupPostToGroup(h, gID) && !knownLinks.has(normLink(h))) {
        candidates.push({ link: normalizeFbHref(h).split('?')[0], score: 0, order: 0 });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const pick = candidates[0];
  if (!pick) return false;
  await pushPostRecord(request, sheetUrl, posterName, postItem, groupName, memberCount, pick.link, status, postLogOpts);
  return true;
}

/**
 * บันทึกลิงก์โพสต์ไปยัง Google Sheet
 * ลำดับเหมือนสคริปต์ต้นฉบับ: ไป my_posted_content ก่อน แล้ว my_pending_content
 * จับลิงก์จาก aria-label ล่าสุด; รองรับ title/ข้อความลิงก์ + fallback ลิงก์โพสต์ใน article แรก
 */
export async function saveToSheet(
  page: Page,
  request: APIRequestContext,
  gID: string,
  posterName: string,
  postItem: PostItem,
  groupName: string,
  memberCount: string,
  sheetUrl: string,
  postLogOpts?: SaveToSheetOptions
): Promise<void> {
  try {
    await ensureNoDialogBlockingNavigation(page);
    console.log(`[saveToSheet] เก็บลิงก์กลุ่ม ${gID} — ลำดับ: my_posted_content → my_pending_content → ฟีดกลุ่ม (สำรอง)`);

    const checkUrls = [
      { url: `https://www.facebook.com/groups/${gID}/my_posted_content`, status: 'อนุมัติเเล้ว' },
      { url: `https://www.facebook.com/groups/${gID}/my_pending_content`, status: 'รออนุมัติ' },
    ];

    const knownLinks = await loadKnownGroupLinks(gID);
    for (const item of checkUrls) {
      await ensureNoDialogBlockingNavigation(page);
      console.log(`[saveToSheet] เปิด ${item.url}`);
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(MY_CONTENT_WAIT_MS);

      const ok = await scanMyContentCurrentPage(
        page,
        request,
        item.status,
        posterName,
        postItem,
        groupName,
        memberCount,
        sheetUrl,
        gID,
        postLogOpts,
        knownLinks
      );
      if (ok) {
        console.log(`[saveToSheet] บันทึกลิงก์แล้ว (${item.status})`);
        return;
      }
    }

    console.log(`[saveToSheet] ไม่เจอลิงก์บน my_posted/pending — ลองดึงจากฟีดกลุ่ม`);
    await ensureNoDialogBlockingNavigation(page);
    await page.goto(`https://www.facebook.com/groups/${gID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const fromFeed = await tryExtractLinkFromGroupFeed(page, posterName, gID);
    if (fromFeed) {
      await pushPostRecord(
        request,
        sheetUrl,
        posterName,
        postItem,
        groupName,
        memberCount,
        fromFeed,
        'อนุมัติเเล้ว',
        postLogOpts
      );
      console.log('[saveToSheet] บันทึกลิงก์จากฟีดกลุ่มแล้ว');
      return;
    }

    console.warn('[saveToSheet] ไม่พบลิงก์โพสต์ล่าสุด — ข้ามบันทึก Sheet (โพสต์อาจสำเร็จแล้ว)');
    /** ยังบันทึก Post Log แม้ไม่มีลิงก์ — ให้หน้า Collect เห็นว่ามีโพสต์ในวันนั้น (แถวมีลิงก์จะโผล่หลังแก้การดึงลิงก์) */
    if (postLogOpts?.userId || postLogOpts?.assignmentId || postLogOpts?.jobId) {
      await postLog({
        poster_name: posterName,
        owner: postItem.owner,
        job_title: postItem.title,
        company: postItem.company,
        group_name: normalizeGroupName(groupName),
        member_count: memberCount,
        post_link: '',
        post_status: 'ไม่พบลิงก์หลังโพสต์',
        comment_count: 0,
        customer_phone: postLogOpts.customerPhone,
        assignment_id: postLogOpts.assignmentId,
        user_id: postLogOpts.userId,
        job_id: postLogOpts.jobId,
        group_id: postLogOpts.groupId || gID,
      });
    }
  } catch (err) {
    console.error('[saveToSheet] บันทึก Sheet ไม่สำเร็จ:', (err as Error).message);
  }
}

/**
 * หาลิงก์โพสต์ของเราเองในกลุ่ม ภายหลังวันโพสต์ (ใช้ตอนเก็บคอมเมนต์ กับโพสต์ที่ตอนนั้นหาลิงก์ไม่เจอ)
 * เปิด my_posted_content แล้ว my_pending_content ข้ามลิงก์ที่แถวอื่นใช้แล้ว
 * เลือกโพสต์ที่ข้อความตรงกับประกาศมากสุด (อย่างน้อย 1 บรรทัด) ถ้าไม่มีข้อความประกาศใช้ชื่องาน
 * ไม่มีทั้งสองอย่าง จะเลือกให้ก็ต่อเมื่อหน้านั้นเหลือโพสต์ให้เลือกแค่โพสต์เดียว
 */
export async function findMyPostLink(
  page: Page,
  gID: string,
  opts: { jobTitle?: string; caption?: string; knownLinks?: string[] } = {}
): Promise<{ link: string; status: 'อนุมัติเเล้ว' | 'รออนุมัติ' } | null> {
  const known = new Set((opts.knownLinks || []).map(normLink));
  const title = squashText(opts.jobTitle || '');
  const caption = String(opts.caption || '');
  const pages = [
    { url: `https://www.facebook.com/groups/${gID}/my_posted_content`, status: 'อนุมัติเเล้ว' as const },
    { url: `https://www.facebook.com/groups/${gID}/my_pending_content`, status: 'รออนุมัติ' as const },
  ];
  for (const item of pages) {
    await ensureNoDialogBlockingNavigation(page);
    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(MY_CONTENT_WAIT_MS);
    const articles = page.locator('[role="main"] div[role="article"]');
    const count = Math.min(await articles.count(), 20);
    const candidates: Array<{ link: string; score: number; titleHit: boolean }> = [];
    for (let i = 0; i < count; i++) {
      const art = articles.nth(i);
      const link = await findGroupPostPermalinkInArticle(art, gID);
      if (!link || known.has(normLink(link)) || candidates.some((c) => c.link === link)) continue;
      const text = await art.innerText().catch(() => '');
      candidates.push({
        link,
        score: caption ? captionMatchScore(text, caption) : 0,
        titleHit: Boolean(title) && squashText(text).includes(title),
      });
    }
    let hit: (typeof candidates)[number] | undefined;
    if (caption) hit = candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score)[0];
    if (!hit && title) hit = candidates.find((c) => c.titleHit);
    if (!hit && !caption && !title && candidates.length === 1) hit = candidates[0];
    if (hit) return { link: hit.link, status: item.status };
  }
  return null;
}
