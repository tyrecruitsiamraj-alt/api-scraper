import 'server-only';
import { q } from './db';
import { loadLatestGroupOutcomes, type GroupOutcomeState } from './post-tasks';
import { REPOST_MIN_GAP_DAYS } from './repo';
import { classifyGroupOutcome, GROUP_STATE } from '../../src/core/group-outcome.js';

/**
 * ข้อมูลให้ Jarvis ใช้ตอนพนักงานเลือก บัญชี Facebook / กลุ่ม / เครื่อง / บัญชี Scrap ก่อนสั่งงาน
 * อ่านอย่างเดียว ตัวเลขโควต้าคิดแบบเดียวกับ worker (autopost/server/db.js getEffectiveDailyCap)
 */

const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;
const BANGKOK_DAY_START = `((now() AT TIME ZONE 'Asia/Bangkok')::date::timestamp AT TIME ZONE 'Asia/Bangkok')`;
const ONLINE = `interval '2 minutes'`;
/** ชื่อกลุ่มที่ระบบตั้งไว้ชั่วคราวตอนเพิ่มด้วยเลขกลุ่ม — ยังไม่ใช่ชื่อจริงบน Facebook */
const PLACEHOLDER_NAME = /^Group\s+\d+$/i;

/** needs_verification = Facebook ขอยืนยันตัวตน ต้องมีคนไปทำที่เครื่องก่อน (3 พ.ย. 2569 เคยส่งเป็น ready ทั้งที่ติดธง) */
export type AccountStatus = 'ready' | 'full' | 'paused' | 'busy' | 'worker_offline' | 'no_worker' | 'needs_verification';

export type JarvisAccountOption = {
  id: string;
  name: string;
  worker: string | null;
  worker_online: boolean;
  posted_today: number;
  daily_cap: number;
  remaining_today: number;
  paused_until: string | null;
  pause_reason: string | null;
  /** Facebook ขอยืนยันตัวตนตั้งแต่เมื่อไร — null = ไม่ติด */
  needs_verification_since: string | null;
  needs_verification_note: string | null;
  /** งานโพสต์ของบัญชีนี้ที่ยังไม่จบ (1 บัญชีโพสต์ได้ทีละงาน) */
  queue: { running: number; queued: number };
  status: AccountStatus;
  /** ข้อความภาษาไทยสำหรับแจ้งพนักงาน (เช่น popup) — null เมื่อพร้อม */
  warning: string | null;
  /** ใช้ได้เลย: พร้อมโพสต์ ไม่มีคำเตือน (บัญชีที่ยังไม่เคยล็อกอินก็นับว่าใช้ได้) — true ได้หลายบัญชี Jarvis เลือกตัวแรกตาม sort_rank */
  recommended: boolean;
  /** ลำดับที่ควรแสดง: 0 พร้อมและล็อกอินอยู่บนเครื่องออนไลน์ · 1 พร้อมแต่ยังไม่เคยล็อกอิน · 2 ใช้ได้แต่มีเงื่อนไข (มีงานค้าง/โควต้าเต็ม/เครื่องออฟไลน์) · 3 ใช้ไม่ได้ (ถูกพัก/ต้องยืนยันตัวตน) */
  sort_rank: 0 | 1 | 2 | 3;
  /** กลุ่มที่บัญชีนี้เลือกโพสต์ได้ = ทุกกลุ่มในระบบ (กลุ่มไม่ได้ผูกกับบัญชี) */
  group_ids: string[];
  /** กลุ่มที่ตั้งไว้กับบัญชีนี้ในหน้าตั้งค่า (ใช้กับโพสต์อัตโนมัติรายวัน) */
  home_group_ids: string[];
  /** เครื่องที่มี session ล็อกอินบัญชีนี้อยู่ (โพสต์จากเครื่องอื่นได้ แต่ต้องล็อกอินใหม่บนเครื่องนั้น) */
  session_workers: string[];
  /** ธุรกิจของบัญชี LBD/LBA/LM — null = ยังไม่ได้เลือก */
  department: string | null;
  /**
   * ผลล่าสุด (30 วัน) ของบัญชีนี้ในแต่ละกลุ่ม — เฉพาะกลุ่มที่เคยลองโพสต์
   * กลุ่มที่ไม่อยู่ในรายการ = ยังไม่เคยลอง (state 'never', ติ๊กได้)
   * recommended=false: ไม่ควรติ๊กให้ตั้งแต่แรก ลองไปก็ไม่ได้โพสต์จนกว่าคนจะไปแก้ที่ Facebook
   */
  group_status: JarvisGroupStatus[];
};

