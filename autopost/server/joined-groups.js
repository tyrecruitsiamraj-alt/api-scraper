/**
 * รายชื่อ "กลุ่มของคุณ" บน Facebook → กลุ่มในระบบที่บัญชีนี้เป็นสมาชิกแล้ว
 *
 * เหตุ (เจ้าของ 19 พ.ย. 2569: "บัญชี ก เข้าร่วมแล้วกี่กลุ่ม กลุ่มไหนยังไม่เข้า"): ระบบรู้แค่กลุ่มที่บัญชีเคยโพสต์ได้
 * (36 จาก 174 กลุ่ม) · 120 กลุ่มที่เพิ่มด้วยเลขกลุ่ม 13–17 พ.ย. ยังชื่อ "Group <เลข>" ไม่มีบัญชีไหนเปิดเลย
 * ลิงก์ในหน้ารายชื่อเป็นได้ทั้งเลขกลุ่มและชื่อที่แอดมินตั้ง (slug) — เทียบเลข → slug ที่จำไว้ → ชื่อกลุ่ม
 *
 * ไฟล์ CJS ไม่มี dependency — เทสต์ได้ด้วย node --test
 */

/** path ใต้ /groups/ ที่เป็นเมนูของ Facebook ไม่ใช่กลุ่ม */
const NOT_A_GROUP = new Set([
  'joins', 'feed', 'discover', 'create', 'notifications', 'search', 'you', 'your_groups', 'yourgroups',
  'membership_requests', 'pending', 'invites', 'settings', 'categories', 'browse', 'explore', 'learning',
]);

const PLACEHOLDER = /^Group\s+\d+$/i;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** เลข/slug ของกลุ่ม ถ้า href ชี้ไปหน้าแรกของกลุ่ม (/groups/<x>/) — ลิงก์โพสต์/โปรไฟล์ในกลุ่ม/เมนู = '' */
function joinedGroupToken(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  let u;
  try {
    u = new URL(raw.startsWith('http') ? raw : `https://www.facebook.com${raw.startsWith('/') ? '' : '/'}${raw}`);
  } catch {
    return '';
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return '';
  const m = /^\/groups\/([^/]+)\/?$/i.exec(u.pathname);
  if (!m) return '';
  const token = safeDecode(m[1]).trim().toLowerCase();
  return token && !NOT_A_GROUP.has(token) ? token : '';
}

function normName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * @param {{ token: string, name?: string }[]} entries จากหน้ารายชื่อกลุ่มของบัญชี
 * @param {{ fb_group_id: string, fb_slug?: string | null, name?: string | null }[]} groups กลุ่มในระบบ
 * @returns {{ memberIds: string[], nameUpdates: { fb_group_id: string, name: string }[], slugUpdates: { fb_group_id: string, slug: string }[], unmatched: number }}
 */
function matchJoinedGroups(entries, groups) {
  const byId = new Map();
  const bySlug = new Map();
  const byName = new Map();
  for (const g of groups) {
    const id = String(g.fb_group_id || '').trim();
    if (!id) continue;
    byId.set(id.toLowerCase(), g);
    if (g.fb_slug) bySlug.set(String(g.fb_slug).toLowerCase(), g);
    const n = normName(g.name);
    // ชื่อซ้ำกันสองกลุ่ม = เทียบด้วยชื่อไม่ได้
    if (n && !PLACEHOLDER.test(n)) byName.set(n, byName.has(n) ? null : g);
  }
  const member = new Set();
  const nameUpdates = [];
  const slugUpdates = [];
  let unmatched = 0;
  for (const e of entries) {
    const token = String(e.token || '').toLowerCase();
    const name = String(e.name || '').replace(/\s+/g, ' ').trim();
    let g = byId.get(token) || bySlug.get(token) || null;
    if (!g && name) {
      g = byName.get(normName(name)) || null;
      if (g && !/^\d+$/.test(token) && !g.fb_slug) slugUpdates.push({ fb_group_id: String(g.fb_group_id), slug: token });
    }
    if (!g) {
      unmatched += 1;
      continue;
    }
    const id = String(g.fb_group_id);
    if (member.has(id)) continue;
    member.add(id);
    if (name && (!g.name || PLACEHOLDER.test(String(g.name).trim()))) nameUpdates.push({ fb_group_id: id, name: name.slice(0, 150) });
  }
  return { memberIds: [...member], nameUpdates, slugUpdates, unmatched };
}

module.exports = { joinedGroupToken, matchJoinedGroups, NOT_A_GROUP };
