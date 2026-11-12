/**
 * สถานะโพสต์ตามแท็บ "เนื้อหาของคุณ" ในกลุ่ม Facebook (เจ้าของ 12 พ.ย. 2569)
 * Facebook มี 4 แท็บ: รอดำเนินการ · เผยแพร่แล้ว · ปฏิเสธแล้ว · ลบออกแล้ว
 * ตัวเก็บคอมเมนต์เปิดแท็บเหล่านี้ของกลุ่มที่มีโพสต์รอดำเนินการ/หาโพสต์ไม่เจอ แล้วอัปเดต post_logs
 * — ไม่เปิดรอบ Facebook ใหม่ ใช้รอบเก็บคอมเมนต์ที่ล็อกอินบัญชีนั้นอยู่แล้ว
 */

const STATUS_POSTED = 'อนุมัติเเล้ว';
const STATUS_PENDING = 'รออนุมัติ';
const STATUS_NOT_FOUND = 'ไม่พบลิงก์หลังโพสต์';
const STATUS_DECLINED = 'ถูกปฏิเสธ';
const STATUS_REMOVED = 'ถูกลบ';

/** ลำดับที่เปิด · path ต่อท้าย https://www.facebook.com/groups/<เลขกลุ่ม>/ */
const CONTENT_TABS = [
  { tab: 'posted', path: 'my_posted_content', status: STATUS_POSTED },
  { tab: 'pending', path: 'my_pending_content', status: STATUS_PENDING },
  { tab: 'declined', path: 'my_declined_content', status: STATUS_DECLINED },
  { tab: 'removed', path: 'my_removed_content', status: STATUS_REMOVED },
];

/** เลขโพสต์จากลิงก์โพสต์ในกลุ่ม (/posts/<id> · /permalink/<id> · story_fbid=<id>) */
function postIdOf(link) {
  const s = String(link || '');
  const m = s.match(/\/(?:posts|permalink)\/(\d{6,})/) || s.match(/story_fbid=(\d{6,})/);
  return m ? m[1] : null;
}

function squash(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** บรรทัดต้น ๆ ของประกาศ (ยาว ≥ 8 ตัว) ที่เจอในข้อความโพสต์ — แบบเดียวกับ captionMatchScore ตอนหาลิงก์ */
function captionScore(text, caption) {
  const t = squash(text);
  if (!t) return 0;
  const lines = String(caption || '')
    .split(/\n+/)
    .map((l) => squash(l).slice(0, 40))
    .filter((l) => l.length >= 8)
    .slice(0, 6);
  return lines.filter((l) => t.includes(l)).length;
}

/**
 * โพสต์นี้อยู่แท็บไหน
 * @param {{ link?: string, caption?: string, takenIds?: string[] }} post
 *   link = ลิงก์ที่บันทึกไว้ (ถ้ามี) · caption = ข้อความประกาศ ใช้เมื่อไม่มีลิงก์ · takenIds = เลขโพสต์ที่แถวอื่นใช้แล้ว
 * @param {{ tab: string, ok: boolean, items: { post_id: string|null, text: string }[] }[]} tabs ผลอ่านแต่ละแท็บ
 * @returns {{ tab: string, status: string, post_id: string|null, by: 'id'|'caption' } | null}
 */
function locatePost(post, tabs) {
  const status = (tab) => CONTENT_TABS.find((t) => t.tab === tab)?.status;
  const id = postIdOf(post.link);
  if (id) {
    for (const t of tabs) {
      if (t.ok && t.items.some((it) => it.post_id === id)) return { tab: t.tab, status: status(t.tab), post_id: id, by: 'id' };
    }
    return null;
  }
  if (!post.caption) return null;
  const taken = new Set((post.takenIds || []).map(String));
  let best = null;
  for (const t of tabs) {
    if (!t.ok) continue;
    for (const it of t.items) {
      if (it.post_id && taken.has(it.post_id)) continue;
      const score = captionScore(it.text, post.caption);
      if (score > 0 && (!best || score > best.score)) best = { tab: t.tab, status: status(t.tab), post_id: it.post_id, score };
    }
  }
  return best ? { tab: best.tab, status: best.status, post_id: best.post_id, by: 'caption' } : null;
}

/**
 * สถานะใหม่ของแถว post_logs หรือ null ถ้าไม่ต้องเปลี่ยน
 * รอดำเนินการ/หาโพสต์ไม่เจอ → ได้ทุกสถานะ · เผยแพร่แล้ว → ลบออกแล้วเท่านั้น · ปฏิเสธ/ลบแล้ว → จบ ไม่ย้อน
 */
function nextPostStatus(current, found) {
  const cur = String(current || '').trim();
  const to = String(found || '').trim();
  if (!to || cur === to) return null;
  if (!CONTENT_TABS.some((t) => t.status === to)) return null;
  if (cur === STATUS_DECLINED || cur === STATUS_REMOVED) return null;
  if (cur === STATUS_POSTED) return to === STATUS_REMOVED ? to : null;
  return to;
}

module.exports = {
  STATUS_POSTED,
  STATUS_PENDING,
  STATUS_NOT_FOUND,
  STATUS_DECLINED,
  STATUS_REMOVED,
  CONTENT_TABS,
  postIdOf,
  captionScore,
  locatePost,
  nextPostStatus,
};
