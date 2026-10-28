/**
 * เวลาจำกัดของงานโพสต์ 1 รอบ คิดตามจำนวนกลุ่มที่จะโพสต์
 *
 * เดิมตายตัว 25 นาที (WORKER_POST_JOB_MAX_MS) แต่ 1 กลุ่มใช้ราว 4–5 นาที (โพสต์ + หน่วงแบบคน + เก็บลิงก์)
 * รอบ 15 กลุ่มจึงโดนตัดหลังกลุ่มที่ 5. ตอนนี้ = เวลาเปิด/ล็อกอิน + นาทีต่อกลุ่ม × จำนวนกลุ่ม
 * + เวลาพักหลังโพสต์ครบทุก batch (ค่าสูงสุดของช่วงพัก)
 * โดยไม่ต่ำกว่าค่าเดิม และไม่เกินเวลาที่ sweep-stale จะปิดงานว่าค้าง (POST_RUN_STALE_MINUTES)
 */

const MIN = 60 * 1000;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** @returns {number} ms */
function postJobTimeoutMs(groupCount, env = process.env) {
  const floorMs = Math.max(5 * MIN, num(env.WORKER_POST_JOB_MAX_MS, 25 * MIN));
  const perGroupMs = num(env.WORKER_POST_JOB_MS_PER_GROUP, 6 * MIN);
  const setupMs = num(env.WORKER_POST_JOB_SETUP_MS, 10 * MIN);
  const staleMin = Math.min(24 * 60, Math.max(15, num(env.POST_RUN_STALE_MINUTES, 180)));
  // ให้งานจบหรือโดนตัดก่อน sweep-stale ของ server จะปิดว่าค้าง
  const ceilingMs = Math.max(floorMs, (staleMin - 5) * MIN);
  const groups = Math.max(0, Math.floor(num(groupCount, 0)));
  // พักตาม batch: โพสต์ครบทุก batch กลุ่ม บอทพัก 5–15 นาที (HUMAN_BATCH_BREAK_*_SEC) — ต้องนับด้วย
  // ไม่งั้นงานเกิน 5 กลุ่มโดนตัดระหว่างพัก (OPL6906091 11 กลุ่ม โดนตัดที่ 75 นาที หลังโพสต์ได้ 10 กลุ่ม — 28 ต.ค. 2569)
  const batchSize = Math.max(1, Math.floor(num(env.HUMAN_BATCH_SIZE, 5)));
  const breakMs = Math.max(0, num(env.HUMAN_BATCH_BREAK_MAX_SEC, 900)) * 1000;
  const breaks = groups > 0 ? Math.floor((groups - 1) / batchSize) : 0;
  const wanted = setupMs + groups * perGroupMs + breaks * breakMs;
  return Math.min(ceilingMs, Math.max(floorMs, wanted));
}

function toIdArray(value) {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

/**
 * จำนวนกลุ่มที่งานนี้จะโพสต์: กลุ่มของ assignment ที่ส่งมา (ว่าง = ใช้กลุ่มของบัญชี แบบเดียวกับ worker)
 * งานรอบอัตโนมัติไม่ส่ง assignment มา = ทุก assignment ของบัญชี
 * @param {{ assignment_ids?: unknown, user_id?: string }} job
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} db
 */
async function countJobGroups(job, db) {
  const userId = String(job?.user_id || '');
  const ids = toIdArray(job?.assignment_ids);
  const userRows = userId
    ? (await db.query('SELECT group_ids FROM users WHERE id = $1', [userId])).rows
    : [];
  const userGroups = toIdArray(userRows[0]?.group_ids);
  const assignments = ids.length
    ? (await db.query('SELECT group_ids FROM assignments WHERE id = ANY($1::text[])', [ids])).rows
    : userId
      ? (await db.query('SELECT group_ids FROM assignments WHERE user_id = $1', [userId])).rows
      : [];
  const groups = new Set();
  for (const a of assignments) {
    const own = toIdArray(a.group_ids);
    for (const g of own.length ? own : userGroups) groups.add(g);
  }
  return groups.size;
}

module.exports = { postJobTimeoutMs, countJobGroups };
