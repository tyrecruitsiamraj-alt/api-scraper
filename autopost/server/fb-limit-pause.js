/**
 * พักบัญชีเมื่อ Facebook จำกัดการโพสต์ — โดนซ้ำพักนานขึ้น (เจ้าของเคาะ 4 พ.ย. 2569 · ขยับยาวขึ้น 9 พ.ย. 2569)
 * เหตุ 4 พ.ย.: Moody Keyanna / Jenny Audra / Kaufmann Brooke โดนจำกัดวันละครั้ง 2–4 พ.ย. ทุกครั้งที่พ้นพัก 24 ชม.
 * เหตุ 9 พ.ย.: ดู 67 ครั้งใน 7 วัน — 45 ครั้งโดนตอนที่วันนั้นยังไม่ได้โพสต์เลย (โดนค้างมาจากวันก่อน)
 *   พัก 1–3 วันแล้วกลับมาก็โดนทันที จึงพักครั้งแรก 3 วัน · ครั้งที่ 2 7 วัน · ครั้งที่ 3 ขึ้นไป 14 วัน
 *   และหลังพ้นพักให้โพสต์ทีละน้อยก่อน (post-pacing.js: recoveryCapAfterLimit)
 * เหตุ 9 พ.ย. (รอบ 2): ไล่ 29 บัญชีที่โดน — Facebook จำกัดจริง 3–7 วัน (บัญชีที่โดน 4 พ.ย. ยังโดนอยู่ 9 พ.ย.)
 *   พัก 3 วันยังสั้นไป จึงพักครั้งแรก 7 วัน · ครั้งที่ 2 14 วัน · ครั้งที่ 3 ขึ้นไป 28 วัน
 *   นับครั้งย้อนหลัง 30 วัน (พักเกิน 7 วันแล้ว หน้าต่าง 7 วันนับครั้งก่อนไม่ทัน)
 *   พ้นพักแล้ววันแรกโพสต์ได้ 1 กลุ่ม (โพสต์หยั่ง) — โดนอีกก็พักขั้นถัดไปเอง (post-pacing.js: recoveryCapAfterLimit)
 * 13 พ.ย. 2569: อ่านวันปลดล็อกจากหน้า Facebook ได้ = พักถึงวันนั้น (fb-restriction-date.js) · พ้นพักแล้วอุ่นเครื่อง 2 วันก่อนโพสต์
 *   โดนครบ 4 ครั้ง = เลิกใช้โพสต์ (ไม่ลบ คืนได้จากหน้าบัญชี)
 * บัญชีที่ถูกพัก Jarvis เลือกไม่ได้อยู่แล้ว — พักนานขึ้น = ไม่ให้เลือกนานพอ
 */

/** ข้อความขึ้นต้นของบันทึกรอบตอนโดนจำกัด — ใช้นับครั้งที่โดน (นิยามเดียว ห้ามเปลี่ยนคำโดยไม่แก้ตัวนับ) */
const FB_LIMIT_LOG_PREFIX = 'Facebook จำกัดการโพสต์ของบัญชีนี้';
const STRIKE_WINDOW_DAYS = 30;

/**
 * อุ่นเครื่องก่อนกลับมาโพสต์ (เจ้าของเคาะ 13 พ.ย. 2569): ต่อท้ายเวลาพักอีก 2 วัน ช่วงนี้รับงานอุ่นเครื่องได้แต่ยังไม่โพสต์
 * เหตุ: 10–11 พ.ย. 3 ใน 5 ครั้งที่โดน เป็นบัญชีที่เพิ่งพ้นพักแล้วโพสต์หยั่งทันที
 */
const LIMIT_WARMUP_DAYS = 2;

