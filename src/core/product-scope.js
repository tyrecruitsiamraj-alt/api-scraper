/**
 * Product scope for the live operator app.
 * Scraping + Facebook Autopost only — Content AI generation is out of scope.
 */

export const PRODUCT_MODULES = Object.freeze({
  scraping: true,
  autopost: true,
  /** AI draft posters/captions from So Recruit content requests */
  contentGeneration: false,
});

export const CONTENT_DISABLED_OPERATOR_MESSAGE =
  'ระบบนี้ทำเฉพาะค้นหาผู้สมัคร (Scrap) และโพสต์ Facebook (Autopost) แล้ว ไม่รับงานสร้างประกาศ';

export function isContentGenerationEnabled() {
  return PRODUCT_MODULES.contentGeneration === true;
}

export function isScrapingEnabled() {
  return PRODUCT_MODULES.scraping === true;
}

export function isAutopostEnabled() {
  return PRODUCT_MODULES.autopost === true;
}

export function productScopeSummary() {
  const parts = [];
  if (PRODUCT_MODULES.scraping) parts.push('ค้นหาผู้สมัคร');
  if (PRODUCT_MODULES.autopost) parts.push('โพสต์ Facebook');
  if (PRODUCT_MODULES.contentGeneration) parts.push('สร้างประกาศ');
  return parts.length ? parts.join(' · ') : 'ไม่มีโมดูลที่เปิดใช้';
}
