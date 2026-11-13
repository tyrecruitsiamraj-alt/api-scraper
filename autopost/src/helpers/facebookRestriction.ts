import type { Page } from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseRestrictionEnd, RESTRICTION_PAGES } = require('../../server/fb-restriction-date') as {
  parseRestrictionEnd: (text: string, now?: number) => Date | null;
  RESTRICTION_PAGES: string[];
};

export type RestrictionPageRead = { url: string; ok: boolean; text: string };

/**
 * โดน Facebook จำกัดแล้ว: เปิดหน้าสถานะบัญชีหาวันปลดล็อก (เจ้าของเคาะ 13 พ.ย. 2569)
 * ป๊อปอัปตอนโดนไม่บอกวัน · ข้อความที่เห็นทุกหน้าส่งกลับไปบันทึกรอบ ใช้ปรับตัวอ่านเมื่อเห็นหน้าจริง
 * อ่านไม่ได้ = until null ผู้เรียกพักตามขั้นเดิม
 */
export async function readFacebookRestrictionEnd(page: Page): Promise<{ until: string | null; pages: RestrictionPageRead[] }> {
  const pages: RestrictionPageRead[] = [];
  for (const url of RESTRICTION_PAGES) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000 + Math.floor(Math.random() * 2000));
      const text = ((await page.locator('body').innerText({ timeout: 10_000 })) || '').replace(/\s+/g, ' ').trim();
      pages.push({ url: page.url(), ok: true, text: text.slice(0, 1500) });
      const until = parseRestrictionEnd(text);
      if (until) return { until: until.toISOString(), pages };
    } catch (e) {
      pages.push({ url, ok: false, text: (e as Error).message.slice(0, 300) });
    }
  }
  return { until: null, pages };
}
