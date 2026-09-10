import { clickWithoutNavigationWait } from '../browser/safe-click.js';
import {
  dismissJobbkkOverlays,
  firstVisibleLocator,
  readResumeResultPool,
  sleep,
  waitForResultChange,
} from '../resume-talent-entry.js';
import { hasSearchValue } from '../talent-filter-plan.js';

export function buildJobbkkAiQuery(criteria = {}) {
  const chunks = [];
  if (hasSearchValue(criteria.position)) chunks.push(`ตำแหน่ง ${String(criteria.position).trim()}`);
  if (hasSearchValue(criteria.keyword)) chunks.push(`ทักษะหรือคำสำคัญ ${String(criteria.keyword).trim()}`);
  if (hasSearchValue(criteria.industry) || hasSearchValue(criteria.jobTypes)) {
    chunks.push(`ประเภทงาน ${String(criteria.industry || criteria.jobTypes).trim()}`);
  }
  if (hasSearchValue(criteria.province)) chunks.push(`พื้นที่ทำงาน ${String(criteria.province).trim()}`);
  if (hasSearchValue(criteria.gender)) chunks.push(`เพศ ${String(criteria.gender).trim()}`);
  if (hasSearchValue(criteria.ageMin) || hasSearchValue(criteria.ageMax)) {
    const min = hasSearchValue(criteria.ageMin) ? String(criteria.ageMin).trim() : null;
    const max = hasSearchValue(criteria.ageMax) ? String(criteria.ageMax).trim() : null;
    chunks.push(min && max ? `อายุ ${min}-${max} ปี` : min ? `อายุตั้งแต่ ${min} ปี` : `อายุไม่เกิน ${max} ปี`);
  }
  if (hasSearchValue(criteria.education)) chunks.push(`วุฒิ ${String(criteria.education).trim()}`);
  if (!chunks.length) throw new Error('JOBBKK_FILTER_NOT_APPLIED: ไม่มีตำแหน่งหรือคำค้นที่ยืนยันได้สำหรับ AI Search');
  return chunks.join(' · ');
}

export async function runAiSearch(page, criteria) {
  await dismissJobbkkOverlays(page);
  const mode = await firstVisibleLocator([
    page.getByRole('button', { name: /AI\s*SEARCH/i }),
    page.getByRole('tab', { name: /AI\s*SEARCH/i }),
    page.getByText(/^AI\s*SEARCH$/i),
  ]);
  if (!mode) throw new Error('JOBBKK_SITE_CONTRACT_CHANGED: ไม่พบแท็บ AI SEARCH');
  await clickWithoutNavigationWait(mode);
  await sleep(400);
  const query = buildJobbkkAiQuery(criteria);
  const input = await firstVisibleLocator([
    page.getByRole('textbox'),
    page.locator('textarea'),
    page.locator('input[type="search"], input[type="text"]'),
  ]);
  if (!input) throw new Error('JOBBKK_SITE_CONTRACT_CHANGED: ไม่พบช่องพิมพ์ AI Search');
  await input.fill(query);
  const before = await readResumeResultPool(page);
  const button = await firstVisibleLocator([
    page.getByRole('button', { name: /ค้นหาผู้สมัครงาน|ค้นหา/u }),
  ]);
  if (button) await clickWithoutNavigationWait(button);
  else await page.keyboard.press('Enter');
  const pool = await waitForResultChange(page, before.map((item) => item.id));
  return { strategy: 'ai', pool, query, warning: null };
}