export type JarvisGroupStatus = {
  /** id กลุ่มในระบบ (ตรงกับ JarvisGroupOption.id) */
  group_id: string;
  state: GroupOutcomeState;
  /** คำบนจอ เช่น "ต้องเข้ากลุ่มเอง (มีคำถาม)" */
  label: string;
  recommended: boolean;
  /** ข้อความที่ Facebook หรือหน้ากลุ่มแสดง (ถ้ามี) */
  detail: string | null;
  /** ลิงก์ให้คนกดไปแก้: หน้ากลุ่ม / โพสต์ที่รออนุมัติ */
  url: string;
  seen_at: string;
};

export type JarvisGroupOption = {
  id: string;
  fb_group_id: string;
  /** ชื่อกลุ่มบน Facebook — null ถ้าบอทยังไม่เคยเข้าไปอ่าน */
  name: string | null;
  url: string;
  /**
   * ว่างเสมอตั้งแต่ 4 พ.ย. 2569 — ทุกบัญชีเลือกได้ทุกกลุ่มอยู่แล้ว ดูจาก `accounts[].group_ids`
   * (เดิมใส่ทุกบัญชีทุกกลุ่ม: 2,437 กลุ่ม × 34 บัญชี ≈ 2 MB ต่อการเรียกหนึ่งครั้ง)
   */
  account_ids: string[];
  /** บัญชีที่ตั้งกลุ่มนี้ไว้ในหน้าตั้งค่า */
  home_account_ids: string[];
  last_posted_at: string | null;
  /** ผลย้อนหลัง 30 วัน — comments/phone_leads ขึ้นกับตัวเก็บคอมเมนต์ (ยังอ่านคอมเมนต์รายคนไม่ได้ ตัวเลขอาจต่ำกว่าจริง) */
  stats_30d: { attempts: number; posted: number; comments: number; phone_leads: number };
  /** ธุรกิจของกลุ่ม LBD/LBA/LM — null = ยังไม่ได้เลือก */
  department: string | null;
  /** ประเภทกลุ่ม: 'private' เอกชน (ชุดเดิม) · 'government' ราชการ (นำเข้าจากชีตทีม Online 4 พ.ย. 2569, 2,000+ กลุ่ม) — Jarvis ควรให้เลือกประเภทก่อนแล้วค่อยเลือกกลุ่ม */
  sector: 'private' | 'government';
  /** จังหวัดที่กลุ่มล็อกไว้ (ถอดจากชื่อกลุ่ม/คนตั้งในหน้าตั้งค่า) — [] = ยังไม่ระบุ · หลายจังหวัดได้ */
  provinces: string[];
  /** กลุ่มทั่วประเทศ/ทุกจังหวัด — ควรขึ้นต่อท้ายกลุ่มของจังหวัดที่เลือก */
  nationwide: boolean;
  /**
   * ใบขอที่ส่งมากับ ?request_no= เพิ่งลงกลุ่มนี้ไม่ถึง 2 วัน — เลือกได้แต่รอบนี้จะถูกข้าม ควรขึ้นสีเทาพร้อม available_at
   * null = ไม่ได้ส่ง request_no มา หรือใบนี้ยังไม่เคยลงกลุ่มนี้ / ลงเกิน 2 วันแล้ว
   */
  repost_wait: { request_no: string; last_posted_at: string; available_at: string } | null;
  /**
   * ติดที่ตัวกลุ่ม ทุกบัญชีโพสต์ไม่ได้ — ตอนนี้มีแค่ "แอดมินพักกลุ่ม"
   * ดูจากครั้งล่าสุดที่บัญชีใดก็ได้เปิดกลุ่มนี้ · แอดมินเปิดคืนแล้วจะรู้เมื่อมีบัญชีลองโพสต์ครั้งถัดไป
   */
  blocked: { state: 'admin_paused'; label: string; detail: string | null; seen_at: string } | null;
};

