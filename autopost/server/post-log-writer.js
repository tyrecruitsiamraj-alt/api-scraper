/**
 * บันทึก post_logs 1 แถวต่อกลุ่มที่โพสต์ (ลิงก์โพสต์ + สถานะ อนุมัติเเล้ว/รออนุมัติ)
 *
 * ลำดับ:
 *   1. มี DATABASE_URL → เขียนตรงลง Postgres ผ่าน server/db (เหมือน loadConfig/postPlan ของ worker)
 *   2. ไม่มี / เขียนตรงพัง → POST /api/post-logs พร้อม x-worker-token (+ x-autopost-token ถ้ามี)
 *      เดิมส่งไม่มี token เลย → access gate ตอบ 401 แบบเงียบ post_logs จึงว่าง
 *
 * dependency ทั้งหมดฉีดเข้ามา (db/fetch/env/logger) — ไฟล์นี้ไม่ require pg เพื่อให้เทสต์ได้โดยไม่ต้องมี DB
 */

const DEFAULT_FETCH_MS = 12000;

function fetchTimeoutMs(env) {
  return Math.min(60000, Math.max(3000, Number(env.POST_LOG_FETCH_MS) || DEFAULT_FETCH_MS));
}

function linkLabel(row) {
  const link = String(row.post_link || '').trim();
  return `${link || '(ไม่มีลิงก์)'} [${row.post_status || '-'}] job=${row.job_id || '-'} group=${row.group_id || '-'}`;
}

async function writeViaApi(row, { env, fetchImpl }) {
  const apiUrl = String(env.RUN_LOG_API_URL || 'http://localhost:3000').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  const workerToken = String(env.POST_WORKER_TOKEN || '').trim();
  const accessToken = String(env.AUTOPOST_ACCESS_TOKEN || '').trim();
  if (workerToken) headers['x-worker-token'] = workerToken;
  if (accessToken) headers['x-autopost-token'] = accessToken;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), fetchTimeoutMs(env));
  try {
    const res = await fetchImpl(`${apiUrl}/api/post-logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(row),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${apiUrl}/api/post-logs ตอบ ${res.status} ${body.slice(0, 200)}`.trim());
    }
  } finally {
    clearTimeout(t);
  }
}

/**
 * @returns {Promise<'db' | 'api' | 'skipped' | 'failed'>} ช่องทางที่บันทึกสำเร็จ
 */
async function writePostLog(data, deps = {}) {
  const env = deps.env || process.env;
  const logger = deps.logger || console;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const runId = String(env.RUN_ID || '').trim() || null;
  const row = { ...data, run_id: runId };

  if (env.DATABASE_URL) {
    try {
      const db = deps.loadDb ? deps.loadDb() : require('./db');
      await db.createPostLog(row);
      logger.log(`[postLog] บันทึก post_logs (DB) ${linkLabel(row)}`);
      return 'db';
    } catch (e) {
      logger.warn(`[postLog] เขียน post_logs ตรงลง DB ไม่สำเร็จ: ${e.message || e} → ลองผ่าน API`);
    }
  }

  // /api/post-logs บังคับ run_id — ไม่มี RUN_ID (รันมือแบบ data/*.json) ก็ไม่มีที่ส่ง
  if (!runId) {
    logger.warn(`[postLog] ไม่มี DATABASE_URL/RUN_ID — ไม่ได้บันทึก post_logs ${linkLabel(row)}`);
    return 'skipped';
  }
  try {
    await writeViaApi(row, { env, fetchImpl });
    logger.log(`[postLog] บันทึก post_logs (API) ${linkLabel(row)}`);
    return 'api';
  } catch (e) {
    logger.warn(
      `[postLog] บันทึก post_logs ไม่สำเร็จ: ${e.message || e} → ตรวจ DATABASE_URL / POST_WORKER_TOKEN / RUN_LOG_API_URL | ${linkLabel(row)}`
    );
    return 'failed';
  }
}

module.exports = { writePostLog };
