/**
 * บันทึก Log การทำงานลง Database
 * เครื่องที่มี DATABASE_URL เขียนลงฐานตรง (8 พ.ย. 2569: ทุกบรรทัดบันทึกเคยเป็น 1 ครั้งที่เรียกเว็บ so-autopost
 * ส่วนหนึ่งของภาระที่ทำให้ Vercel ปิดทั้งทีม) · ไม่มี DATABASE_URL = ส่งผ่าน API แบบเดิม
 * ตัวนับ "โดน Facebook จำกัดกี่ครั้ง" อ่านจากตารางนี้ — บันทึกต้องลงฐานจริง
 */
const API_URL = process.env.RUN_LOG_API_URL || 'http://localhost:3000';

export interface RunLogData {
  run_id: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  message: string;
  assignment_id?: string;
  user_id?: string;
  job_id?: string;
  group_id?: string;
  meta?: Record<string, unknown>;
}

export async function runLog(data: Omit<RunLogData, 'run_id'>): Promise<void> {
  const runId = process.env.RUN_ID;
  if (!runId) return;
  if (process.env.DATABASE_URL && process.env.WORKER_USE_HTTP_API !== '1') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const db = require('../../server/db');
      await db.createRunLog({ ...data, run_id: runId });
      return;
    } catch (e) {
      // เขียนตรงไม่ได้ → ลองผ่าน API แทน (บันทึกไม่ควรหาย)
      console.warn(`[runLog] เขียนลงฐานตรงไม่สำเร็จ: ${(e as Error).message} → ลองผ่าน API`);
    }
  }
  try {
    await fetch(`${API_URL}/api/run-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, run_id: runId }),
    });
  } catch {
    // Silent fail - don't break the bot if logging fails
  }
}
