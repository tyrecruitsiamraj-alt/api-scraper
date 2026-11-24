/**
 * ยอดคอมเมนต์ + ตัดสินว่าโพสต์หายจาก Facebook ไหม (24 พ.ย. 2569)
 * ตรวจทั้งระบบเทียบหน้าโพสต์จริง 404 โพสต์: คอมเมนต์ต่ำกว่า Facebook 1–2 อันในโพสต์ที่มีการตอบกลับ
 * เพราะเดิมนับเฉพาะคอมเมนต์ที่จับได้บนจอ (การตอบกลับที่ยังพับอยู่/ของบัญชีที่โพสต์เองไม่ถูกนับ)
 * → ยอดคอมเมนต์ใช้ค่าที่มากกว่าระหว่าง "ที่จับได้" กับ "N ความคิดเห็น" ใต้โพสต์ ซึ่งเป็นเลขเดียวกับที่ Facebook ขึ้น
 */

const UNIT = { k: 1e3, m: 1e6, พัน: 1e3, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6 };

function toCount(numText, unitText) {
  const n = parseFloat(String(numText || '').replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  const u = String(unitText || '').trim().toLowerCase();
  return Math.round(n * (UNIT[u] || 1));
}

/**
 * ยอด "N ความคิดเห็น" ใต้โพสต์ จากข้อความของกล่องโพสต์ (ไม่เจอ = 0)
 * รูปแบบที่เจอ: "2 comments" · "1 comment" · "1.2K comments" · "2 ความคิดเห็น" · "ความคิดเห็น 2 รายการ"
 * เดิมใช้ `ความคิดเห็น\b` — \b หลังอักษรไทยไม่เคยตรง ยอดภาษาไทยจึงอ่านไม่เคยได้
 */
function commentSummaryCount(text) {
  const s = String(text || '');
  const m =
    s.match(/([\d][\d,.]*)\s*(k|m|พัน|หมื่น|แสน|ล้าน)?\s*(?:comments?\b|ความคิดเห็น)/i) ||
    s.match(/ความคิดเห็น\s*([\d][\d,.]*)\s*(k|m|พัน|หมื่น|แสน|ล้าน)?\s*รายการ/i);
  return m ? toCount(m[1], m[2]) : 0;
}

/** ยอดคอมเมนต์ที่บันทึก = ค่าที่มากกว่าระหว่างที่จับได้รายคน กับยอดใต้โพสต์ */
function commentTotal(captured, summary) {
  const a = Math.max(0, Number(captured) || 0);
  const b = Math.max(0, Number(summary) || 0);
  return Math.max(a, b);
}

/**
 * เปิดลิงก์โพสต์แล้ว Facebook ขึ้น "เนื้อหานี้ไม่พร้อมใช้งาน" — โพสต์หายไปแล้วไหม
 * บัญชีที่โพสต์เป็นคนเปิด จึงเห็นโพสต์ตัวเองเสมอถ้ายังอยู่ · ยืนยันด้วยแท็บ "เนื้อหาของคุณ" ของกลุ่ม
 * @param {{ unavailable: boolean, posted?: { ok: boolean, found: boolean }, removed?: { ok: boolean, found: boolean } }} r
 * @returns {'removed'|'still_posted'|'unknown'}
 *   removed      = อยู่แท็บลบออกแล้ว หรืออ่านทั้งสองแท็บได้แต่ไม่เจอในแท็บไหน → บันทึก "ถูกลบ" ไม่นับยอดอีก
 *   still_posted = ยังอยู่แท็บเผยแพร่แล้ว (Facebook โหลดไม่ขึ้นรอบนี้) → ข้ามรอบนี้ คงยอดเดิม
 *   unknown      = อ่านแท็บไม่ได้/เกินโควต้าเช็กกลุ่ม → ข้ามรอบนี้ ไม่เดา
 */
function goneVerdict(r) {
  if (!r || !r.unavailable) return 'unknown';
  if (r.removed?.ok && r.removed.found) return 'removed';
  if (r.posted?.ok && r.posted.found) return 'still_posted';
  if (r.posted?.ok && r.removed?.ok) return 'removed';
  return 'unknown';
}

module.exports = { commentSummaryCount, commentTotal, goneVerdict };
