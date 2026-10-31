/**
 * เวลาจำกัดของรอบเก็บคอมเมนต์ 1 รอบ คิดตามจำนวนโพสต์
 *
 * เดิมตายตัว 6 ชม. (WORKER_COLLECT_JOB_MAX_MS) รอบที่ค้าง (เช่น ติดหน้ายืนยันตัวตน) จึงกินช่องไป 6 ชม.
 * ทั้งที่ 3 โพสต์ปกติใช้ไม่ถึง 30 นาที (Tarris Mcreynolds ค้าง 6 ชม. ซ้ำ 2 รอบ · 29–30 ต.ค. 2569)
 * ตอนนี้ = เวลาเปิด/ล็อกอิน + นาทีต่อโพสต์ × จำนวนโพสต์ ไม่เกินค่าสูงสุดเดิม
 */

const MIN = 60 * 1000;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** @returns {number} ms */
function collectJobTimeoutMs(postCount, env = process.env) {
  const ceilingMs = Math.min(12 * 60 * MIN, Math.max(10 * MIN, num(env.WORKER_COLLECT_JOB_MAX_MS, 6 * 60 * MIN)));
  const setupMs = num(env.WORKER_COLLECT_JOB_SETUP_MS, 20 * MIN);
  const perPostMs = num(env.WORKER_COLLECT_JOB_MS_PER_POST, 10 * MIN);
  const posts = Math.max(1, Math.floor(num(postCount, 1)));
  return Math.min(ceilingMs, setupMs + posts * perPostMs);
}

module.exports = { collectJobTimeoutMs };
