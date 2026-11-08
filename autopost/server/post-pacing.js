/**
 * จังหวะโพสต์ต่อบัญชี — นิยามเดียว ใช้ทั้งเครื่องโพสต์ (worker), เวลาจำกัดงาน, และหน้า /options ที่ Jarvis อ่าน
 *
 * เจ้าของเคาะ 8 พ.ย. 2569 หลัง Facebook จำกัดบัญชีวันละ 7–16 ครั้ง (2–6 พ.ย.):
 * - โพสต์ได้ไม่เกิน 8 กลุ่มต่อบัญชีต่อวัน นับรวมทุกใบ (เดิมใบจาก Jarvis ข้ามเพดาน บางบัญชีโพสต์ 25 กลุ่ม/วัน)
 * - เว้นระหว่างโพสต์อย่างน้อย 10 นาที (สุ่ม 10–12 นาที · เดิม 1–2.5 นาที เฉลี่ยห่าง 4 นาที)
 *
 * เพดาน 8 เป็น "สูงสุดของระบบ": ชนะค่า daily_cap ที่ตั้งรายบัญชี (ทุกบัญชีตั้ง 15–20 ไว้)
 * ปรับได้ด้วย env POST_DAILY_CAP_MAX / POST_MIN_GAP_SEC / POST_MAX_GAP_SEC
 */

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** เพดานสูงสุดต่อบัญชีต่อวัน */
function dailyCapCeiling(env = process.env) {
  return Math.max(1, Math.floor(num(env.POST_DAILY_CAP_MAX, 8)));
}

/** เพดานก่อนวอร์มบัญชีใหม่: ค่าของบัญชี > env POST_DAILY_CAP > 8 แล้วไม่เกินเพดานระบบ */
function baseDailyCapFor(userDailyCap, env = process.env) {
  const wanted = num(userDailyCap, num(env.POST_DAILY_CAP, dailyCapCeiling(env)));
  return Math.max(1, Math.min(Math.floor(wanted), dailyCapCeiling(env)));
}

/**
 * ช่วงเว้นระหว่างโพสต์ (วินาที) 10–12 นาที
 * ไม่ยาวกว่า 12 นาที: งาน 8 กลุ่ม = เปิด 10 + 8 × (5 + 12) + พัก 15 = 161 นาที ยังจบก่อนเครื่องตัดงานค้าง (175 นาที)
 */
function postGapRangeSec(env = process.env) {
  const min = num(env.POST_MIN_GAP_SEC, 600);
  const max = Math.max(min, num(env.POST_MAX_GAP_SEC, 720));
  return { min, max };
}

/** ค่าที่ตั้งไว้ (รายบัญชีหรือ env) แต่ห้ามสั้นกว่าขั้นต่ำของระบบ */
function clampGapSec(seconds, env = process.env) {
  const { min, max } = postGapRangeSec(env);
  const s = Number(seconds);
  if (Number.isFinite(s) && s >= min) return s;
  return Math.floor(min + Math.random() * (max - min + 1));
}

module.exports = { dailyCapCeiling, baseDailyCapFor, postGapRangeSec, clampGapSec };
