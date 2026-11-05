/**
 * แผนโพสต์รายวันต่อบัญชี — wrapper เรียก server/db (เหมือน loadConfig)
 * นโยบายอยู่ฝั่ง db.buildDailyPostPlan: cap/วัน + วอร์มบัญชีใหม่ + cooldown คู่ job+group + เรียงตาม yield
 * ไม่มี DATABASE_URL (โหมด data/*.json) → คืน null ให้ postAll ใช้พฤติกรรมเดิม (โพสต์ทุกกลุ่ม)
 */

export interface DailyPlanItem {
  assignment_id: string;
  job_id: string;
  group_row_id: string;
  fb_group_id: string;
  group_name: string | null;
  sheet_url: string | null;
  tier: 'proven' | 'quiet' | 'explore';
  score: number;
  posts?: number;
  phones?: number;
  comments?: number;
  last_posted?: string | null;
}

export interface DailyPostPlan {
  user_id: string;
  budget: number;
  items: DailyPlanItem[];
  reason?: 'paused' | 'daily_cap_reached' | 'no_candidates';
  cap?: number;
  posted_today?: number;
  candidates?: number;
  cooldown_skipped?: number;
  reserved_by_others?: number;
  over_cap_override?: boolean;
  paused_until?: string;
  pause_reason?: string | null;
  tiers?: { proven: number; quiet: number; explore: number };
}

export async function buildDailyPostPlanForUser(
  userId: string,
  assignmentIds?: string[],
  opts?: { ignoreCap?: boolean; ignorePause?: boolean }
): Promise<DailyPostPlan | null> {
  if (!process.env.DATABASE_URL) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('../../server/db');
  return db.buildDailyPostPlan(userId, {
    assignment_ids: assignmentIds || [],
    ignoreCap: !!opts?.ignoreCap,
    ignorePause: !!opts?.ignorePause,
  });
}

/**
 * Facebook บอกว่าบัญชีนี้ถูกจำกัด (ไม่ใช่แค่กลุ่มนี้) — โพสต์กลุ่มถัดไปก็โดนเหมือนกันและยิ่งทำให้บัญชีแย่ลง
 * ข้อความจริง 1 พ.ย. 2569: "เราได้จำกัดจำนวนการโพสต์ แสดงความเห็น หรือทำสิ่งอื่นๆ ของคุณเป็นระยะเวลานึงเพื่อป้องกันการสแปม"
 */
export function isAccountLimitedMessage(message: string | undefined): boolean {
  return /จำกัดจำนวนการโพสต์|บล็อกชั่วคราว|limit how often|temporarily blocked|temporarily restricted/i.test(String(message || ''));
}

/**
 * circuit breaker: พักบัญชีเมื่อโพสต์ fail ติดกัน
 * เครื่อง worker ที่ไม่มี DATABASE_URL ต้องพักผ่าน API ของเซิร์ฟเวอร์ (เดิมเงียบหายไม่พักจริง)
 */
export async function pauseUserPosting(
  userId: string,
  hours: number,
  reason: string
): Promise<void> {
  if (process.env.DATABASE_URL) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../../server/db');
    const row = await db.pauseUser(userId, hours, reason);
    if (!row) throw new Error(`ไม่พบบัญชี ${userId}`);
    return;
  }
  const base = String(process.env.RUN_LOG_API_URL || '').replace(/\/$/, '');
  const token = String(process.env.POST_WORKER_TOKEN || '').trim();
  if (!base) throw new Error('ไม่มี RUN_LOG_API_URL และ DATABASE_URL — พักบัญชีไม่ได้');
  const res = await fetch(`${base}/api/worker/post/pause-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-token': token },
    body: JSON.stringify({ user_id: userId, hours, reason }),
  });
  if (!res.ok) throw new Error(`พักบัญชีไม่สำเร็จ (HTTP ${res.status})`);
}

/**
 * Facebook จำกัดการโพสต์ของบัญชี — พักตามจำนวนครั้งที่โดนใน 7 วัน (ครั้งแรก 24 ชม. · ครั้งที่ 2 72 ชม. · 3 ขึ้นไป 7 วัน)
 * คืนข้อความเหตุที่ใช้บันทึกรอบ (ขึ้นต้นด้วยคำเดียวกับที่ตัวนับใช้)
 */
export async function pauseUserForFacebookLimit(
  userId: string,
  baseHours: number
): Promise<{ hours: number; strikes: number; reason: string }> {
  if (process.env.DATABASE_URL) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../../server/db');
    const row = await db.pauseUserForFacebookLimit(userId, baseHours);
    if (!row) throw new Error(`ไม่พบบัญชี ${userId}`);
    return { hours: row.hours, strikes: row.strikes, reason: row.reason };
  }
  const base = String(process.env.RUN_LOG_API_URL || '').replace(/\/$/, '');
  const token = String(process.env.POST_WORKER_TOKEN || '').trim();
  if (!base) throw new Error('ไม่มี RUN_LOG_API_URL และ DATABASE_URL — พักบัญชีไม่ได้');
  const res = await fetch(`${base}/api/worker/post/pause-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-token': token },
    body: JSON.stringify({ user_id: userId, hours: baseHours, kind: 'fb_limited' }),
  });
  if (!res.ok) throw new Error(`พักบัญชีไม่สำเร็จ (HTTP ${res.status})`);
  const data = (await res.json().catch(() => ({}))) as { user?: { hours?: number; strikes?: number; reason?: string } };
  const user = data.user || {};
  if (!user.reason) throw new Error('เซิร์ฟเวอร์ยังไม่รองรับการพักแบบนับครั้ง (อัปเดตเว็บ Autopost ก่อน)');
  return { hours: Number(user.hours) || baseHours, strikes: Number(user.strikes) || 1, reason: user.reason };
}

export type HandoffResult = { account: { id: string; label: string }; groups: number; skipped: number } | null;

/**
 * บัญชีโพสต์ต่อไม่ได้แต่ยังเหลือกลุ่ม — ส่งกลุ่มที่เหลือให้บัญชีอื่นที่ว่างโพสต์แทน
 * คืน null เมื่อไม่มีบัญชีว่าง (ผู้เรียกบันทึกบันทึกรอบไว้ให้คนเห็น ไม่เงียบ)
 */
export async function handoffRemainingGroups(
  fromUserId: string,
  jobIds: string[],
  groupIds: string[],
  requestedBy?: string
): Promise<HandoffResult> {
  if (!groupIds.length || !jobIds.length) return null;
  if (process.env.DATABASE_URL) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const db = require('../../server/db');
    return (await db.handoffRemainingGroups({ fromUserId, jobIds, groupIds, requestedBy })) || null;
  }
  const base = String(process.env.RUN_LOG_API_URL || '').replace(/\/$/, '');
  const token = String(process.env.POST_WORKER_TOKEN || '').trim();
  if (!base) return null;
  const res = await fetch(`${base}/api/worker/post/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-token': token },
    body: JSON.stringify({ from_user_id: fromUserId, job_ids: jobIds, group_ids: groupIds, requested_by: requestedBy || 'handoff' }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { handoff?: HandoffResult };
  return data.handoff || null;
}

export function getFailStreakLimit(): number {
  return Math.max(2, Number(process.env.POST_FAIL_STREAK_LIMIT) || 5);
}

export function getPauseHours(): number {
  return Math.min(7 * 24, Math.max(1, Number(process.env.POST_PAUSE_HOURS) || 24));
}