export type JarvisWorkerOption = {
  name: string;
  kinds: string[];
  online: boolean;
  last_seen: string | null;
  build: string | null;
  post_queue: { running: number; queued: number };
  scrape_queue: { running: number; queued: number };
  /** รวมงานที่ยังไม่จบ ใช้เทียบว่าเครื่องไหนคิวแน่น */
  load: number;
  /** บัญชี Facebook ที่ล็อกอินอยู่บนเครื่องนี้ */
  fb_account_ids: string[];
  /** ควรเป็นค่าเริ่มต้น: ออนไลน์และคิวเบาสุดในบรรดาเครื่องที่รับงานชนิดนั้น (แยก post / scrape) */
  recommended: { post: boolean; scrape: boolean };
};

export type JarvisScrapeAccountOption = {
  id: string;
  platform: string;
  label: string;
  enabled: boolean;
  cooldown_until: string | null;
  /** โควต้าเปิดดูโปรไฟล์ต่อวันของเว็บนั้น (นับรวมทุกบัญชีของเว็บเดียวกัน) */
  platform_cap: number | null;
  platform_used_today: number;
  queue: { running: number; queued: number };
  status: 'ready' | 'full' | 'cooldown' | 'disabled';
  warning: string | null;
};

export type JarvisOptions = {
  generated_at: string;
  /** ใบขอที่ขอมา (?request_no=) — ใช้คิด groups[].repost_wait · null = ไม่ได้ส่ง */
  request_no: string | null;
  accounts: JarvisAccountOption[];
  groups: JarvisGroupOption[];
  workers: JarvisWorkerOption[];
  scrape_accounts: JarvisScrapeAccountOption[];
};

/** เพดานโพสต์/วัน: daily_cap > POST_DAILY_CAP > 15 แล้ววอร์มตามอายุบัญชี (เหมือน worker) */
export function effectiveDailyCap(dailyCap: number | null, ageDays: number | null, env = process.env, skipWarmup = false): number {
  const base = Math.max(1, Number(dailyCap) || Number(env.POST_DAILY_CAP) || 15);
  if (skipWarmup || String(env.POST_WARMUP_DISABLED || '') === '1') return base;
  const age = ageDays == null ? NaN : Number(ageDays);
  const ramp = !Number.isFinite(age) || age < 7 ? 5 : age < 14 ? 8 : age < 21 ? 12 : base;
  return Math.min(base, ramp);
}

function thaiDateTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function accountStatus(a: {
  worker: string | null;
  worker_online: boolean;
  posted_today: number;
  daily_cap: number;
  paused_until: string | null;
  pause_reason: string | null;
  needs_verification_since?: string | null;
  needs_verification_note?: string | null;
  queue: { running: number; queued: number };
}): { status: AccountStatus; warning: string | null } {
  if (a.paused_until && new Date(a.paused_until).getTime() > Date.now()) {
    return {
      status: 'paused',
      warning: `บัญชีถูกพักถึง ${thaiDateTime(a.paused_until)}${a.pause_reason ? ` (${a.pause_reason})` : ''}`,
    };
  }
  if (a.needs_verification_since) {
    return {
      status: 'needs_verification',
      warning: `Facebook ขอยืนยันตัวตนบัญชีนี้ตั้งแต่ ${thaiDateTime(a.needs_verification_since)} ต้องมีคนไปทำที่เครื่องก่อน${a.needs_verification_note ? ` (${a.needs_verification_note})` : ''}`,
    };
  }
  if (a.posted_today >= a.daily_cap) {
    return { status: 'full', warning: `บัญชีนี้โพสต์ครบโควต้าวันนี้แล้ว (${a.posted_today}/${a.daily_cap})` };
  }
  // บัญชีที่ยังไม่มีเครื่องประจำเลือกได้ — Jarvis เลือกเครื่องในขั้นถัดไป (worker)
  if (a.worker && !a.worker_online) return { status: 'worker_offline', warning: `เครื่อง ${a.worker} ออฟไลน์อยู่` };
  if (a.queue.running + a.queue.queued > 0) {
    return { status: 'busy', warning: 'บัญชีนี้มีงานโพสต์ค้างอยู่ งานใหม่จะต่อคิวหลังงานนั้น' };
  }
  if (!a.worker) return { status: 'ready', warning: 'บัญชีนี้ยังไม่มีเครื่องประจำ เลือกเครื่องที่จะใช้โพสต์' };
  return { status: 'ready', warning: null };
}

