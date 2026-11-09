/**
 * จังหวะโพสต์ต่อบัญชี — นิยามเดียว ใช้ทั้งเครื่องโพสต์ (worker), เวลาจำกัดงาน, หน้า /options ที่ Jarvis อ่าน และหน้าโควต้า
 *
 * เจ้าของเคาะ 8 พ.ย. 2569 หลัง Facebook จำกัดบัญชีวันละ 7–16 ครั้ง (2–6 พ.ย.):
 * - โพสต์ได้ไม่เกิน 8 กลุ่มต่อบัญชีต่อวัน นับรวมทุกใบ (เดิมใบจาก Jarvis ข้ามเพดาน บางบัญชีโพสต์ 25 กลุ่ม/วัน)
 * - เว้นระหว่างโพสต์อย่างน้อย 10 นาที (สุ่ม 10–12 นาที · เดิม 1–2.5 นาที เฉลี่ยห่าง 4 นาที)
 *
 * เจ้าของเคาะ 9 พ.ย. 2569 (ดู 67 ครั้งที่โดนจำกัดใน 7 วัน):
 * - เพดานของแต่ละบัญชีแต่ละวันไม่เท่ากัน: สุ่ม 3 ถึงเพดาน (ค่าเดิมทั้งวัน ทุกที่คิดได้ค่าเดียวกัน)
 * - หลังพ้นพักจากโดนจำกัด กลับมาทีละน้อย: วันแรก 1 กลุ่ม (โพสต์หยั่ง) · วันที่ 2–3 2 กลุ่ม · วันที่ 4–6 4 · แล้วปกติ
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

/** บัญชีใหม่ = อายุ (นับจากโพสต์แรก) ไม่ถึง 14 วัน หรือยังไม่เคยโพสต์ */
const NEW_ACCOUNT_DAYS = 14;

function isNewAccount(ageDays) {
  const age = Number(ageDays);
  return ageDays == null || !Number.isFinite(age) || age < NEW_ACCOUNT_DAYS;
}

/**
 * วอร์มบัญชีใหม่ตามอายุ: ไม่เคยโพสต์/<14 วัน = 2 · <21 = 4 · ≥21 = เต็ม
 * เจ้าของเคาะ 9 พ.ย. 2569: บัญชีชุด 28 ต.ค. วันแรกโพสต์ 13–22 กลุ่ม (เพดานเดิม 5 ยังไม่ครอบใบ Jarvis) โดนภายในวันนั้นหรือวันถัดไปทุกบัญชี
 */
function warmupCapFor(capBase, ageDays, env = process.env) {
  if (String(env.POST_WARMUP_DISABLED || '') === '1') return capBase;
  const age = Number(ageDays);
  const ramp = isNewAccount(ageDays) ? 2 : age < 21 ? 4 : capBase;
  return Math.min(capBase, ramp);
}

/**
 * หลังพ้นพักจากโดน Facebook จำกัด กลับมาทีละน้อย: วันแรก 1 (โพสต์หยั่ง ถ้าโดนอีกก็พักขั้นถัดไปเอง) · วันที่ 2–3 2 · วันที่ 4–6 4 · แล้วปกติ
 * ดูจาก pause_reason (ขึ้นต้นด้วยข้อความโดนจำกัด) กับ paused_until (เวลาที่พ้นพัก) ที่อยู่บนบัญชีอยู่แล้ว
 */