/**
 * โดนครบกี่ครั้งแล้วเลิกส่งงานโพสต์ (เจ้าของเคาะ 13 พ.ย. 2569: ครบ 4 ครั้ง · ไม่ลบบัญชี คืนได้จากปุ่ม "กลับมาใช้โพสต์")
 * นับทุกครั้งตั้งแต่ครั้งล่าสุดที่คนกดกลับมาใช้โพสต์ (ไม่จำกัดช่วงวัน)
 * ใช้กลไกพักเดิม (พักถึงปี 2099) ทุกที่ที่กันบัญชีพักอยู่แล้ว — Jarvis รอบเช้า คิวงาน — จึงกันบัญชีนี้ด้วย
 */
const RETIRE_AT_STRIKES = 4;
const RETIRED_REASON_PREFIX = 'เลิกใช้โพสต์';
const RETIRED_UNTIL = '2099-12-31T00:00:00Z';
/** บันทึกรอบตอนคนกดกลับมาใช้โพสต์ — จุดเริ่มนับครั้งใหม่ */
const RETURN_LOG_PREFIX = 'กลับมาใช้โพสต์';

/** พักได้นานสุด (pauseUser ตัดที่ค่านี้) — วันปลดล็อกที่ Facebook บอกไม่เกิน 60 วัน + อุ่นเครื่อง */
const MAX_PAUSE_HOURS = (60 + LIMIT_WARMUP_DAYS) * 24;

/** ครั้งที่โดนใน 30 วัน (รวมครั้งนี้) → ชั่วโมงพัก: ครั้งแรก 7 วัน · ครั้งที่ 2 14 วัน · ครั้งที่ 3 ขึ้นไป 28 วัน (ค่าตั้งต้นที่ยาวกว่าชนะ) */
function facebookLimitPauseHours(strikes, baseHours = 7 * 24) {
  const base = Math.max(1, Number(baseHours) || 7 * 24);
  const n = Math.max(1, Number(strikes) || 1);
  if (n >= 3) return Math.max(base, 28 * 24);
  if (n === 2) return Math.max(base, 14 * 24);
  return Math.max(base, 7 * 24);
}