/** ตัด pid ท้าย worker_id ของ Auto-Post (SONB-RM009-16112 → SONB-RM009) */
function machine(workerId: string | null): string | null {
  return workerId ? workerId.replace(/-\d{3,}$/, '') : null;
}

export async function getJarvisOptions(opts: { requestNo?: string | null } = {}): Promise<JarvisOptions> {
  const requestNo = String(opts.requestNo ?? '').trim() || null;
  const [accountRows, groupRows, postQueueRows, autopostWorkers, scraperWorkers, scrapeQueueRows, connectorRows, outcomeRows, recentRows] = await Promise.all([
    q<{
      id: string; env_key: string | null; email: string | null; skip_warmup: boolean; name: string; worker: string | null; worker_online: boolean; daily_cap: number | null;
      paused_until: string | null; pause_reason: string | null; group_ids: string[];
      needs_verification_since: string | null; needs_verification_note: string | null;
      posted_today: number; age_days: number | null; running: number; queued: number; department: string | null;
    }>(
      `SELECT u.id, u.env_key, u.email, COALESCE((to_jsonb(u)->>'skip_warmup')::boolean, false) AS skip_warmup,
              NULLIF(to_jsonb(u)->>'department', '') AS department,
              NULLIF(to_jsonb(u)->>'needs_verification_since', '') AS needs_verification_since,
              NULLIF(to_jsonb(u)->>'needs_verification_note', '') AS needs_verification_note,
              COALESCE(NULLIF(TRIM(u.name), ''), u.env_key, u.id) AS name,
              u.preferred_worker AS worker,
              EXISTS (SELECT 1 FROM ${AP}.workers w WHERE w.name = u.preferred_worker AND w.last_seen > now() - ${ONLINE}) AS worker_online,
              u.daily_cap, u.paused_until, u.pause_reason,
              COALESCE(u.group_ids::jsonb, '[]'::jsonb) AS group_ids,
              -- โพสต์สำเร็จวันนี้: post_logs กับ run_logs success อันไหนมากกว่า (บางช่วง post_logs บันทึกไม่ครบ)
              GREATEST(
                (SELECT count(*) FROM ${AP}.post_logs pl WHERE pl.user_id = u.id AND pl.created_at >= ${BANGKOK_DAY_START}),
                (SELECT count(*) FROM ${AP}.run_logs rl WHERE rl.user_id = u.id AND rl.level = 'success'
                    AND rl.group_id IS NOT NULL AND rl.created_at >= ${BANGKOK_DAY_START})
              )::int AS posted_today,
              (SELECT EXTRACT(EPOCH FROM (now() - MIN(first_at))) / 86400.0 FROM (
                 SELECT MIN(created_at) AS first_at FROM ${AP}.post_logs WHERE user_id = u.id
                 UNION ALL
                 SELECT MIN(created_at) FROM ${AP}.run_logs WHERE user_id = u.id AND level = 'success'
               ) t) AS age_days,
              (SELECT count(*) FROM ${AP}.post_run_queue p WHERE p.user_id = u.id AND p.status = 'running')::int AS running,
              (SELECT count(*) FROM ${AP}.post_run_queue p WHERE p.user_id = u.id AND p.status = 'queued')::int AS queued
         FROM ${AP}.users u
        ORDER BY 2`,
    ),
    q<{
      id: string; fb_group_id: string; name: string | null; account_ids: string[]; last_posted_at: string | null;
      attempts: number; posted: number; comments: number; phone_leads: number; department: string | null; sector: string | null; province: string | null;
    }>(
      // สถิติรายกลุ่มรวมครั้งเดียวต่อตาราง (กลุ่ม 2,000+ หลังนำเข้าชีตราชการ — subquery ต่อแถวช้าเกิน)
      `WITH rl AS (
         SELECT group_id,
                max(created_at) FILTER (WHERE level = 'success') AS last_posted_at,
                count(*) FILTER (WHERE level IN ('success', 'warn', 'error') AND created_at > now() - interval '30 days')::int AS attempts,
                count(*) FILTER (WHERE level = 'success' AND created_at > now() - interval '30 days')::int AS posted
           FROM ${AP}.run_logs WHERE group_id IS NOT NULL GROUP BY group_id),
       pl AS (
         SELECT group_id, COALESCE(sum(comment_count), 0)::int AS comments
           FROM ${AP}.post_logs WHERE group_id IS NOT NULL AND created_at > now() - interval '30 days' GROUP BY group_id),
       cl AS (
         SELECT group_id, count(*)::int AS phone_leads
           FROM ${AP}.comment_leads WHERE phone IS NOT NULL AND first_seen_at > now() - interval '30 days' GROUP BY group_id),
       ua AS (
         SELECT gid, jsonb_agg(uid) AS account_ids FROM (
           SELECT u.id AS uid, jsonb_array_elements_text(COALESCE(u.group_ids::jsonb, '[]'::jsonb)) AS gid FROM ${AP}.users u) x GROUP BY gid)
       SELECT g.id, g.fb_group_id, g.name, g.province, NULLIF(TRIM(g.department), '') AS department,
              NULLIF(to_jsonb(g)->>'sector', '') AS sector,
              COALESCE(ua.account_ids, '[]'::jsonb) AS account_ids,
              rl.last_posted_at, COALESCE(rl.attempts, 0) AS attempts, COALESCE(rl.posted, 0) AS posted,
              COALESCE(pl.comments, 0) AS comments, COALESCE(cl.phone_leads, 0) AS phone_leads
         FROM ${AP}.groups g
         LEFT JOIN rl ON rl.group_id = g.fb_group_id
         LEFT JOIN pl ON pl.group_id = g.fb_group_id
         LEFT JOIN cl ON cl.group_id = g.fb_group_id
         LEFT JOIN ua ON ua.gid = g.id
        ORDER BY g.name`,
    ).catch(async () =>
      // comment_leads ยังไม่ถูกสร้าง (ตัวเก็บคอมเมนต์ยังไม่เคยรัน) — ไม่นับเบอร์
      q<{ id: string; fb_group_id: string; name: string | null; account_ids: string[]; last_posted_at: string | null; attempts: number; posted: number; comments: number; phone_leads: number; department: string | null; sector: string | null; province: string | null }>(
        `SELECT g.id, g.fb_group_id, g.name, g.province, NULLIF(TRIM(g.department), '') AS department, NULLIF(to_jsonb(g)->>'sector', '') AS sector,
                COALESCE((SELECT jsonb_agg(u.id) FROM ${AP}.users u WHERE COALESCE(u.group_ids::jsonb, '[]'::jsonb) ? g.id), '[]'::jsonb) AS account_ids,
                NULL::timestamptz AS last_posted_at, 0 AS attempts, 0 AS posted, 0 AS comments, 0 AS phone_leads
           FROM ${AP}.groups g ORDER BY g.name`,
      ),
    ),
    // งานโพสต์ที่รอคิวยังไม่มี worker_id — นับให้เครื่องที่บัญชีผูกไว้ (เครื่องนั้นจะเป็นคนรับ)
    q<{ worker: string | null; status: string; n: number }>(
      `SELECT COALESCE(p.worker_id, u.preferred_worker) AS worker, p.status, count(*)::int AS n
         FROM ${AP}.post_run_queue p LEFT JOIN ${AP}.users u ON u.id = p.user_id
        WHERE p.status IN ('queued', 'running')
        GROUP BY 1, 2`,
    ),
    q<{ name: string; last_seen: string; online: boolean; build: string | null; fb_sessions: string[] | null }>(
      `SELECT name, last_seen, last_seen > now() - ${ONLINE} AS online, meta->>'build_sha' AS build,
              meta->'fb_sessions' AS fb_sessions
         FROM ${AP}.workers`,
    ).catch(() => []),
    // ตัว Scrap รันเป็น slot (scraper-1, scraper-2) — ชื่อเครื่องอยู่ใน meta.machine_name
    q<{ name: string; machine: string | null; last_seen: string; online: boolean; build: string | null }>(
      `SELECT name, NULLIF(meta->>'machine_name', '') AS machine, last_seen, last_seen > now() - ${ONLINE} AS online,
              meta->>'build_sha' AS build
         FROM workers`,
    ).catch(() => []),
    q<{ worker: string | null; connector_key: string | null; status: string; n: number }>(
      `SELECT COALESCE(worker_id, preferred_worker) AS worker, connector_key, status, count(*)::int AS n
         FROM work_queue
        WHERE type = 'scrape' AND status IN ('queued', 'running')
        GROUP BY 1, 2, 3`,
    ).catch(() => []),
    q<{
      id: string; platform: string; label: string; enabled: boolean; cooldown_until: string | null;
      platform_cap: number | null; platform_used_today: number;
    }>(
      `SELECT c.id, c.platform, COALESCE(NULLIF(TRIM(c.label), ''), c.platform) AS label, c.enabled, c.cooldown_until,
              pl.daily_cap AS platform_cap,
              COALESCE((SELECT SUM(r.opened_count)::int FROM scrape_runs r
                         WHERE r.platform = c.platform AND r.started_at >= ${BANGKOK_DAY_START}), 0) AS platform_used_today
         FROM connectors c LEFT JOIN provider_limits pl ON pl.platform = c.platform
        WHERE c.platform IN ('jobthai', 'jobbkk')
        ORDER BY c.platform, 3`,
    ).catch(() => []),
    // สถานะบัญชี × กลุ่ม อ่านไม่ได้ = ไม่ส่งสถานะ (ทุกกลุ่มเป็น "ยังไม่เคยลอง") ไม่ทำให้ป๊อปทั้งป๊อปล่ม
    loadLatestGroupOutcomes().catch(() => []),
    // ใบขอนี้เพิ่งลงกลุ่มไหนไม่ถึง 2 วัน (worker ข้ามคู่ งาน+กลุ่ม ที่เพิ่งลง) — คิดจาก run_logs success ของ job jv-<ใบขอ>
    requestNo
      ? q<{ group_id: string; last_posted_at: string }>(
        `SELECT group_id, max(created_at) AS last_posted_at FROM ${AP}.run_logs
          WHERE job_id = $1 AND level = 'success' AND group_id IS NOT NULL
            AND created_at > now() - make_interval(days => $2)
          GROUP BY group_id`,
        [`jv-${requestNo.toLowerCase()}`, REPOST_MIN_GAP_DAYS],
      ).catch(() => [])
      : Promise.resolve([] as { group_id: string; last_posted_at: string }[]),
  ]);
  const recentByFb = new Map(recentRows.map((r) => [String(r.group_id), r.last_posted_at]));

  // ชื่อไฟล์ session = facebook-<key>.json โดย key คิดแบบเดียวกับ facebookLogin (env_key → id → email)
  const sessionKey = (r: { env_key: string | null; id: string; email: string | null }) =>
    String(r.env_key || r.id || r.email || 'default').replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
  const sessionWorkers = new Map<string, string[]>();
  for (const w of autopostWorkers) {
    const machineName = machine(w.name) ?? w.name;
    for (const key of Array.isArray(w.fb_sessions) ? w.fb_sessions : []) {
      const list = sessionWorkers.get(String(key).toLowerCase()) ?? [];
      if (!list.includes(machineName)) list.push(machineName);
      sessionWorkers.set(String(key).toLowerCase(), list);
    }
  }

  const allGroupIds = groupRows.map((g) => String(g.id));

  // run_logs เก็บเลขกลุ่มบน Facebook — แปลงเป็น id กลุ่มในระบบที่ Jarvis ใช้
  const groupIdByFb = new Map(groupRows.map((g) => [String(g.fb_group_id), String(g.id)]));
  const statusByAccount = new Map<string, JarvisGroupStatus[]>();
  const pausedByGroup = new Map<string, NonNullable<JarvisGroupOption['blocked']>>();
  for (const r of outcomeRows) {
    const groupId = groupIdByFb.get(String(r.group_id));
    if (!groupId) continue; // กลุ่มถูกลบออกจากคลังแล้ว
    const { state, detail, url } = classifyGroupOutcome(r);
    const list = statusByAccount.get(r.user_id) ?? [];
    list.push({ group_id: groupId, state, label: GROUP_STATE[state].label, recommended: GROUP_STATE[state].recommended, detail, url, seen_at: r.seen_at });
    statusByAccount.set(r.user_id, list);
  }
  // กลุ่มติดที่ตัวกลุ่ม: ผลล่าสุดของกลุ่มนั้น (ข้ามทุกบัญชี) คือแอดมินพักกลุ่ม
  const latestByGroup = new Map<string, JarvisGroupStatus>();
  for (const list of statusByAccount.values()) {
    for (const st of list) {
      const prev = latestByGroup.get(st.group_id);
      if (!prev || new Date(st.seen_at) > new Date(prev.seen_at)) latestByGroup.set(st.group_id, st);
    }
  }
  for (const [groupId, st] of latestByGroup) {
    if (st.state === 'admin_paused') {
      pausedByGroup.set(groupId, { state: 'admin_paused', label: st.label, detail: st.detail, seen_at: st.seen_at });
    }
  }
  const accounts: JarvisAccountOption[] = accountRows.map((r) => {
    const daily_cap = effectiveDailyCap(r.daily_cap, r.age_days, process.env, r.skip_warmup);
    const base = {
      worker: r.worker,
      worker_online: r.worker_online,
      posted_today: Number(r.posted_today) || 0,
      daily_cap,
      paused_until: r.paused_until,
      pause_reason: r.pause_reason,
      needs_verification_since: r.needs_verification_since,
      needs_verification_note: r.needs_verification_note,
      queue: { running: r.running, queued: r.queued },
    };
    const status = accountStatus(base);
    const session_workers = sessionWorkers.get(sessionKey(r)) ?? [];
    const onlineNames = new Set(autopostWorkers.filter((w) => w.online).map((w) => machine(w.name) ?? w.name));
    return {
      id: r.id,
      name: r.name,
      ...base,
      remaining_today: Math.max(0, daily_cap - base.posted_today),
      ...status,
      // ใช้ได้ = พร้อมโพสต์ (เจ้าของ 4 พ.ย. 2569: บัญชีที่ยังไม่เคยล็อกอินก็ใช้ได้ แค่ยังไม่เคยถูกใช้ ให้ขึ้นบน ๆ เหมือนกัน)
      // บัญชีที่มี session บนเครื่องออนไลน์มาก่อน (sort_rank 0) บัญชีใหม่ตามมา (1) ตัวที่ใช้ไม่ได้อยู่ล่างสุด
      recommended: status.status === 'ready' && !status.warning,
      sort_rank: status.status === 'ready' ? (session_workers.some((w) => onlineNames.has(w)) ? 0 : 1) : status.status === 'busy' || status.status === 'full' || status.status === 'worker_offline' ? 2 : 3,
      group_ids: allGroupIds,
      home_group_ids: (r.group_ids ?? []).map(String),
      session_workers,
      department: r.department,
      group_status: statusByAccount.get(String(r.id)) ?? [],
    };
  });

  const groups: JarvisGroupOption[] = groupRows.map((g) => ({
    id: g.id,
    fb_group_id: String(g.fb_group_id),
    name: g.name && !PLACEHOLDER_NAME.test(g.name.trim()) ? g.name.trim() : null,
    url: `https://www.facebook.com/groups/${g.fb_group_id}`,
    account_ids: [],
    home_account_ids: (g.account_ids ?? []).map(String),
    last_posted_at: g.last_posted_at,
    stats_30d: {
      attempts: Number(g.attempts) || 0,
      posted: Number(g.posted) || 0,
      comments: Number(g.comments) || 0,
      phone_leads: Number(g.phone_leads) || 0,
    },
    department: g.department,
    sector: g.sector === 'government' ? 'government' : 'private',
    provinces: String(g.province ?? '').split(/[,،]/).map((v) => v.trim()).filter((v) => v && v !== 'ทั่วประเทศ'),
    nationwide: /ทั่วประเทศ/.test(String(g.province ?? '')),
    blocked: pausedByGroup.get(String(g.id)) ?? null,
    repost_wait: (() => {
      const last = requestNo ? recentByFb.get(String(g.fb_group_id)) : null;
      if (!last || !requestNo) return null;
      const availableAt = new Date(new Date(last).getTime() + REPOST_MIN_GAP_DAYS * 86_400_000);
      if (availableAt.getTime() <= Date.now()) return null;
      return { request_no: requestNo, last_posted_at: new Date(last).toISOString(), available_at: availableAt.toISOString() };
    })(),
  }));

  const workerMap = new Map<string, JarvisWorkerOption>();
  const touch = (name: string): JarvisWorkerOption => {
    let w = workerMap.get(name);
    if (!w) {
      w = { name, kinds: [], online: false, last_seen: null, build: null, post_queue: { running: 0, queued: 0 }, scrape_queue: { running: 0, queued: 0 }, load: 0, fb_account_ids: [], recommended: { post: false, scrape: false } };
      workerMap.set(name, w);
    }
    return w;
  };
  // slot ของ Scrap (scraper-1 / scraper-1#9328) → ชื่อเครื่อง
  const slotMachine = new Map(scraperWorkers.map((r) => [r.name, r.machine || r.name]));
  const scrapeMachine = (workerId: string) => slotMachine.get(workerId.replace(/#\d+$/, '')) ?? workerId.replace(/#\d+$/, '');
  for (const [kind, rows] of [
    ['autopost', autopostWorkers.map((r) => ({ ...r, key: machine(r.name) ?? r.name }))],
    ['scraper', scraperWorkers.map((r) => ({ ...r, key: r.machine || r.name }))],
  ] as const) {
    for (const r of rows) {
      const w = touch(r.key);
      if (!w.kinds.includes(kind)) w.kinds.push(kind);
      w.online = w.online || r.online;
      if (!w.last_seen || new Date(r.last_seen) > new Date(w.last_seen)) {
        w.last_seen = r.last_seen;
        w.build = r.build;
      }
    }
  }
  for (const r of postQueueRows) {
    if (!r.worker) continue;
    const w = touch(machine(r.worker)!);
    if (r.status === 'running') w.post_queue.running += r.n;
    else w.post_queue.queued += r.n;
  }
  const connectorQueue = new Map<string, { running: number; queued: number }>();
  for (const r of scrapeQueueRows) {
    if (r.worker) {
      const w = touch(scrapeMachine(r.worker));
      if (r.status === 'running') w.scrape_queue.running += r.n;
      else w.scrape_queue.queued += r.n;
    }
    if (r.connector_key) {
      const id = r.connector_key.slice(r.connector_key.indexOf(':') + 1);
      const c = connectorQueue.get(id) ?? { running: 0, queued: 0 };
      if (r.status === 'running') c.running += r.n;
      else c.queued += r.n;
      connectorQueue.set(id, c);
    }
  }
  for (const a of accounts) {
    for (const wName of a.session_workers) {
      const w = touch(wName);
      if (!w.fb_account_ids.includes(a.id)) w.fb_account_ids.push(a.id);
    }
  }
  const workers = [...workerMap.values()]
    .map((w) => ({ ...w, load: w.post_queue.running + w.post_queue.queued + w.scrape_queue.running + w.scrape_queue.queued }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.load - b.load || a.name.localeCompare(b.name));
  // เครื่องที่ควรเป็นค่าเริ่มต้น = ออนไลน์และคิวเบาสุดของงานชนิดนั้น (เรียงไว้แล้ว ตัวแรกที่เข้าเงื่อนไขคือตัวแนะนำ)
  const firstPost = workers.find((w) => w.online && w.kinds.includes('autopost'));
  const firstScrape = workers.find((w) => w.online && w.kinds.includes('scraper'));
  for (const w of workers) w.recommended = { post: w === firstPost, scrape: w === firstScrape };

  const scrape_accounts: JarvisScrapeAccountOption[] = connectorRows.map((c) => {
    const queue = connectorQueue.get(String(c.id)) ?? { running: 0, queued: 0 };
    const used = Number(c.platform_used_today) || 0;
    const cap = c.platform_cap == null ? null : Number(c.platform_cap);
    let status: JarvisScrapeAccountOption['status'] = 'ready';
    let warning: string | null = null;
    if (!c.enabled) {
      status = 'disabled';
      warning = 'บัญชีนี้ปิดใช้งานอยู่';
    } else if (c.cooldown_until && new Date(c.cooldown_until).getTime() > Date.now()) {
      status = 'cooldown';
      warning = `บัญชีพักถึง ${thaiDateTime(c.cooldown_until)}`;
    } else if (cap != null && used >= cap) {
      status = 'full';
      warning = `${c.platform} เปิดดูโปรไฟล์ครบโควต้าวันนี้แล้ว (${used}/${cap})`;
    }
    return {
      id: String(c.id), platform: c.platform, label: c.label, enabled: c.enabled, cooldown_until: c.cooldown_until,
      platform_cap: cap, platform_used_today: used, queue, status, warning,
    };
  });

  return { generated_at: new Date().toISOString(), request_no: requestNo, accounts, groups, workers, scrape_accounts };
}
