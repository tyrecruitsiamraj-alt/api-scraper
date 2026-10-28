/**
 * จับลิงก์โพสต์ในกลุ่ม Facebook — รองรับกลุ่มที่ลิงก์ใช้ "ชื่อ" แทนเลขกลุ่ม
 *   /groups/1234567890/posts/999   (เลขกลุ่ม)
 *   /groups/hangankhabrot/posts/999 (ชื่อกลุ่มที่แอดมินตั้ง)
 *   /groups/<กลุ่ม>/permalink/999 · ?story_fbid=999&id=<กลุ่ม>
 * เดิมจับเฉพาะแบบเลข กลุ่มที่ใช้ชื่อจึงหาลิงก์ไม่เจอเลย (ตรวจพบ 28 ต.ค. 2569)
 * ลิงก์ที่เก็บลงระบบแปลงเป็นแบบเลขกลุ่มเสมอ (canonical) จะได้เทียบซ้ำกันได้
 *
 * ไฟล์ CJS ไม่มี dependency — เทสต์ได้ด้วย node --test
 */

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** ชื่อ/เลขกลุ่มจาก URL หน้าใด ๆ ในกลุ่ม เช่น https://www.facebook.com/groups/hangankhabrot/my_posted_content → hangankhabrot */
function groupSlugFromUrl(url) {
  const m = /\/groups\/([^/?#]+)/i.exec(String(url || ''));
  return m ? safeDecode(m[1]).toLowerCase() : '';
}

/** รายชื่อที่ใช้อ้างกลุ่มนี้ได้: เลขกลุ่ม + ชื่อจาก URL หน้าที่เปิดอยู่ (ถ้าต่างกัน) */
function groupAliases(gID, currentUrl) {
  const out = [String(gID || '').trim().toLowerCase()].filter(Boolean);
  const slug = groupSlugFromUrl(currentUrl);
  if (slug && !out.includes(slug)) out.push(slug);
  return out;
}

/** เลขโพสต์ ถ้า href ชี้ไปโพสต์ในกลุ่มที่อยู่ใน aliases — ไม่ใช่ = null (ลิงก์โปรไฟล์ /groups/x/user/ ไม่นับ) */
function postIdForGroup(href, aliases) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw.startsWith('http') ? raw : `https://www.facebook.com${raw.startsWith('/') ? '' : '/'}${raw}`);
  } catch {
    return null;
  }
  const names = (Array.isArray(aliases) ? aliases : [aliases]).map((a) => String(a || '').toLowerCase()).filter(Boolean);
  const m = /^\/groups\/([^/]+)\/(posts|permalink)\/(\d+)/i.exec(u.pathname);
  if (m && names.includes(safeDecode(m[1]).toLowerCase())) return m[3];
  const story = u.searchParams.get('story_fbid');
  const id = String(u.searchParams.get('id') || '').toLowerCase();
  if (story && /^\d+$/.test(story) && names.includes(id)) return story;
  return null;
}

function canonicalGroupPostLink(gID, postId) {
  return `https://www.facebook.com/groups/${String(gID).trim()}/posts/${String(postId).trim()}/`;
}

/** href → ลิงก์แบบเลขกลุ่ม ถ้าเป็นโพสต์ของกลุ่มนี้ ไม่งั้น null */
function canonicalPostLink(href, gID, aliases) {
  const postId = postIdForGroup(href, aliases && aliases.length ? aliases : [gID]);
  return postId ? canonicalGroupPostLink(gID, postId) : null;
}

module.exports = { groupSlugFromUrl, groupAliases, postIdForGroup, canonicalGroupPostLink, canonicalPostLink };