function durationText(hours) {
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24} วัน` : `${hours} ชม.`;
}

function thaiDate(d) {
  return new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * ข้อความเหตุตอนพัก (ขึ้นต้นด้วยคำที่ตัวนับใช้)
 * @param {number} strikes ครั้งที่ใน 30 วัน
 * @param {number} hours ชั่วโมงพักก่อนอุ่นเครื่อง
 * @param {{ until?: Date|null, warmupDays?: number }} [opts] until = วันปลดล็อกที่อ่านได้จาก Facebook
 */
function facebookLimitReason(strikes, hours, opts = {}) {
  const warm = Number(opts.warmupDays) > 0 ? ` + อุ่นเครื่อง ${opts.warmupDays} วัน` : '';
  const rest = opts.until ? `Facebook บอกว่าปลดล็อก ${thaiDate(opts.until)} พักถึงวันนั้น${warm}` : `พัก ${durationText(hours)}${warm}`;
  return `${FB_LIMIT_LOG_PREFIX} (ครั้งที่ ${strikes} ใน ${STRIKE_WINDOW_DAYS} วัน) — ${rest} ไม่โพสต์กลุ่มที่เหลือ`;
}

/** บันทึกรอบตอนโดนครั้งที่ทำให้เลิกใช้โพสต์ (ขึ้นต้นด้วยคำที่ตัวนับใช้ จึงนับเป็นครั้งที่โดนด้วย) */
function facebookLimitRetireLog(total) {
  return `${FB_LIMIT_LOG_PREFIX} (ครบ ${total} ครั้ง) — เลิกใช้บัญชีนี้โพสต์ กด "กลับมาใช้โพสต์" ที่หน้าบัญชีถ้าจะใช้ต่อ`;
}

/** pause_reason ของบัญชีที่เลิกใช้โพสต์ */
function retiredReason(total) {
  return `${RETIRED_REASON_PREFIX} — Facebook จำกัดการโพสต์ครบ ${total} ครั้ง`;
}

function isRetiredReason(reason) {
  return String(reason || '').startsWith(RETIRED_REASON_PREFIX);
}

/** อยู่ในช่วงอุ่นเครื่องหลังพัก: พักเพราะโดนจำกัด และเหลือเวลาพักไม่เกิน LIMIT_WARMUP_DAYS */
function inLimitWarmupWindow(user, now = Date.now()) {
  if (!String(user?.pause_reason || '').startsWith(FB_LIMIT_LOG_PREFIX)) return false;
  const until = user?.paused_until ? new Date(user.paused_until).getTime() : NaN;
  return Number.isFinite(until) && until > now && until - now <= LIMIT_WARMUP_DAYS * 86_400_000;
}

/**
 * SQL นับครั้งที่โดนจำกัดตั้งแต่คนกดกลับมาใช้โพสต์ครั้งล่าสุด — ที่เดียว ใช้ทั้งเครื่องโพสต์และหน้าเว็บ
 * @param {string} logsTable ชื่อตาราง run_logs (ใส่ schema ได้)
 * @param {string} userExpr นิพจน์ id บัญชี เช่น '$1' หรือ 'u.id'
 */
function strikesSinceReturnSql(logsTable, userExpr) {
  return `(SELECT count(*)::int FROM ${logsTable} l
            WHERE l.user_id::text = ${userExpr}::text AND l.message LIKE '${FB_LIMIT_LOG_PREFIX}%'
              AND l.created_at > COALESCE((SELECT max(r.created_at) FROM ${logsTable} r
                                            WHERE r.user_id::text = ${userExpr}::text AND r.message LIKE '${RETURN_LOG_PREFIX}%'), '-infinity'::timestamptz))`;
}

/**
 * กลับมาใช้โพสต์ (ปุ่มหน้าบัญชี): อุ่นเครื่อง 2 วันก่อน แล้วโพสต์หยั่งตามจังหวะหลังพัก · นับครั้งใหม่จากตอนนี้
 * คืนคำสั่ง SQL 2 ชุด (แก้บัญชี + บันทึกรอบ) ให้ผู้เรียกรันใน transaction เดียว
 */
function returnToPostingStatements(usersTable, logsTable, userId, actor) {
  const who = String(actor || '').trim() || 'ไม่ระบุ';
  return [
    {
      sql: `UPDATE ${usersTable}
               SET paused_until = NOW() + ($2::int * INTERVAL '1 day'),
                   pause_reason = $3, updated_at = NOW()
             WHERE id = $1 AND pause_reason LIKE '${RETIRED_REASON_PREFIX}%'
         RETURNING id`,
      params: [String(userId), LIMIT_WARMUP_DAYS, `${FB_LIMIT_LOG_PREFIX} — กลับมาใช้โพสต์ อุ่นเครื่อง ${LIMIT_WARMUP_DAYS} วันก่อนโพสต์`],
    },
    {
      sql: `INSERT INTO ${logsTable} (id, run_id, user_id, level, message, meta) VALUES (gen_random_uuid()::text, '', $1, 'info', $2, $3::jsonb)`,
      params: [String(userId), `${RETURN_LOG_PREFIX} — ${who} กดให้บัญชีนี้กลับมาโพสต์ (นับครั้งที่โดนจำกัดใหม่)`, JSON.stringify({ kind: 'return_to_posting', by: who })],
    },
  ];
}

module.exports = {
  FB_LIMIT_LOG_PREFIX,
  STRIKE_WINDOW_DAYS,
  MAX_PAUSE_HOURS,
  LIMIT_WARMUP_DAYS,
  RETIRE_AT_STRIKES,
  RETIRED_REASON_PREFIX,
  RETIRED_UNTIL,
  RETURN_LOG_PREFIX,
  facebookLimitPauseHours,
  facebookLimitReason,
  facebookLimitRetireLog,
  retiredReason,
  isRetiredReason,
  inLimitWarmupWindow,
  strikesSinceReturnSql,
  returnToPostingStatements,
};
