import type { Locator, Page } from '@playwright/test';

export interface PostDelaySettings {
  delay_between_posts_min?: number;
  delay_between_posts_max?: number;
  batch_size?: number;
  break_time_min?: number;
  break_time_max?: number;
}

export function isHumanBehaviorEnabled(): boolean {
  const v = String(process.env.HUMAN_BEHAVIOR_ENABLED ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

export function randomInt(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function envMs(name: string, fallback: number, floor = 0): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(floor, n);
}

/** หน่วงแบบสุ่ม — ลดรูปแบบเวลาคงที่ที่ระบบตรวจจับได้ */
export async function humanPause(page: Page, minMs = 250, maxMs = 900): Promise<void> {
  const ms = isHumanBehaviorEnabled() ? randomInt(minMs, maxMs) : Math.min(maxMs, Math.max(minMs, 200));
  await page.waitForTimeout(ms);
}

/**
 * พิมพ์แบบมนุษย์ — ข้อความยาวพิมพ์เป็นชิ้น (เร็วกว่าทีละตัวมาก)
 * ข้อความสั้นพิมพ์ทีละตัว หน่วงน้อย (~พิมพ์เร็ว 50–70 คำ/นาที)
 */
export async function humanType(page: Page, text: string): Promise<void> {
  if (!text) return;
  if (!isHumanBehaviorEnabled()) {
    await page.keyboard.type(text);
    return;
  }
  const delayMin = envMs('HUMAN_TYPE_DELAY_MIN_MS', 12, 4);
  const delayMax = Math.max(delayMin, envMs('HUMAN_TYPE_DELAY_MAX_MS', 28, delayMin));
  const chunkThreshold = Math.max(40, envMs('HUMAN_TYPE_CHUNK_CHARS', 80, 20));

  if (text.length > chunkThreshold) {
    const chunkMin = Math.max(3, envMs('HUMAN_TYPE_CHUNK_MIN', 5, 2));
    const chunkMax = Math.max(chunkMin, envMs('HUMAN_TYPE_CHUNK_MAX', 12, chunkMin));
    let i = 0;
    while (i < text.length) {
      const size = randomInt(chunkMin, Math.min(chunkMax, text.length - i));
      const chunk = text.slice(i, i + size);
      await page.keyboard.type(chunk, { delay: randomInt(delayMin, delayMax) });
      i += size;
      if (i < text.length && Math.random() < 0.12) {
        await page.waitForTimeout(randomInt(35, 95));
      }
    }
    return;
  }

  for (const ch of text) {
    await page.keyboard.type(ch, { delay: randomInt(delayMin, delayMax) });
    if (/[.!?,\n]/.test(ch) && Math.random() < 0.12) {
      await page.waitForTimeout(randomInt(40, 120));
    }
  }
}

/** เลื่อนเมาส์ไปจุดในปุ่มแล้วคลิก — ไม่ยิง click ตรงกลางทุกครั้ง */
export async function humanClick(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  if (!isHumanBehaviorEnabled()) {
    await locator.click();
    return;
  }
  const box = await locator.boundingBox().catch(() => null);
  if (!box || box.width < 2 || box.height < 2) {
    await locator.click();
    return;
  }
  const x = box.x + box.width * randomFloat(0.3, 0.7);
  const y = box.y + box.height * randomFloat(0.32, 0.68);
  await page.mouse.move(x, y, { steps: randomInt(7, 16) });
  await humanPause(page, 55, 200);
  await page.mouse.click(x, y, { delay: randomInt(40, 120) });
}

/** จำลองอ่านหน้ากลุ่มสั้น ๆ ก่อนเปิด composer */
export async function humanBrowsePage(page: Page): Promise<void> {
  if (!isHumanBehaviorEnabled()) {
    await page.waitForTimeout(800);
    return;
  }
  await humanPause(page, 800, 2200);
  await page.mouse.wheel(0, randomInt(60, 180)).catch(() => {});
  await humanPause(page, 500, 1200);
  if (Math.random() < 0.3) {
    await page.mouse.wheel(0, -randomInt(30, 90)).catch(() => {});
    await humanPause(page, 200, 500);
  }
}

/** หน่วงก่อนกดโพสต์ — ทวนข้อความสั้น ๆ */
export async function humanReviewBeforePost(page: Page): Promise<void> {
  if (!isHumanBehaviorEnabled()) {
    await page.waitForTimeout(2000);
    return;
  }
  await humanPause(page, 2200, 5500);
  if (Math.random() < 0.35) {
    await page.mouse.wheel(0, randomInt(-40, 60)).catch(() => {});
    await humanPause(page, 250, 600);
  }
}

/** วินาที — จาก post_settings ของ User หรือ env */
export function getBetweenPostsDelaySec(settings?: PostDelaySettings): number {
  const userMin = settings?.delay_between_posts_min;
  const userMax = settings?.delay_between_posts_max;
  if (userMin != null && userMax != null && userMax >= userMin && userMin > 0) {
    return randomInt(userMin, userMax);
  }
  const envMin = Number(process.env.HUMAN_POST_DELAY_MIN_SEC);
  const envMax = Number(process.env.HUMAN_POST_DELAY_MAX_SEC);
  const min = Number.isFinite(envMin) && envMin > 0 ? envMin : 60;
  const max = Number.isFinite(envMax) && envMax >= min ? envMax : 150;
  return randomInt(min, max);
}

/** วินาทีพักหลังโพสต์ครบ batch_size กลุ่ม */
export function getBatchBreakSec(settings?: PostDelaySettings): number {
  const bmin = settings?.break_time_min;
  const bmax = settings?.break_time_max;
  if (bmin != null && bmax != null && bmax >= bmin && bmin > 0) {
    return randomInt(bmin, bmax);
  }
  const envMin = Number(process.env.HUMAN_BATCH_BREAK_MIN_SEC);
  const envMax = Number(process.env.HUMAN_BATCH_BREAK_MAX_SEC);
  const min = Number.isFinite(envMin) && envMin > 0 ? envMin : 300;
  const max = Number.isFinite(envMax) && envMax >= min ? envMax : 900;
  return randomInt(min, max);
}
