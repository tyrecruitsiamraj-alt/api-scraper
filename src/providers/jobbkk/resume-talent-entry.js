import { clickWithoutNavigationWait } from './browser/safe-click.js';

export const JOBBKK_TALENT_URL = 'https://www.jobbkk.com/resume/lists';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function firstVisibleLocator(candidates) {
  for (const locator of candidates) {
    if (!locator) continue;
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

export async function dismissJobbkkOverlays(page) {
  await page.getByRole('button', { name: /ยอมรับ|ตกลง|ปิด/u }).click({ timeout: 1500 }).catch(() => {});
  const close = page.locator('[aria-label="Close"], button.close, .ant-modal-close').first();
  if (await close.isVisible().catch(() => false)) await close.click({ timeout: 1000 }).catch(() => {});
}

export async function isTalentNormalUi(page) {
  const mode = await firstVisibleLocator([
    page.getByRole('button', { name: /Normal\s*Search/i }),
    page.getByRole('tab', { name: /Normal\s*Search/i }),
    page.getByText(/^Normal\s*Search$/i),
  ]);
  const search = await firstVisibleLocator([
    page.getByRole('button', { name: /^ค้นหาผู้สมัครงาน$/u }),
    page.getByRole('button', { name: /ค้นหาผู้สมัครงาน/u }),
  ]);
  return Boolean(mode && search);
}

export async function openResumeSearchTalent(page, timeoutMs = 45_000) {
  await page.goto(JOBBKK_TALENT_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('networkidle').catch(() => {});
  await dismissJobbkkOverlays(page);
  if (await isTalentNormalUi(page)) {
    return { profile: 'current', contractVersion: 'resume-talent-lists-2026-09-10' };
  }
  return { profile: 'unknown', contractVersion: null };
}

export function extractTalentResumeId(href = '', dataId = '') {
  const id = String(dataId ?? '').trim();
  if (/^\d{3,}$/.test(id)) return id;
  const pathMatch = String(href).match(/\/(?:resumes?\/(?:preview(?:_new)?|detail|profile)\/|resume\/(?:detail|preview(?:_new)?|profile)\/)(\d{3,})/i);
  return pathMatch?.[1] ?? null;
}

export async function readResumeResultPool(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const pool = [];
    const push = (id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      pool.push({ id, rank: pool.length + 1 });
    };
    document.querySelectorAll('a[href], [data-id]').forEach((node) => {
      const href = node.getAttribute('href') || '';
      const dataId = node.getAttribute('data-id') || '';
      const match = href.match(/\/(?:resumes?\/(?:preview(?:_new)?|detail|profile)\/|resume\/(?:detail|preview(?:_new)?|profile)\/)(\d{3,})/i);
      if (match) push(match[1]);
      else if (/^\d{3,}$/.test(dataId) && /resume|preview|profile|รายละเอียด/i.test(`${href} ${node.className} ${node.textContent || ''}`)) {
        push(dataId);
      }
    });
    return pool;
  });
}

export async function waitForResultChange(page, previousIds = [], timeoutMs = 45_000) {
  const before = new Set((previousIds ?? []).map(String));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const searching = await page.getByRole('button', { name: /กำลังค้นหา/u }).count().catch(() => 0);
    const pool = await readResumeResultPool(page);
    const countText = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const match = text.match(/ผลการค้นหา\s*([\d,]+)\s*เรซูเม่/u);
      return match ? Number(match[1].replace(/,/g, '')) : null;
    }).catch(() => null);
    const changed = pool.some((item) => !before.has(String(item.id)));
    if (!searching && (changed || countText === 0)) return pool;
    await sleep(400);
  }
  return readResumeResultPool(page);
}

export { clickWithoutNavigationWait };
