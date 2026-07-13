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

/** circuit breaker: พักบัญชีเมื่อโพสต์ fail ติดกัน */
export async function pauseUserPosting(
  userId: string,
  hours: number,
  reason: string
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('../../server/db');
  await db.pauseUser(userId, hours, reason);
}

export function getFailStreakLimit(): number {
  return Math.max(2, Number(process.env.POST_FAIL_STREAK_LIMIT) || 5);
}

export function getPauseHours(): number {
  return Math.min(7 * 24, Math.max(1, Number(process.env.POST_PAUSE_HOURS) || 24));
}
