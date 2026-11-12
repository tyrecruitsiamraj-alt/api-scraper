import type { Page } from '@playwright/test';
import { humanPause } from './humanBehavior';

/* eslint-disable @typescript-eslint/no-var-requires */
const contentStatus = require('../../server/post-content-status') as {
  CONTENT_TABS: { tab: string; path: string; status: string }[];
  postIdOf: (link: string | null | undefined) => string | null;
};

export type ContentTabRead = {
  tab: string;
  /** false = เปิดแล้วไม่ได้อยู่หน้าแท็บนั้น (Facebook พาไปหน้าอื่น) — ห้ามสรุปจากแท็บนี้ */
  ok: boolean;
  items: { post_id: string | null; text: string }[];
  url: string;
};

const WAIT_MS = Math.min(30000, Math.max(3000, Number(process.env.MY_CONTENT_WAIT_MS) || 8000));

/**
 * เปิดแท็บ "เนื้อหาของคุณ" หนึ่งแท็บของกลุ่ม แล้วอ่านโพสต์บนหน้า (เลขโพสต์ + ข้อความ) · ไม่กดอะไร อ่านอย่างเดียว
 * tab = posted | pending | declined | removed (ดู server/post-content-status.js)
 */
export async function readContentTab(page: Page, gID: string, tab: string): Promise<ContentTabRead> {
  const def = contentStatus.CONTENT_TABS.find((t) => t.tab === tab);
  if (!def) throw new Error(`ไม่รู้จักแท็บ ${tab}`);
  const url = `https://www.facebook.com/groups/${gID}/${def.path}`;
  await page.keyboard.press('Escape').catch(() => {});
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(WAIT_MS);
  let landed = '';
  try {
    landed = new URL(page.url()).pathname;
  } catch {
    landed = page.url();
  }
  if (!landed.includes(def.path)) return { tab, ok: false, items: [], url: page.url() };

  const articles = page.locator('[role="main"] div[role="article"]');
  const count = Math.min(await articles.count().catch(() => 0), 20);
  const items: ContentTabRead['items'] = [];
  for (let i = 0; i < count; i++) {
    const art = articles.nth(i);
    const links = art.locator('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]');
    const n = Math.min(await links.count().catch(() => 0), 20);
    let postId: string | null = null;
    for (let k = 0; k < n && !postId; k++) postId = contentStatus.postIdOf(await links.nth(k).getAttribute('href').catch(() => null));
    const text = (await art.innerText().catch(() => '')).slice(0, 2000);
    if (postId || text) items.push({ post_id: postId, text });
  }
  await humanPause(page, 1500, 4000);
  return { tab, ok: true, items, url: page.url() };
}
