/**
 * พักบัญชีเมื่อ Facebook จำกัดการโพสต์ — โดนซ้ำพักนานขึ้น (เจ้าของเคาะ 4 พ.ย. 2569)
 * เหตุ: Moody Keyanna / Jenny Audra / Kaufmann Brooke โดนจำกัดวันละครั้ง 2–4 พ.ย. ทุกครั้งที่พ้นพัก 24 ชม.
 * Jarvis ก็กลับมาให้เลือก แล้วโดนจำกัดตั้งแต่กลุ่มแรก (7 วันก่อน 4 พ.ย.: 19 บัญชีโดน 8 บัญชีโดนซ้ำ)
 * บัญชีที่ถูกพัก Jarvis เลือกไม่ได้อยู่แล้ว — พักนานขึ้น = ไม่ให้เลือกนานพอ
 */

/** ข้อความขึ้นต้นของบันทึกรอบตอนโดนจำกัด — ใช้นับครั้งที่โดน (นิยามเดียว ห้ามเปลี่ยนคำโดยไม่แก้ตัวนับ) */
const FB_LIMIT_LOG_PREFIX = 'Facebook จำกัดการโพสต์ของบัญชีนี้';
const STRIKE_WINDOW_DAYS = 7;

/** ครั้งที่โดนใน 7 วัน (รวมครั้งนี้) → ชั่วโมงพัก: ครั้งแรก = ค่าตั้งต้น (24) · ครั้งที่ 2 = 72 · ครั้งที่ 3 ขึ้นไป = 7 วัน */
function facebookLimitPauseHours(strikes, baseHours = 24) {
  const base = Math.max(1, Number(baseHours) || 24);
  const n = Math.max(1, Number(strikes) || 1);
  if (n >= 3) return Math.max(base, 7 * 24);
  if (n === 2) return Math.max(base, 72);
  return base;
}

function facebookLimitReason(strikes, hours) {
  const when = hours % 24 === 0 && hours >= 48 ? `${hours / 24} วัน` : `${hours} ชม.`;
  return `${FB_LIMIT_LOG_PREFIX} (ครั้งที่ ${strikes} ใน ${STRIKE_WINDOW_DAYS} วัน) — พัก ${when} ไม่โพสต์กลุ่มที่เหลือ`;
}

module.exports = { FB_LIMIT_LOG_PREFIX, STRIKE_WINDOW_DAYS, facebookLimitPauseHours, facebookLimitReason };
