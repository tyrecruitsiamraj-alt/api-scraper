/**
 * จังหวะโพสต์ต่อบัญชี — นิยามเดียว ใช้ทั้งเครื่องโพสต์ (worker), เวลาจำกัดงาน, หน้า /options ที่ Jarvis อ่าน และหน้าโควต้า
 *
 * เจ้าของเคาะ 8 พ.ย. 2569 หลัง Facebook จำกัดบัญชีวันละ 7–16 ครั้ง (2–6 พ.ย.):
 * - โพสต์ได้ไม่เกิน 8 กลุ่มต่อบัญชีต่อวัน นับรวมทุกใบ (เดิมใบจาก Jarvis ข้ามเพดาน บางบัญชีโพสต์ 25 กลุ่ม/วัน)
 * - เว้นระหว่างโพสต์อย่างน้อย 10 นาที (สุ่ม 10–12 นาที · เดิม 1–2.5 นาที เฉลี่ยห่าง 4 นาที)
 *
 * เจ้าของเคาะ 9 พ.ย. 2569 (ดู 67 ครั้งที่โดนจำกัดใน 7 วัน):
 * - เพดานของแต่ละบัญชีแต่ละวันไม่เท่ากัน: สุ่ม 3 ถึงเพดาน (ค่าเดิมทั้งวัน ทุกที่คิดได้ค่าเดียวกัน)
 * - หลังพ้นพักจากโดนจำกัด กลับมาทีละน้อย: 3 วันแรก 2 กลุ่ม/วัน · 3 วันถัดไป 4 · แล้วปกติ
 *
 * เพดาน 8 เป็น "สูงสุดของระบบ": ชนะค่า daily_cap ที่ตั้งรายบัญชี (ทุกบัญชีตั้ง 15–20 ไว้)
 * ปรับได้ด้วย env POST_DAILY_CAP_MAX / POST_MIN_GAP_SEC / POST_MAX_GAP_SEC · POST_DAILY_CAP_RANDOM=0 ปิดการสุ่ม
 */
const { FB_LIMIT_LOG_PREFIX } = require('./fb-limit-pause');

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

/** วอร์มบัญชีใหม่ตามอายุ (นับจากโพสต์แรก): ไม่เคยโพสต์/<7 วัน = 5 · <14 = 8 · <21 = 12 · ≥21 = เต็ม */
function warmupCapFor(capBase, ageDays, env = process.env) {
  if (String(env.POST_WARMUP_DISABLED || '') === '1') return capBase;
  const age = Number(ageDays);
  const ramp = !Number.isFinite(age) || age < 7 ? 5 : age < 14 ? 8 : age < 21 ? 12 : capBase;
  return Math.min(capBase, ramp);
}

/**
 * หลังพ้นพักจากโดน Facebook จำกัด กลับมาทีละน้อย: 3 วันแรก 2 · 3 วันถัดไป 4 · แล้วปกติ
 * ดูจาก pause_reason (ขึ้นต้นด้วยข้อความโดนจำกัด) กับ paused_until (เวลาที่พ้นพัก) ที่อยู่บนบัญชีอยู่แล้ว
 */
function recoveryCapAfterLimit(capBase, { pauseReason, pausedUntil } = {}, now = Date.now()) {
  if (!String(pauseReason || '').startsWith(FB_LIMIT_LOG_PREFIX)) return capBase;
  const until = pausedUntil ? new Date(pausedUntil).getTime() : NaN;
  if (!Number.isFinite(until)) return capBase;
  const daysSince = (now - until) / 86_400_000;
  if (daysSince < 0) return capBase; // ยังพักอยู่ — ตัวกันพักจัดการเอง
  if (daysSince < 3) return Math.min(capBase, 2);
  if (daysSince < 6) return Math.min(capBase, 4);
  return capBase;
}

/** วันที่ไทย YYYY-MM-DD */
function bangkokDay(now = Date.now()) {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function hash32(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h;
}

/** เพดานของวันนี้: สุ่ม 3..cap จาก (บัญชี, วัน) — ค่าเดิมทั้งวัน ทุกที่ (worker / Jarvis / หน้าโควต้า) ได้ค่าเดียวกัน */
function dailyCapForDay(cap, userId, day, env = process.env) {
  if (String(env.POST_DAILY_CAP_RANDOM || '') === '0') return cap;
  const floor = 3;
  if (cap <= floor) return cap;
  const span = cap - floor + 1;
  return floor + (hash32(`${userId}|${day}`) % span);
}

/**
 * เพดานโพสต์วันนี้ของบัญชี — ที่เดียวที่คิด: ค่าบัญชี → เพดานระบบ → วอร์มบัญชีใหม่ → กลับมาทีละน้อยหลังโดนจำกัด → สุ่มรายวัน
 * @param {{ id: string, daily_cap?: number|null, skip_warmup?: boolean|null, paused_until?: string|null, pause_reason?: string|null }} user
 * @param {number|null} ageDays อายุบัญชีเป็นวันนับจากโพสต์แรก (null = ไม่เคยโพสต์)
 */
function effectiveDailyCapFor(user, ageDays, { env = process.env, now = Date.now() } = {}) {
  let cap = baseDailyCapFor(user?.daily_cap, env);
  if (user?.skip_warmup !== true) cap = warmupCapFor(cap, ageDays, env);
  cap = recoveryCapAfterLimit(cap, { pauseReason: user?.pause_reason, pausedUntil: user?.paused_until }, now);
  return dailyCapForDay(cap, String(user?.id ?? ''), bangkokDay(now), env);
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

module.exports = {
  dailyCapCeiling, baseDailyCapFor, warmupCapFor, recoveryCapAfterLimit, dailyCapForDay, bangkokDay, effectiveDailyCapFor,
  postGapRangeSec, clampGapSec,
};
