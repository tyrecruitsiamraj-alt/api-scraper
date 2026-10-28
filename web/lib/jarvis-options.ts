import 'server-only';
import { q } from './db';

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

export type AccountStatus = 'ready' | 'full' | 'paused' | 'busy' | 'worker_offline' | 'no_worker';

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
  /** งานโพสต์ของบัญชีนี้ที่ยังไม่จบ (1 บัญชีโพสต์ได้ทีละงาน) */
  queue: { running: number; queued: number };
  status: AccountStatus;
  /** ข้อความภาษาไทยสำหรับแจ้งพนักงาน (เช่น popup) — null เมื่อพร้อม */
  warning: string | null;
  /** กลุ่มที่บัญชีนี้เลือกโพสต์ได้ = ทุกกลุ่มในระบบ (กลุ่มไม่ได้ผูกกับบัญชี) */
  group_ids: string[];
  /** กลุ่มที่ตั้งไว้กับบัญชีนี้ในหน้าตั้งค่า (ใช้กับโพสต์อัตโนมัติรายวัน) */
  home_group_ids: string[];
  /** เครื่องที่มี session ล็อกอินบัญชีนี้อยู่ (โพสต์จากเครื่องอื่นได้ แต่ต้องล็อกอินใหม่บนเครื่องนั้น) */
  session_workers: string[];
};

export type JarvisGroupOption = {
  id: string;
  fb_group_id: string;
  /** ชื่อกลุ่มบน Facebook — null ถ้าบอทยังไม่เคยเข้าไปอ่าน */
  name: string | null;
  url: string;
  /** บัญชีที่เลือกกลุ่มนี้ได้ = ทุกบัญชี */
  account_ids: string[];
  /** บัญชีที่ตั้งกลุ่มนี้ไว้ในหน้าตั้งค่า */
  home_account_ids: string[];
  last_posted_at: string | null;
  /** ผลย้อนหลัง 30 วัน — comments/phone_leads ขึ้นกับตัวเก็บคอมเมนต์ (ยังอ่านคอมเมนต์รายคนไม่ได้ ตัวเลขอาจต่ำกว่าจริง) */
  stats_30d: { attempts: number; posted: number; comments: number; phone_leads: number };
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
  queue: { running: number; queued: number };
}): { status: AccountStatus; warning: string | null } {
  if (a.paused_until && new Date(a.paused_until).getTime() > Date.now()) {
    return {
      status: 'paused',
      warning: `บัญชีถูกพักถึง ${thaiDateTime(a.paused_until)}${a.pause_reason ? ` (${a.pause_reason})` : ''}`,
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

export async function getJarvisOptions(): Promise<JarvisOptions> {
  const [accountRows, groupRows, postQueueRows, autopostWorkers, scraperWorkers, scrapeQueueRows, connectorRows] = await Promise.all([
    q<{
      id: string; env_key: string | null; email: string | null; skip_warmup: boolean; name: string; worker: string | null; worker_online: boolean; daily_cap: number | null;
      paused_until: string | null; pause_reason: string | null; group_ids: string[];
      posted_today: number; age_days: number | null; running: number; queued: number;
    }>(
      `SELECT u.id, u.env_key, u.email, COALESCE((to_jsonb(u)->>'skip_warmup')::boolean, false) AS skip_warmup,
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
      attempts: number; posted: number; comments: number; phone_leads: number;
    }>(
      `SELECT g.id, g.fb_group_id, g.name,
              COALESCE((SELECT jsonb_agg(u.id) FROM ${AP}.users u WHERE COALESCE(u.group_ids::jsonb, '[]'::jsonb) ? g.id), '[]'::jsonb) AS account_ids,
              (SELECT max(rl.created_at) FROM ${AP}.run_logs rl WHERE rl.group_id = g.fb_group_id AND rl.level = 'success') AS last_posted_at,
              (SELECT count(*) FROM ${AP}.run_logs rl WHERE rl.group_id = g.fb_group_id AND rl.level IN ('success', 'warn', 'error')
                  AND rl.created_at > now() - interval '30 days')::int AS attempts,
              (SELECT count(*) FROM ${AP}.run_logs rl WHERE rl.group_id = g.fb_group_id AND rl.level = 'success'
                  AND rl.created_at > now() - interval '30 days')::int AS posted,
              COALESCE((SELECT sum(pl.comment_count) FROM ${AP}.post_logs pl WHERE pl.group_id = g.fb_group_id
                  AND pl.created_at > now() - interval '30 days'), 0)::int AS comments,
              COALESCE((SELECT count(*) FROM ${AP}.comment_leads cl WHERE cl.group_id = g.fb_group_id AND cl.phone IS NOT NULL
                  AND cl.first_seen_at > now() - interval '30 days'), 0)::int AS phone_leads
         FROM ${AP}.groups g
        ORDER BY g.name`,
    ).catch(async () =>
      // comment_leads ยังไม่ถูกสร้าง (ตัวเก็บคอมเมนต์ยังไม่เคยรัน) — ไม่นับเบอร์
      q<{ id: string; fb_group_id: string; name: string | null; account_ids: string[]; last_posted_at: string | null; attempts: number; posted: number; comments: number; phone_leads: number }>(
        `SELECT g.id, g.fb_group_id, g.name,
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
  ]);

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
  const allAccountIds = accountRows.map((r) => String(r.id));
  const accounts: JarvisAccountOption[] = accountRows.map((r) => {
    const daily_cap = effectiveDailyCap(r.daily_cap, r.age_days, process.env, r.skip_warmup);
    const base = {
      worker: r.worker,
      worker_online: r.worker_online,
      posted_today: Number(r.posted_today) || 0,
      daily_cap,
      paused_until: r.paused_until,
      pause_reason: r.pause_reason,
      queue: { running: r.running, queued: r.queued },
    };
    return {
      id: r.id,
      name: r.name,
      ...base,
      remaining_today: Math.max(0, daily_cap - base.posted_today),
      ...accountStatus(base),
      group_ids: allGroupIds,
      home_group_ids: (r.group_ids ?? []).map(String),
      session_workers: sessionWorkers.get(sessionKey(r)) ?? [],
    };
  });

  const groups: JarvisGroupOption[] = groupRows.map((g) => ({
    id: g.id,
    fb_group_id: String(g.fb_group_id),
    name: g.name && !PLACEHOLDER_NAME.test(g.name.trim()) ? g.name.trim() : null,
    url: `https://www.facebook.com/groups/${g.fb_group_id}`,
    account_ids: allAccountIds,
    home_account_ids: (g.account_ids ?? []).map(String),
    last_posted_at: g.last_posted_at,
    stats_30d: {
      attempts: Number(g.attempts) || 0,
      posted: Number(g.posted) || 0,
      comments: Number(g.comments) || 0,
      phone_leads: Number(g.phone_leads) || 0,
    },
  }));

  const workerMap = new Map<string, JarvisWorkerOption>();
  const touch = (name: string): JarvisWorkerOption => {
    let w = workerMap.get(name);
    if (!w) {
      w = { name, kinds: [], online: false, last_seen: null, build: null, post_queue: { running: 0, queued: 0 }, scrape_queue: { running: 0, queued: 0 }, load: 0, fb_account_ids: [] };
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

  return { generated_at: new Date().toISOString(), accounts, groups, workers, scrape_accounts };
}
