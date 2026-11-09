/**
 * พักบัญชีเมื่อ Facebook จำกัดการโพสต์ — โดนซ้ำพักนานขึ้น (เจ้าของเคาะ 4 พ.ย. 2569 · ขยับยาวขึ้น 9 พ.ย. 2569)
 * เหตุ 4 พ.ย.: Moody Keyanna / Jenny Audra / Kaufmann Brooke โดนจำกัดวันละครั้ง 2–4 พ.ย. ทุกครั้งที่พ้นพัก 24 ชม.
 * เหตุ 9 พ.ย.: ดู 67 ครั้งใน 7 วัน — 45 ครั้งโดนตอนที่วันนั้นยังไม่ได้โพสต์เลย (โดนค้างมาจากวันก่อน)
 *   พัก 1–3 วันแล้วกลับมาก็โดนทันที จึงพักครั้งแรก 3 วัน · ครั้งที่ 2 7 วัน · ครั้งที่ 3 ขึ้นไป 14 วัน
 *   และหลังพ้นพักให้โพสต์ทีละน้อยก่อน (post-pacing.js: recoveryCapAfterLimit)
 * บัญชีที่ถูกพัก Jarvis เลือกไม่ได้อยู่แล้ว — พักนานขึ้น = ไม่ให้เลือกนานพอ
 */

/** ข้อความขึ้นต้นของบันทึกรอบตอนโดนจำกัด — ใช้นับครั้งที่โดน (นิยามเดียว ห้ามเปลี่ยนคำโดยไม่แก้ตัวนับ) */
const FB_LIMIT_LOG_PREFIX = 'Facebook จำกัดการโพสต์ของบัญชีนี้';
const STRIKE_WINDOW_DAYS = 7;
/** พักได้นานสุด (pauseUser ตัดที่ค่านี้) */
const MAX_PAUSE_HOURS = 14 * 24;

/** ครั้งที่โดนใน 7 วัน (รวมครั้งนี้) → ชั่วโมงพัก: ครั้งแรก 3 วัน · ครั้งที่ 2 7 วัน · ครั้งที่ 3 ขึ้นไป 14 วัน (ค่าตั้งต้นที่ยาวกว่าชนะ) */
function facebookLimitPauseHours(strikes, baseHours = 72) {
  const base = Math.max(1, Number(baseHours) || 72);
  const n = Math.max(1, Number(strikes) || 1);
  if (n >= 3) return Math.max(base, 14 * 24);
  if (n === 2) return Math.max(base, 7 * 24);
  return Math.max(base, 72);
}

function facebookLimitReason(strikes, hours) {
  const when = hours % 24 === 0 && hours >= 48 ? `${hours / 24} วัน` : `${hours} ชม.`;
  return `${FB_LIMIT_LOG_PREFIX} (ครั้งที่ ${strikes} ใน ${STRIKE_WINDOW_DAYS} วัน) — พัก ${when} ไม่โพสต์กลุ่มที่เหลือ`;
}

module.exports = { FB_LIMIT_LOG_PREFIX, STRIKE_WINDOW_DAYS, MAX_PAUSE_HOURS, facebookLimitPauseHours, facebookLimitReason };
