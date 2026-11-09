import 'server-only';
import { q } from './db';
import { FB_LIMIT_LOG_PREFIX } from '../../autopost/server/fb-limit-pause.js';
import { dailyCapCeiling } from '../../autopost/server/post-pacing.js';

const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;

export type FbLimitEvent = {
  at: string;
  account: string;
  /** โพสต์ไปแล้วกี่กลุ่มในวันนั้นก่อนโดน */
  posted_that_day: number;
  /** โพสต์ใน 7 วันก่อนโดน */
  posted_7d: number;
  /** อายุบัญชี (วัน) นับจากโพสต์แรก ณ ตอนโดน */
  age_days: number | null;
  /** ครั้งที่เท่าไรใน 7 วัน (จากข้อความที่บันทึก) */
  strike: number | null;
};

export type FbLimitStats = {
  days: number;
  events: FbLimitEvent[];
  total: number;
  /** โดนตอนที่วันนั้นยังไม่ได้โพสต์เลย = โดนค้างจากวันก่อน */
  carried_over: number;
  /** ค่ากลางของ "โพสต์ไปแล้วกี่กลุ่มในวันนั้น" เฉพาะครั้งที่วันนั้นโพสต์แล้ว · null = ยังไม่มีข้อมูล */
  median_posted_that_day: number | null;
  /** 80% ของค่ากลาง ปัดลง — ตัวเลขที่เจ้าของใช้ตั้งเพดาน (ไม่ตั้งให้เอง) */
  suggested_cap: number | null;
  /** เพดานระบบตอนนี้ */
  current_cap: number;
};

/**
 * ทุกครั้งที่ Facebook จำกัดบัญชีใน N วัน พร้อมตัวเลขก่อนโดน — อ่านจากบันทึกรอบ (ข้อความขึ้นต้นด้วย FB_LIMIT_LOG_PREFIX)
 * กับ post_logs ย้อนหลัง จึงมีข้อมูลตั้งแต่ก่อนทำหน้านี้ · เจ้าของ 9 พ.ย. 2569: ตั้ง 80% จากของจริง ไม่เดา
 */
export async function facebookLimitStats(days = 30): Promise<FbLimitStats> {
  const rows = await q<{
    at: string; account: string; posted_that_day: number; posted_7d: number; age_days: number | null; message: string;
  }>(
    `WITH hits AS (
       SELECT l.user_id, l.created_at AS hit_at, l.message
         FROM ${AP}.run_logs l
        WHERE l.message LIKE $1 AND l.created_at > now() - ($2::int * interval '1 day')
     )
     SELECT h.hit_at AS at, COALESCE(NULLIF(TRIM(u.name), ''), u.env_key, h.user_id) AS account, h.message,
            (SELECT count(*)::int FROM ${AP}.post_logs p
              WHERE p.user_id = h.user_id AND p.created_at < h.hit_at
                AND (p.created_at AT TIME ZONE 'Asia/Bangkok')::date = (h.hit_at AT TIME ZONE 'Asia/Bangkok')::date) AS posted_that_day,
            (SELECT count(*)::int FROM ${AP}.post_logs p
              WHERE p.user_id = h.user_id AND p.created_at < h.hit_at AND p.created_at > h.hit_at - interval '7 days') AS posted_7d,
            (SELECT EXTRACT(EPOCH FROM (h.hit_at - MIN(p.created_at))) / 86400.0 FROM ${AP}.post_logs p
              WHERE p.user_id = h.user_id AND p.created_at < h.hit_at) AS age_days
       FROM hits h LEFT JOIN ${AP}.users u ON u.id = h.user_id
      ORDER BY h.hit_at DESC`,
    [`${FB_LIMIT_LOG_PREFIX}%`, days],
  ).catch((e) => {
    console.warn(`[fb-limit-stats] อ่านสถิติไม่ได้: ${(e as Error).message}`);
    return [];
  });
  const events: FbLimitEvent[] = rows.map((r) => ({
    at: r.at,
    account: r.account,
    posted_that_day: Number(r.posted_that_day),
    posted_7d: Number(r.posted_7d),
    age_days: r.age_days == null ? null : Math.floor(Number(r.age_days)),
    strike: Number(/ครั้งที่ (\d+)/.exec(r.message ?? '')?.[1]) || null,
  }));
  const sameDay = events.map((e) => e.posted_that_day).filter((n) => n > 0).sort((a, b) => a - b);
  const median = sameDay.length ? sameDay[Math.floor((sameDay.length - 1) / 2)] : null;
  return {
    days,
    events,
    total: events.length,
    carried_over: events.length - sameDay.length,
    median_posted_that_day: median,
    suggested_cap: median == null ? null : Math.max(1, Math.floor(median * 0.8)),
    current_cap: dailyCapCeiling(),
  };
}
