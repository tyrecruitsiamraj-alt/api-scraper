/**
 * Checks a caption from Jarvis before it is posted to a public Facebook group.
 * Jarvis builds the caption (see PROJECT_PLAN.md, Journey plan); this is the
 * second line of defence so internal text never goes out.
 */

export const MAX_CAPTION_LENGTH = 2000;

/** @returns {string[]} problems in operator Thai; empty when the caption can be posted */
export function postCaptionIssues(caption) {
  const text = String(caption ?? '').trim();
  if (!text) return ['ไม่มีข้อความประกาศ'];
  const issues = [];
  if (/OPL\s*-?\s*\d/i.test(text)) issues.push('มีเลขใบขอ (OPL…) อยู่ในข้อความ');
  if (/ขอให้\s*OPL|ผู้ประสานงาน|หมายเหตุภายใน/u.test(text)) issues.push('มีข้อความสั่งงานภายในอยู่ในข้อความ');
  const hasPhone = /0\d[\d\s-]{7,11}\d/.test(text);
  const hasLink = /https?:\/\/\S+/i.test(text);
  if (!hasPhone && !hasLink) issues.push('ไม่มีเบอร์โทรหรือลิงก์สมัคร');
  if (text.length > MAX_CAPTION_LENGTH) issues.push(`ยาวเกิน ${MAX_CAPTION_LENGTH.toLocaleString('en-US')} ตัวอักษร`);
  return issues;
}
