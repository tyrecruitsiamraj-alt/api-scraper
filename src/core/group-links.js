/**
 * อ่านลิงก์/เลขกลุ่ม Facebook ที่วางมาหลายบรรทัด (เพิ่มกลุ่มทีละหลายกลุ่ม · เจ้าของ 12 พ.ย. 2569)
 * รับ: https://www.facebook.com/groups/123456789/… · facebook.com/groups/123456789 · 123456789
 * ลิงก์ที่ไม่มีเลขกลุ่ม (ชื่อย่อกลุ่ม, ลิงก์แชร์ /share/g/…) อ่านไม่ได้ — เหมือนช่องเพิ่มทีละกลุ่มเดิม
 */

export const MAX_GROUPS_PER_ADD = 200;

const GROUP_IN_URL = /groups\/(\d{6,})(?!\d)/i;
const BARE_ID = /^\d{6,}$/;
const LOOKS_LIKE_LINK = /[/.]|facebook|fb\.com/i;

/**
 * @param {string | null | undefined} text
 * @returns {{ ids: string[], invalid: string[], repeated: number }}
 *   ids = เลขกลุ่มไม่ซ้ำ ตามลำดับที่วาง · invalid = บรรทัดที่อ่านเลขกลุ่มไม่ได้ · repeated = เลขที่วางซ้ำในรอบเดียวกัน
 */
export function parseGroupLinks(text) {
  const ids = [];
  const seen = new Set();
  const invalid = [];
  let repeated = 0;
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const found = [];
    let unreadable = false;
    for (const token of line.split(/[\s,;]+/).filter(Boolean)) {
      const fromUrl = token.match(GROUP_IN_URL)?.[1];
      if (fromUrl) found.push(fromUrl);
      else if (BARE_ID.test(token)) found.push(token);
      else if (LOOKS_LIKE_LINK.test(token)) unreadable = true;
    }
    if (!found.length || unreadable) invalid.push(line);
    for (const id of found) {
      if (seen.has(id)) {
        repeated += 1;
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
  }
  return { ids, invalid, repeated };
}