function recoveryCapAfterLimit(capBase, { pauseReason, pausedUntil } = {}, now = Date.now()) {
  if (!String(pauseReason || '').startsWith(FB_LIMIT_LOG_PREFIX)) return capBase;
  const until = pausedUntil ? new Date(pausedUntil).getTime() : NaN;
  if (!Number.isFinite(until)) return capBase;
  const daysSince = (now - until) / 86_400_000;
  if (daysSince < 0) return capBase; // ยังพักอยู่ — ตัวกันพักจัดการเอง
  if (daysSince < 1) return Math.min(capBase, 1);
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
 * รอบโพสต์อัตโนมัติตอนเช้า: บัญชีนี้เริ่มช้ากว่าเวลาเข้าคิวกี่นาที (0..spread-1) — ค่าเดิมทั้งวัน
 * เจ้าของเคาะ 9 พ.ย. 2569: เดิมทุกบัญชีเริ่มพร้อมกัน 08:00 จากเครื่องเดียว (4 พ.ย. 19 บัญชี 257 โพสต์)
 * ใช้กับรอบเช้าเท่านั้น — ใบสั่งจาก Jarvis โพสต์ทันทีตามที่สั่ง
 */
function dailyStartOffsetMin(userId, day, env = process.env) {
  const spread = Math.floor(num(env.AUTO_POST_SPREAD_MINUTES, 120));
  if (String(env.AUTO_POST_SPREAD_MINUTES || '') === '0' || spread <= 1) return 0;
  return hash32(`start|${userId}|${day}`) % spread;
}

/**
 * อุ่นเครื่องบัญชีใหม่ (เจ้าของเคาะ 9 พ.ย. 2569): บัญชีอายุไม่ถึง 14 วัน (นับจากโพสต์แรก) วันละ 1 รอบ
 * เลื่อนฟีด เข้าดูกลุ่ม กดถูกใจบ้าง — ไม่โพสต์ ไม่คอมเมนต์ · บัญชีที่ติ๊ก "ใช้งานมานานแล้ว" ไม่ต้องอุ่น
 * เหตุ: บัญชีชุด 28 ต.ค. ไม่เคยทำอะไรนอกจากโพสต์ แล้วโดนจำกัด 29 จาก 34 บัญชีในสัปดาห์แรก
 */
function needsWarmup(user, ageDays, env = process.env) {
  if (String(env.WARMUP_DISABLED || '') === '1') return false;
  if (user?.skip_warmup === true) return false;
  return isNewAccount(ageDays);
}

/** รอบอุ่นเครื่องเริ่มช้ากว่าเวลาเข้าคิว (08:00) 60–539 นาที = ระหว่าง 09:00–17:00 · ค่าเดิมทั้งวัน */
function warmupStartOffsetMin(userId, day) {
  return 60 + (hash32(`warmup|${userId}|${day}`) % 480);
}

/**
 * แผนของรอบอุ่นเครื่อง 1 รอบ: เลื่อนฟีด 3–5 นาที · เข้าดู 2–3 กลุ่ม กลุ่มละ 1–2 นาที · กดถูกใจ 0–2 โพสต์บนฟีด
 * WARMUP_LIKES_MAX=0 ปิดการกดถูกใจ
 */
function warmupSessionPlan(env = process.env, rand = Math.random) {
  const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const likesMax = Math.max(0, Math.floor(Number(env.WARMUP_LIKES_MAX ?? 2)));
  return {
    feed_sec: between(180, 300),
    groups: between(2, 3),
    group_sec: between(60, 120),
    likes: likesMax === 0 ? 0 : between(0, likesMax),
  };
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

/**
 * ช่วงเว้นของบัญชีนี้: บัญชีใหม่ (<14 วัน) 20–30 นาที (เจ้าของเคาะ 9 พ.ย. 2569 — เดิมห่างกัน 4 นาทีแล้วโดนทั้งชุด)
 * บัญชีใหม่โพสต์วันละ 2 กลุ่ม จึงเว้น 30 นาทีครั้งเดียวต่องาน ไม่ชนเวลาตัดงานค้าง
 */
function postGapRangeSecFor(ageDays, env = process.env) {
  const base = postGapRangeSec(env);
  if (String(env.POST_WARMUP_DISABLED || '') === '1' || !isNewAccount(ageDays)) return base;
  const min = Math.max(base.min, num(env.POST_NEW_ACCOUNT_MIN_GAP_SEC, 1200));
  return { min, max: Math.max(min, num(env.POST_NEW_ACCOUNT_MAX_GAP_SEC, 1800)) };
}

/** ค่าที่ตั้งไว้ (รายบัญชีหรือ env) แต่ห้ามสั้นกว่าขั้นต่ำของบัญชีนี้ · ageDays undefined = ใช้ช่วงปกติ */
function clampGapSec(seconds, env = process.env, ageDays = undefined) {
  const { min, max } = ageDays === undefined ? postGapRangeSec(env) : postGapRangeSecFor(ageDays, env);
  const s = Number(seconds);
  if (Number.isFinite(s) && s >= min) return s;
  return Math.floor(min + Math.random() * (max - min + 1));
}

module.exports = {
  dailyCapCeiling, baseDailyCapFor, isNewAccount, warmupCapFor, recoveryCapAfterLimit, dailyCapForDay, dailyStartOffsetMin, bangkokDay, effectiveDailyCapFor,
  needsWarmup, warmupStartOffsetMin, warmupSessionPlan,
  postGapRangeSec, postGapRangeSecFor, clampGapSec,
};
