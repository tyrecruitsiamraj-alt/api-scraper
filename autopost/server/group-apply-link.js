/**
 * ลิงก์สมัครแยกกลุ่ม — Jarvis สร้างลิงก์ให้กลุ่มละอัน เพื่อนับว่าคนกรอกใบสมัครมาจากกลุ่ม Facebook ไหน
 * (เจ้าของ 2 พ.ย. 2569: อยากรู้ว่ากลุ่มไหนได้คนเยอะ กลุ่มไหนเหมาะงานนายไทย / นายต่างชาติ)
 *
 * ใบสั่ง content ใน job_snapshot ส่งมา:
 *   apply_link  = ลิงก์ที่อยู่ในข้อความ caption (ตัวที่ต้องแทน)
 *   group_links = [{ group_id (groups.id ของ So Scraping), apply_link, link_code }]
 * ตอนโพสต์ลงกลุ่มไหน แทน apply_link เดิมทุกจุดด้วยลิงก์ของกลุ่มนั้น ข้อความส่วนอื่นเหมือนเดิมทุกตัวอักษร
 * ใบสั่งที่ไม่มี group_links หรือกลุ่มที่ไม่อยู่ในรายการ = ลิงก์เดิมทุกกลุ่มเหมือนเดิม
 *
 * ใช้ทั้งฝั่งเว็บ (web/lib/repo.ts ตรวจก่อนสั่ง + เก็บลง jobs) และฝั่ง worker (tests/postAll.spec.ts แทนตอนโพสต์)
 * นิยามอยู่ที่นี่ที่เดียว — CommonJS เพราะ worker require() ตอนรัน
 */

/**
 * @typedef {{ group_id: string, apply_link: string, link_code: string | null }} GroupApplyLink
 */

/**
 * อ่าน group_links จาก jsonb / ข้อความ JSON / อาร์เรย์ — ทิ้งรายการที่ไม่มี group_id หรือลิงก์ไม่ใช่ http(s)
 * @param {unknown} raw
 * @returns {GroupApplyLink[]}
 */
function parseGroupLinks(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  /** @type {GroupApplyLink[]} */
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const groupId = String(/** @type {{ group_id?: unknown }} */ (item).group_id ?? '').trim();
    const link = String(/** @type {{ apply_link?: unknown }} */ (item).apply_link ?? '').trim();
    if (!groupId || !/^https?:\/\/\S+$/i.test(link)) continue;
    const code = String(/** @type {{ link_code?: unknown }} */ (item).link_code ?? '').trim();
    out.push({ group_id: groupId, apply_link: link, link_code: code || null });
  }
  return out;
}

/**
 * ลิงก์ของกลุ่มนี้ (groups.id) หรือ null เมื่อไม่มีในรายการ
 * @param {GroupApplyLink[]} groupLinks
 * @param {string} groupRowId
 */
function groupApplyLink(groupLinks, groupRowId) {
  const id = String(groupRowId ?? '').trim();
  if (!id) return null;
  const hit = groupLinks.find((g) => g.group_id === id);
  return hit ? hit.apply_link : null;
}

/**
 * ข้อความที่จะโพสต์ลงกลุ่มนี้: แทน apply_link เดิมทุกจุดด้วยลิงก์ของกลุ่ม
 * แทนไม่ได้ (ไม่มีลิงก์ของกลุ่ม / ไม่มี apply_link เดิม / ข้อความไม่มีลิงก์เดิม) → คืนข้อความเดิมทุกตัวอักษร
 *
 * @param {{ caption?: string | null, apply_link?: string | null, group_links?: unknown }} job
 * @param {string} groupRowId groups.id ของ So Scraping (ไม่ใช่ fb_group_id)
 * @returns {{ caption: string, apply_link: string | null, replaced: boolean }}
 */
function captionForGroup(job, groupRowId) {
  const caption = String(job?.caption ?? '');
  const original = String(job?.apply_link ?? '').trim() || null;
  const groupLink = groupApplyLink(parseGroupLinks(job?.group_links), groupRowId);
  if (!groupLink || !original || groupLink === original || !caption.includes(original)) {
    return { caption, apply_link: original, replaced: false };
  }
  return { caption: caption.split(original).join(groupLink), apply_link: groupLink, replaced: true };
}

/**
 * ตรวจก่อนสั่งโพสต์: ถ้า Jarvis ส่งลิงก์แยกกลุ่มมา ข้อความต้องยังมีลิงก์เดิมอยู่ ไม่งั้นแทนไม่ได้
 * และทุกกลุ่มจะได้ลิงก์เดียวกัน (นับแยกกลุ่มไม่ได้) — คนที่แก้ข้อความแล้วลบลิงก์ทิ้งจะเจอข้อนี้
 *
 * @param {string} caption
 * @param {string | null} applyLink
 * @param {GroupApplyLink[]} groupLinks
 * @returns {string[]} ปัญหาเป็นภาษาคน ว่างเมื่อแทนลิงก์ได้ (หรือใบนี้ไม่ได้ใช้ลิงก์แยกกลุ่ม)
 */
function groupLinkIssues(caption, applyLink, groupLinks) {
  if (!groupLinks.length) return [];
  const original = String(applyLink ?? '').trim();
  if (!original) return ['Jarvis ส่งลิงก์แยกกลุ่มมา แต่ไม่บอกว่าลิงก์เดิมในข้อความคืออันไหน ให้ Jarvis สั่งใบนี้ใหม่'];
  if (!String(caption ?? '').includes(original)) {
    return [`ข้อความไม่มีลิงก์ ${original} แล้ว จึงใส่ลิงก์ของแต่ละกลุ่มแทนไม่ได้ — ใส่ลิงก์นี้กลับเข้าไปในข้อความ`];
  }
  return [];
}

module.exports = { parseGroupLinks, groupApplyLink, captionForGroup, groupLinkIssues };
