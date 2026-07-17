import 'server-only';
import { randomUUID } from 'node:crypto';
import { q } from './db';

// schema ของ autopost — แยกต่อ project ได้ผ่าน env (ไม่ตั้ง = so_autopost_jobs เดิม)
// ใช้กับทุก query ข้าม schema ไปฝั่ง autopost. ค่าจาก env เราคุมเอง (ไม่ใช่ input ผู้ใช้)
const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_jobs';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) {
  throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
}
const AP = `"${AP_SCHEMA}"`;

export type CandidateRow = {
  id: string;
  full_name: string | null;
  prefix: string | null;
  phone: string | null;
  email: string | null;
  province: string | null;
  expected_salary: string | null;
  desired_positions: string | null;
  last_updated_at: string;
  platforms: string[];
  asset_count: number;
};

export async function listCandidates(opts: { search?: string; platform?: string; limit?: number; offset?: number } = {}) {
  const { search, platform, limit = 40, offset = 0 } = opts;
  const params: unknown[] = [];
  const where: string[] = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.desired_positions ILIKE $${params.length})`);
  }
  if (platform) {
    params.push(platform);
    where.push(`EXISTS (SELECT 1 FROM candidate_sources s WHERE s.candidate_id = c.id AND s.platform = $${params.length})`);
  }
  params.push(limit);
  params.push(offset);
  const rows = await q<CandidateRow>(
    `SELECT c.id, c.full_name, c.prefix, c.phone, c.email, c.province, c.expected_salary,
            c.desired_positions, c.last_updated_at,
            ARRAY(SELECT DISTINCT s.platform FROM candidate_sources s WHERE s.candidate_id = c.id) AS platforms,
            (SELECT count(*)::int FROM candidate_assets a WHERE a.candidate_id = c.id) AS asset_count
       FROM candidates c
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.last_updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function countCandidates(opts: { search?: string; platform?: string } = {}) {
  const { search, platform } = opts;
  const params: unknown[] = [];
  const where: string[] = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.desired_positions ILIKE $${params.length})`);
  }
  if (platform) {
    params.push(platform);
    where.push(`EXISTS (SELECT 1 FROM candidate_sources s WHERE s.candidate_id = c.id AND s.platform = $${params.length})`);
  }
  const rows = await q<{ n: number }>(
    `SELECT count(*)::int n FROM candidates c ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
    params,
  );
  return rows[0]?.n ?? 0;
}

export async function getCandidate(id: string) {
  const rows = await q<any>('SELECT * FROM candidates WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const sources = await q<any>(
    `SELECT platform, external_id, source_url, connector_id, parse_status, first_seen_at, last_seen_at
       FROM candidate_sources WHERE candidate_id = $1 ORDER BY last_seen_at DESC`,
    [id],
  );
  const assets = await q<any>(
    `SELECT id, kind, title, file_type, mime, byte_size, download_status,
            extract_status, extracted_text
       FROM candidate_assets WHERE candidate_id = $1 ORDER BY kind, title`,
    [id],
  );
  return { ...rows[0], sources, assets };
}

export async function getAssetBytes(id: string) {
  const rows = await q<{ title: string; file_type: string; mime: string; content: Buffer }>(
    'SELECT title, file_type, mime, content FROM candidate_assets WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export type ConnectorRow = {
  id: string;
  platform: string;
  label: string;
  username: string;
  scrape_limit: number;
  daily_cap: number;
  enabled: boolean;
  last_login_at: string | null;
  cooldown_until: string | null;
  created_at: string;
};

export async function listConnectors() {
  return q<ConnectorRow>(
    `SELECT id, platform, label, username, scrape_limit, daily_cap, enabled,
            last_login_at, cooldown_until, created_at
       FROM connectors ORDER BY platform, label`,
  );
}

// Unified account row across ALL modules (scraper connectors + Facebook accounts).
// `key` is '<platform>:<id>'; strip the prefix to get the raw scraper connector id.
export type UnifiedConnectorRow = {
  key: string;
  platform: string;
  label: string;
  username: string | null;
  scrape_limit: number | null;
  daily_cap: number | null;
  enabled: boolean;
  cooldown_until: string | null;
  last_login_at: string | null;
  created_at: string;
  paused_until: string | null;
  pause_reason: string | null;
  used_today: number | null;
  preferred_worker: string | null;
};

export async function listAllConnectors() {
  // Query both schemas directly instead of v_connectors: the view belongs to an
  // older fixed autopost schema, while AUTOPOST_SCHEMA is now configurable.
  const scraper = await q<UnifiedConnectorRow>(
    `SELECT platform || ':' || id::text AS key, platform, label, username,
            scrape_limit, daily_cap, enabled, cooldown_until, last_login_at, created_at,
            NULL::timestamptz AS paused_until, NULL::text AS pause_reason,
            NULL::integer AS used_today, NULL::text AS preferred_worker
       FROM connectors`,
  );

  let facebook: UnifiedConnectorRow[] = [];
  try {
    facebook = await q<UnifiedConnectorRow>(
      `SELECT 'facebook:' || u.id::text AS key, 'facebook'::text AS platform,
              COALESCE(NULLIF(TRIM(u.name), ''), u.email, u.env_key, u.id) AS label,
              COALESCE(u.email, u.env_key) AS username,
              NULL::integer AS scrape_limit, COALESCE(u.daily_cap, 15)::integer AS daily_cap,
              true AS enabled, NULL::timestamptz AS cooldown_until,
              NULL::timestamptz AS last_login_at, u.created_at,
              u.paused_until, u.pause_reason,
              COALESCE((
                SELECT count(*)::int FROM ${AP}.post_logs pl
                 WHERE pl.user_id = u.id
                   AND (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date
                       = (now() AT TIME ZONE 'Asia/Bangkok')::date
              ), 0) AS used_today,
              NULLIF(to_jsonb(u)->>'preferred_worker', '') AS preferred_worker
         FROM ${AP}.users u`,
    );
  } catch {
    // Schema รุ่นแรกอาจยังไม่มี daily_cap/paused columns หรือ post_logs.
    // ยังแสดงบัญชีพื้นฐานได้ เพื่อให้ Settings ไม่ล่มทั้งหน้า.
    try {
      facebook = await q<UnifiedConnectorRow>(
        `SELECT 'facebook:' || u.id::text AS key, 'facebook'::text AS platform,
                COALESCE(NULLIF(TRIM(u.name), ''), u.email, u.env_key, u.id) AS label,
                COALESCE(u.email, u.env_key) AS username,
                NULL::integer AS scrape_limit, 15::integer AS daily_cap,
                true AS enabled, NULL::timestamptz AS cooldown_until,
                NULL::timestamptz AS last_login_at, u.created_at,
                NULL::timestamptz AS paused_until, NULL::text AS pause_reason,
                0::integer AS used_today,
                NULLIF(to_jsonb(u)->>'preferred_worker', '') AS preferred_worker
           FROM ${AP}.users u`,
      );
    } catch {
      facebook = [];
    }
  }

  return [...scraper, ...facebook].sort((a, b) =>
    `${a.platform}:${a.label}`.localeCompare(`${b.platform}:${b.label}`, 'th'),
  );
}

/** Lightweight options for task-creation dropdown (enabled only). */
export async function listConnectorOptions() {
  return q<{ id: string; platform: string; label: string; scrape_limit: number }>(
    `SELECT id, platform, label, scrape_limit FROM connectors WHERE enabled = true ORDER BY platform, label`,
  );
}

export async function insertConnector(c: {
  platform: string;
  label: string;
  username: string;
  passwordEnc: string;
  scrapeLimit: number;
  dailyCap: number;
}) {
  const rows = await q<{ id: string }>(
    `INSERT INTO connectors (platform, label, username, password_enc, scrape_limit, daily_cap)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [c.platform, c.label, c.username, c.passwordEnc, c.scrapeLimit, c.dailyCap],
  );
  return rows[0].id;
}

/** Add one Facebook posting account to the configured Auto-Post schema. */
export async function insertFacebookConnector(c: {
  label: string;
  username: string;
  password: string;
  posterName?: string;
  contactPhone?: string;
  dailyCap: number;
  preferredWorker?: string;
}) {
  // These control columns are runtime migrations in the legacy Auto-Post server.
  // Ensure the one needed by this native Settings form before inserting.
  await q(`ALTER TABLE ${AP}.users ADD COLUMN IF NOT EXISTS daily_cap INTEGER`);
  await q(`ALTER TABLE ${AP}.users ADD COLUMN IF NOT EXISTS preferred_worker VARCHAR(255)`);
  const id = `fb_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await q(
    `INSERT INTO ${AP}.users
       (id, env_key, name, poster_name, email, password, group_ids, blacklist_groups,
        post_settings, contact_phone, daily_cap, preferred_worker)
     VALUES ($1,$1,$2,$3,$4,$5,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,$6,$7,$8)`,
    [
      id,
      c.label,
      c.posterName || c.label,
      c.username,
      c.password,
      c.contactPhone || null,
      c.dailyCap,
      c.preferredWorker?.trim() || null,
    ],
  );
  return id;
}

export async function setConnectorEnabled(id: string, enabled: boolean) {
  await q('UPDATE connectors SET enabled = $2, updated_at = now() WHERE id = $1', [id, enabled]);
}

export async function deleteConnector(id: string) {
  await q('DELETE FROM connectors WHERE id = $1', [id]);
}

// ---------------------------------------------------------------------------
// Provider daily caps (provider_limits) — across all connectors of a platform
// ---------------------------------------------------------------------------
// Start of calendar day in Asia/Bangkok (for daily quota counters).
const BANGKOK_DAY_START = `((now() AT TIME ZONE 'Asia/Bangkok')::date::timestamp AT TIME ZONE 'Asia/Bangkok')`;

export type ProviderLimitRow = { platform: string; daily_cap: number; updated_at: string; used_today: number };

export async function listProviderLimits() {
  return q<ProviderLimitRow>(
    `SELECT pl.platform, pl.daily_cap, pl.updated_at,
            COALESCE((SELECT count(*)::int FROM candidate_sources s
                       WHERE s.platform = pl.platform
                         AND s.last_seen_at >= ${BANGKOK_DAY_START}), 0) AS used_today
       FROM provider_limits pl ORDER BY pl.platform`,
  );
}

export async function setProviderCap(platform: string, dailyCap: number) {
  await q(
    `INSERT INTO provider_limits (platform, daily_cap) VALUES ($1,$2)
     ON CONFLICT (platform) DO UPDATE SET daily_cap = EXCLUDED.daily_cap, updated_at = now()`,
    [platform, dailyCap],
  );
}

// Facebook posting quota is PER ACCOUNT (15/account/day), unlike the scraper platforms
// which have one platform-wide cap. For the platform-quota panel we aggregate ALL FB
// accounts into one card: posts today (all accounts) vs total capacity (Σ per-account cap).
// Guarded — returns null if the autopost schema/columns aren't present yet.
export type FacebookAccountQuota = {
  id: string;
  label: string;
  used_today: number;
  cap: number;
  paused: boolean;
};
export type FacebookQuotaSummary = {
  accounts: number;
  paused: number;
  posts_today: number;
  capacity: number;
  cap_default: number;
  /** รายบัญชี เรียงใช้เยอะสุดก่อน (ตัวเสี่ยงโดน block อยู่บนสุด) */
  list: FacebookAccountQuota[];
};

export async function facebookQuotaSummary(): Promise<FacebookQuotaSummary | null> {
  try {
    const rows = await q<{ id: string; label: string; cap: number; paused: boolean; used_today: number }>(
      `SELECT
         u.id AS id,
         COALESCE(NULLIF(TRIM(u.name), ''), u.email, u.id) AS label,
         COALESCE(u.daily_cap, 15)::int AS cap,
         (u.paused_until IS NOT NULL AND u.paused_until > now()) AS paused,
         COALESCE((
           SELECT count(*)::int FROM ${AP}.post_logs pl
            WHERE pl.user_id = u.id
              AND (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date
                  = (now() AT TIME ZONE 'Asia/Bangkok')::date
         ), 0) AS used_today
       FROM ${AP}.users u
       ORDER BY used_today DESC, label`,
    );
    if (rows.length === 0) return null;
    const list: FacebookAccountQuota[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      used_today: Number(r.used_today),
      cap: Number(r.cap),
      paused: r.paused,
    }));
    // cap ที่พบบ่อยสุด — เป็นค่า prefill ของช่องปรับ cap
    const capCounts = new Map<number, number>();
    for (const a of list) capCounts.set(a.cap, (capCounts.get(a.cap) ?? 0) + 1);
    const cap_default = [...capCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 15;
    return {
      accounts: list.length,
      paused: list.filter((a) => a.paused).length,
      posts_today: list.reduce((s, a) => s + a.used_today, 0),
      capacity: list.reduce((s, a) => s + a.cap, 0),
      cap_default,
      list,
    };
  } catch {
    return null; // autopost schema not present
  }
}

/** ตั้งเพดานโพสต์ต่อบัญชี/วัน ให้ทุกบัญชี Facebook (จาก panel โควต้า) */
export async function setFacebookDailyCapForAll(cap: number) {
  await q(`UPDATE ${AP}.users SET daily_cap = $1, updated_at = now()`, [cap]);
}

// สถานะการโพสต์ Auto-Post — ให้เห็นว่ากดโพสต์แล้วสำเร็จ/ล้ม/ถูกข้าม + worker ออนไลน์ไหม
export type AutopostRunRow = {
  id: string;
  account: string | null;
  status: string;
  worker_id: string | null;
  error: string | null;
  message: string | null;
  requested_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
export type AutopostLogRow = { created_at: string; level: string; message: string };
export type AutopostActivity = {
  runs: AutopostRunRow[];
  logs: AutopostLogRow[];
  worker_last_seen: string | null; // เวลาล่าสุดที่ worker แตะคิว (ประเมินว่า online ไหม)
  queued: number;
  running: number;
};

export async function autopostActivity(): Promise<AutopostActivity | null> {
  try {
    const runs = await q<AutopostRunRow>(
      `SELECT r.id, u.name AS account, r.status, r.worker_id, r.error, r.message, r.requested_by,
              r.created_at, r.started_at, r.finished_at
         FROM ${AP}.post_run_queue r
         LEFT JOIN ${AP}.users u ON u.id = r.user_id
        ORDER BY r.created_at DESC LIMIT 8`,
    );
    const logs = await q<AutopostLogRow>(
      `SELECT created_at, level, message FROM ${AP}.run_logs
        ORDER BY created_at DESC LIMIT 15`,
    );
    const agg = await q<{ worker_last_seen: string | null; queued: number; running: number }>(
      `SELECT max(GREATEST(started_at, created_at)) FILTER (WHERE worker_id IS NOT NULL) AS worker_last_seen,
              count(*) FILTER (WHERE status='queued')::int AS queued,
              count(*) FILTER (WHERE status='running')::int AS running
         FROM ${AP}.post_run_queue`,
    );
    return {
      runs,
      logs,
      worker_last_seen: agg[0]?.worker_last_seen ?? null,
      queued: agg[0]?.queued ?? 0,
      running: agg[0]?.running ?? 0,
    };
  } catch {
    return null;
  }
}

// --- Pin บัญชี FB → เครื่อง (กันบัญชีสลับ IP/เครื่อง โดยไม่ต้องใช้ proxy) ---
export type FbAccountPin = { id: string; label: string; preferred_worker: string | null };

/** บัญชี FB + เครื่องที่ผูกไว้ (สำหรับ panel pin). guarded. */
export async function listFbAccountPins(): Promise<FbAccountPin[]> {
  try {
    await q(`ALTER TABLE ${AP}.users ADD COLUMN IF NOT EXISTS preferred_worker VARCHAR(255)`);
    return await q<FbAccountPin>(
      `SELECT id, COALESCE(NULLIF(TRIM(name), ''), env_key, id) AS label, preferred_worker
         FROM ${AP}.users
        ORDER BY label`,
    );
  } catch {
    return [];
  }
}

/** ชื่อเครื่อง (worker_name) ที่เคยเห็นในระบบ — จาก worker_id ตัด -pid ท้ายออก. ไว้ทำ datalist. */
export async function knownWorkerNames(): Promise<string[]> {
  try {
    const rows = await q<{ name: string }>(
      `SELECT DISTINCT regexp_replace(worker_id, '-[0-9]+$', '') AS name
         FROM ${AP}.post_run_queue
        WHERE worker_id IS NOT NULL AND TRIM(worker_id) <> ''
        ORDER BY name LIMIT 20`,
    );
    return rows.map((r) => r.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** ตั้ง/ล้าง pin ของบัญชี (worker ว่าง = ปลด pin ให้เครื่องไหนก็หยิบได้). */
export async function setFbAccountWorker(id: string, worker: string | null) {
  await q(`ALTER TABLE ${AP}.users ADD COLUMN IF NOT EXISTS preferred_worker VARCHAR(255)`);
  await q(`UPDATE ${AP}.users SET preferred_worker = $2, updated_at = now() WHERE id = $1`, [
    id,
    worker && worker.trim() ? worker.trim() : null,
  ]);
}

// --- รอบโพสต์ (Runs): บัญชีไหนโพสต์ที่ worker ไหน + โพสต์ลงกลุ่มไหนจริง ---
export type AutopostRunListRow = {
  id: string;
  run_id: string | null;
  account: string | null;
  user_id: string | null;
  worker_id: string | null;
  status: string;
  requested_by: string | null;
  message: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  posted: number;
  pinned_worker: string | null;
};

/** รายการรอบโพสต์ล่าสุด — เห็นว่าบัญชีไหน วิ่งที่ worker ไหน สั่งโดยใคร โพสต์ไปกี่กลุ่ม. guarded. */
export async function autopostRuns(limit = 50): Promise<AutopostRunListRow[]> {
  try {
    await q(`ALTER TABLE ${AP}.users ADD COLUMN IF NOT EXISTS preferred_worker VARCHAR(255)`);
    return await q<AutopostRunListRow>(
      `SELECT r.id, r.run_id, u.name AS account, r.user_id, r.worker_id, r.status,
              r.requested_by, r.message, r.error, r.created_at, r.started_at, r.finished_at,
              u.preferred_worker AS pinned_worker,
              COALESCE((
                SELECT count(*)::int FROM ${AP}.post_logs pl
                 WHERE pl.run_id = r.run_id AND pl.post_link IS NOT NULL AND TRIM(pl.post_link) <> ''
              ), 0) AS posted
         FROM ${AP}.post_run_queue r
         LEFT JOIN ${AP}.users u ON u.id = r.user_id
        ORDER BY r.created_at DESC LIMIT $1`,
      [limit],
    );
  } catch {
    return [];
  }
}

export async function autopostRun(id: string): Promise<AutopostRunListRow | null> {
  try {
    await q(`ALTER TABLE ${AP}.users ADD COLUMN IF NOT EXISTS preferred_worker VARCHAR(255)`);
    const rows = await q<AutopostRunListRow>(
      `SELECT r.id, r.run_id, u.name AS account, r.user_id, r.worker_id, r.status,
              r.requested_by, r.message, r.error, r.created_at, r.started_at, r.finished_at, 0 AS posted,
              u.preferred_worker AS pinned_worker
         FROM ${AP}.post_run_queue r
         LEFT JOIN ${AP}.users u ON u.id = r.user_id
        WHERE r.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export type AutopostRunPostRow = {
  id: string;
  job_title: string | null;
  group_name: string | null;
  group_id: string | null;
  post_link: string | null;
  post_status: string | null;
  comment_count: number;
  created_at: string;
};

/** โพสต์จริงต่อกลุ่มของรอบนี้ (จาก post_logs) — กดลิงก์ดูโพสต์บน Facebook ได้. guarded. */
export async function autopostRunPosts(runId: string): Promise<AutopostRunPostRow[]> {
  if (!runId) return [];
  try {
    return await q<AutopostRunPostRow>(
      `SELECT id, job_title, group_name, group_id, post_link, post_status,
              COALESCE(comment_count, 0) AS comment_count, created_at
         FROM ${AP}.post_logs
        WHERE run_id = $1
        ORDER BY created_at DESC`,
      [runId],
    );
  } catch {
    return [];
  }
}

// สรุป Auto-Post สำหรับหน้าภาพรวม (รวม dashboard ของ autopost เข้ามา) — guarded
export type AutopostOverview = {
  accounts: number;
  paused: number;
  over_cap: number;
  posts_today: number;
  capacity: number;
  leads_today: number;
  leads_14d: number;
};

export async function autopostOverview(): Promise<AutopostOverview | null> {
  try {
    const acc = await q<{ accounts: number; paused: number; over_cap: number; posts_today: number; capacity: number }>(
      `WITH t AS (
         SELECT u.id,
                COALESCE(u.daily_cap, 15) AS cap,
                (u.paused_until IS NOT NULL AND u.paused_until > now()) AS paused,
                COALESCE((
                  SELECT count(*)::int FROM ${AP}.post_logs pl
                   WHERE pl.user_id = u.id
                     AND (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date
                         = (now() AT TIME ZONE 'Asia/Bangkok')::date
                ), 0) AS used
           FROM ${AP}.users u
       )
       SELECT count(*)::int AS accounts,
              count(*) FILTER (WHERE paused)::int AS paused,
              count(*) FILTER (WHERE used >= cap)::int AS over_cap,
              COALESCE(sum(used), 0)::int AS posts_today,
              COALESCE(sum(cap), 0)::int AS capacity
         FROM t`,
    );
    if (!acc[0] || acc[0].accounts === 0) return null;
    const leads = await q<{ leads_today: number; leads_14d: number }>(
      `SELECT
         count(*) FILTER (
           WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date = (now() AT TIME ZONE 'Asia/Bangkok')::date
         )::int AS leads_today,
         count(*) FILTER (WHERE created_at >= now() - interval '14 days')::int AS leads_14d
       FROM ${AP}.post_logs
       WHERE customer_phone IS NOT NULL AND customer_phone <> ''`,
    );
    return { ...acc[0], leads_today: leads[0]?.leads_today ?? 0, leads_14d: leads[0]?.leads_14d ?? 0 };
  } catch {
    return null;
  }
}

/** True when tasks are queued but no worker seems to be picking them up. */
export async function hasStaleQueuedTasks(sec = 90) {
  const rows = await q<{ n: number }>(
    `SELECT 1 AS n FROM scrape_tasks
      WHERE status='queued' AND enabled=true
        AND updated_at < now() - ($1::text || ' seconds')::interval
      LIMIT 1`,
    [String(sec)],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Scrape tasks
// ---------------------------------------------------------------------------
export type AdjacentPlan = {
  family?: string;
  family_label?: string;
  gate?: string[];
  reason?: string;
  model?: string;
  expanded_green?: string[];
  suggested?: { yellow?: string[]; red?: string[]; excluded?: { name: string; reason: string }[] };
  filled?: number;
  target?: number;
};

export type TaskRow = {
  id: string;
  name: string;
  connector_id: string;
  connector_label: string;
  platform: string;
  mode: 'count' | 'date_range';
  target_count: number | null;
  updated_since: string | null;
  criteria: Record<string, unknown>;
  schedule_cron: string | null;
  enabled: boolean;
  status: string;
  phase: string;
  progress_got: number;
  progress_target: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
  created_at: string;
  expand_adjacent: boolean;
  adjacent_plan: AdjacentPlan | null;
};

export async function listTasks() {
  return q<TaskRow>(
    `SELECT t.*, c.label AS connector_label, c.platform
       FROM scrape_tasks t JOIN connectors c ON c.id = t.connector_id
      ORDER BY t.created_at DESC`,
  );
}

export async function insertTask(t: {
  name: string;
  connectorId: string;
  mode: 'count' | 'date_range';
  targetCount: number | null;
  updatedSince: string | null;
  criteria: Record<string, unknown>;
  scheduleCron: string | null;
  nextRunAt: string | null;
  status: string;
  expandAdjacent?: boolean;
}) {
  const rows = await q<{ id: string }>(
    `INSERT INTO scrape_tasks (name, connector_id, mode, target_count, updated_since, criteria,
                               schedule_cron, next_run_at, status, expand_adjacent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [t.name, t.connectorId, t.mode, t.targetCount, t.updatedSince, JSON.stringify(t.criteria),
     t.scheduleCron, t.nextRunAt, t.status, t.expandAdjacent ?? true],
  );
  return rows[0].id;
}

/**
 * Clone a task to search ONE specific adjacent position the user picked from the
 * AI's 🟡/🔴 suggestions. The clone targets that position only and does not itself
 * re-expand (expand_adjacent=false), so it's a deliberate one-shot search.
 */
export async function createAdjacentTask(sourceTaskId: string, position: string) {
  const rows = await q<Record<string, any>>(`SELECT * FROM scrape_tasks WHERE id=$1`, [sourceTaskId]);
  const src = rows[0];
  if (!src) throw new Error(`source task not found: ${sourceTaskId}`);
  const criteria: Record<string, unknown> = { ...(src.criteria ?? {}), position };
  delete criteria.keyword; // widen: the base skill keyword would over-narrow the adjacent search
  const ins = await q<{ id: string }>(
    `INSERT INTO scrape_tasks (name, connector_id, mode, target_count, updated_since, criteria, status, expand_adjacent)
     VALUES ($1,$2,$3,$4,$5,$6,'queued',false) RETURNING id`,
    [`${src.name} · ${position}`, src.connector_id, src.mode, src.target_count, src.updated_since, JSON.stringify(criteria)],
  );
  return ins[0].id;
}

export async function queueTask(id: string) {
  await q(`UPDATE scrape_tasks SET status='queued', phase='idle', enabled=true, updated_at=now() WHERE id=$1`, [id]);
}

/**
 * Enqueue a scrape job for a task into the unified work_queue so the work-queue
 * runner (npm run worker:pool / kickWorker) picks it up. connector_key locks per
 * account ('<platform>:<connectorId>'). Skips if the task already has a live job.
 */
export async function enqueueScrapeForTask(taskId: string, ownerUser: string | null = null) {
  const rows = await q<{ connector_id: string; platform: string; criteria: Record<string, unknown> }>(
    `SELECT t.connector_id, t.criteria, c.platform
       FROM scrape_tasks t JOIN connectors c ON c.id = t.connector_id
      WHERE t.id = $1`,
    [taskId],
  );
  if (!rows[0]) throw new Error(`task not found: ${taskId}`);
  const { connector_id, platform, criteria } = rows[0];
  await q(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user)
     SELECT 'scrape', 'scraper', $1, $2, $3::jsonb, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w WHERE w.ref_id = $2 AND w.status IN ('queued','running'))`,
    [`${platform}:${connector_id}`, taskId, JSON.stringify(criteria ?? {}), ownerUser],
  );
}

export async function setTaskEnabled(id: string, enabled: boolean) {
  await q('UPDATE scrape_tasks SET enabled=$2, updated_at=now() WHERE id=$1', [id, enabled]);
}

export async function deleteTask(id: string) {
  await q('DELETE FROM scrape_tasks WHERE id=$1', [id]);
}

/** Compact live status for polling the progress counters. */
export async function taskStatuses() {
  return q<{ id: string; status: string; phase: string; progress_got: number; progress_target: number; last_error: string | null; last_run_at: string | null; updated_at: string }>(
    `SELECT id, status, phase, progress_got, progress_target, last_error, last_run_at, updated_at FROM scrape_tasks`,
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function dashboardStats() {
  const [totals] = await q<{ candidates: number; sources: number; assets: number }>(
    `SELECT (SELECT count(*)::int FROM candidates)        AS candidates,
            (SELECT count(*)::int FROM candidate_sources) AS sources,
            (SELECT count(*)::int FROM candidate_assets)  AS assets`,
  );
  const byPlatform = await q<{ platform: string; n: number }>(
    `SELECT platform, count(DISTINCT candidate_id)::int n FROM candidate_sources GROUP BY platform ORDER BY n DESC`,
  );
  const [completeness] = await q<{
    total: number; with_phone: number; with_email: number; with_attachment: number; extracted: number;
  }>(
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS with_phone,
            count(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS with_email,
            (SELECT count(DISTINCT candidate_id)::int FROM candidate_assets WHERE kind='attachment') AS with_attachment,
            (SELECT count(*)::int FROM candidate_assets WHERE extract_status='success') AS extracted
       FROM candidates`,
  );
  return { totals, byPlatform, completeness };
}

export async function recentRuns(limit = 12) {
  return q<{
    id: string; platform: string; status: string; requested: number; found: number;
    new_count: number; updated_count: number; failed: number; started_at: string;
    finished_at: string | null; connector_label: string | null;
  }>(
    `SELECT r.id, r.platform, r.status, r.requested, r.found, r.new_count, r.updated_count,
            r.failed, r.started_at, r.finished_at, c.label AS connector_label
       FROM scrape_runs r LEFT JOIN connectors c ON c.id = r.connector_id
      ORDER BY r.started_at DESC LIMIT $1`,
    [limit],
  );
}

// ---------------------------------------------------------------------------
// Content Orchestrator — ERP intake staging + campaigns
// ---------------------------------------------------------------------------
export type StagedRequest = {
  request_no: string;
  title: string | null;
  province: string | null;
  qty: number | null;
  remaining_qty: number | null;
  request_date: string | null;
  want_date_from: string | null;
  snapshot: Record<string, unknown>;
  synced_at: string;
};

/** ใบขอจาก ERP ที่ยังไม่ได้สร้าง campaign (staging). */
export async function listStagedRequests() {
  return q<StagedRequest>(
    `SELECT request_no, title, province, qty, remaining_qty, request_date, want_date_from, snapshot, synced_at
       FROM erp_open_requests
      WHERE campaign_id IS NULL
      ORDER BY request_date DESC NULLS LAST, remaining_qty DESC NULLS LAST`,
  );
}

export type CampaignRow = {
  id: string;
  request_no: string | null;
  request_snapshot?: Record<string, unknown>;
  title: string | null;
  positions: string | null;
  province: string | null;
  qty: number | null;
  remaining_qty: number | null;
  status: string;
  status_note: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listCampaigns() {
  return q<CampaignRow>(`SELECT * FROM recruit_campaigns ORDER BY created_at DESC`);
}

export async function getCampaign(id: string) {
  const rows = await q<CampaignRow>(`SELECT * FROM recruit_campaigns WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// --- Pool pre-check: มีคนใน So Recruit (jarvis_rm) สำหรับใบขอนี้หรือยัง ---
// อ่านอย่างเดียว เชื่อมด้วย jobs.request_no = campaign.request_no (ตัวเชื่อมเดียวที่มีจริง
// ในสคีมา). ไม่ตั้งกติกา matching เอง, ไม่ตัดสินใจแทนคน. guarded — null ถ้าเข้าไม่ได้.
export type SoRecruitMatch = {
  found: boolean;
  totalAssigned: number;
  jobs: { id: string; status: string | null; unit_name: string | null; location: string | null; assigned: number }[];
};

export async function soRecruitCheck(requestNo: string | null): Promise<SoRecruitMatch | null> {
  const rn = (requestNo ?? '').trim();
  if (!rn) return { found: false, totalAssigned: 0, jobs: [] };
  try {
    const jobs = await q<{ id: string; status: string | null; unit_name: string | null; location: string | null; assigned: number }>(
      `SELECT j.id, j.status, j.unit_name, j.location_address AS location,
              (SELECT count(*)::int FROM "jarvis_rm".job_assignments ja
                WHERE ja.job_id = j.id AND COALESCE(ja.status, '') <> 'cancelled') AS assigned
         FROM "jarvis_rm".jobs j
        WHERE j.request_no = $1`,
      [rn],
    );
    const totalAssigned = jobs.reduce((s, j) => s + (j.assigned ?? 0), 0);
    return { found: jobs.length > 0, totalAssigned, jobs };
  } catch {
    return null; // สคีมา/สิทธิ์ไม่พร้อม
  }
}

/** สรุปจำนวน campaign แยกตาม pipeline stage สำหรับ dashboard. */
export async function campaignStats() {
  const rows = await q<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM recruit_campaigns GROUP BY status`,
  );
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.n;
    total += r.n;
  }
  return { total, byStatus };
}

/** สร้าง campaign จากใบขอใน staging (คนกดสั่งต่อใบ) + ผูก staging กันสร้างซ้ำ. */
export async function createCampaignFromRequest(requestNo: string, createdBy: string | null) {
  const st = await q<StagedRequest>(`SELECT * FROM erp_open_requests WHERE request_no = $1`, [requestNo]);
  if (!st[0]) throw new Error(`ไม่พบใบขอ ${requestNo} ใน staging`);
  const s = st[0];
  const ins = await q<{ id: string }>(
    `INSERT INTO recruit_campaigns (request_no, request_snapshot, title, province, qty, remaining_qty, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'new',$7)
     ON CONFLICT (request_no) DO NOTHING
     RETURNING id`,
    [requestNo, JSON.stringify(s.snapshot ?? {}), s.title, s.province, s.qty, s.remaining_qty, createdBy],
  );
  let campaignId = ins[0]?.id;
  if (!campaignId) {
    const ex = await q<{ id: string }>(`SELECT id FROM recruit_campaigns WHERE request_no = $1`, [requestNo]);
    campaignId = ex[0]?.id;
  }
  if (campaignId) await q(`UPDATE erp_open_requests SET campaign_id = $2 WHERE request_no = $1`, [requestNo, campaignId]);
  return campaignId;
}

export async function setCampaignStatus(id: string, status: string, note: string | null = null) {
  await q(`UPDATE recruit_campaigns SET status = $2, status_note = $3, updated_at = now() WHERE id = $1`, [id, status, note]);
}

export type ContentRow = {
  id: string;
  campaign_id: string;
  version: number;
  platform: string;
  caption: string | null;
  video_brief: string | null;
  gen_model: string | null;
  status: string;
  engagement_score: number | null;
  reject_reason: string | null;
  created_at: string;
  has_image: boolean;
};

/** ร่างคอนเทนต์ทุก version ของ campaign (ใหม่สุดก่อน). image bytes ไม่ดึงมา (สตรีมแยก). */
export async function listCampaignContents(campaignId: string) {
  return q<ContentRow>(
    `SELECT id, campaign_id, version, platform, caption, video_brief, gen_model, status,
            engagement_score, reject_reason, created_at, (image_bytes IS NOT NULL) AS has_image
       FROM campaign_contents WHERE campaign_id = $1 ORDER BY version DESC`,
    [campaignId],
  );
}

export async function setContentStatus(id: string, status: string, reason: string | null = null) {
  await q(`UPDATE campaign_contents SET status = $2, reject_reason = $3 WHERE id = $1`, [id, status, reason]);
}

/** แก้ caption ของร่างคอนเทนต์ (คนปรับข้อความก่อนอนุมัติ). แก้ได้เฉพาะที่ยังเป็น draft. */
export async function updateContentCaption(id: string, caption: string) {
  await q(`UPDATE campaign_contents SET caption = $2 WHERE id = $1 AND status = 'draft'`, [id, caption]);
}

/**
 * Enqueue งาน AI คิด content ให้ campaign เข้า work_queue (type='draft',
 * module='orchestrator') ให้ runner บนเครื่อง PC หยิบไปทำ. connector_key
 * 'orchestrator:<id>' ล็อกต่อ campaign กันคิดซ้ำซ้อน; ข้ามถ้ามี draft job ค้างอยู่แล้ว.
 */
export async function enqueueDraftForCampaign(campaignId: string, ownerUser: string | null = null) {
  await q(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user)
     SELECT 'draft', 'orchestrator', $1, $2, '{}'::jsonb, $3
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w
         WHERE w.ref_id = $2 AND w.type = 'draft' AND w.status IN ('queued','running'))`,
    [`orchestrator:${campaignId}`, campaignId, ownerUser],
  );
}

/** image bytes ของร่างคอนเทนต์ (สตรีมผ่าน API route) — null ถ้าไม่มี. */
export async function getContentImageBytes(id: string) {
  const rows = await q<{ image_bytes: Buffer | null; image_mime: string | null }>(
    `SELECT image_bytes, image_mime FROM campaign_contents WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** ร่างคอนเทนต์ 1 แถว (caption + มีรูปไหม) สำหรับตอนอนุมัติ→โพสต์. */
export async function getContentById(id: string) {
  const rows = await q<{ id: string; campaign_id: string; caption: string | null; has_image: boolean }>(
    `SELECT id, campaign_id, caption, (image_bytes IS NOT NULL) AS has_image
       FROM campaign_contents WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Orchestrator → Autopost bridge (cross-schema, DB เดียวกัน)
// ---------------------------------------------------------------------------
export type FbAccount = { id: string; label: string; group_count: number };

/** บัญชี Facebook ที่ตั้งไว้ในโมดูล autopost (ให้เลือกตอนอนุมัติ). guarded — [] ถ้า schema ไม่มี. */
export async function listFacebookAccounts(): Promise<FbAccount[]> {
  try {
    return await q<FbAccount>(
      `SELECT id,
              COALESCE(NULLIF(TRIM(name), ''), env_key, id) AS label,
              COALESCE(jsonb_array_length(
                CASE WHEN jsonb_typeof(group_ids::jsonb) = 'array' THEN group_ids::jsonb ELSE '[]'::jsonb END
              ), 0) AS group_count
         FROM ${AP}.users
        ORDER BY label`,
    );
  } catch {
    return [];
  }
}

function autopostId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * อนุมัติร่างคอนเทนต์ → ส่งเข้าคิวโพสต์ของ autopost: สร้าง job (+image_ref ชี้รูป AI) +
 * assignment (บัญชีที่เลือก, กลุ่มว่าง = ใช้กลุ่มที่ตั้งในบัญชี) + post_run_queue (queued).
 * ทั้งหมดอยู่ schema `so_autopost_jobs` (DB เดียวกัน). แล้วบันทึก campaign_posts ฝั่ง orchestrator
 * (เตรียมวัดผลเฟส 4). worker บนเครื่อง PC จะหยิบคิวไปโพสต์ FB พร้อมรูป.
 */
export async function enqueueApprovedPost(opts: {
  campaign: CampaignRow;
  content: { id: string; caption: string | null; has_image: boolean };
  userId: string;
  requestedBy: string | null;
}) {
  const { campaign, content, userId, requestedBy } = opts;
  const jobId = autopostId();
  const assignmentId = autopostId();
  const queueId = autopostId();
  const title = (campaign.title || campaign.request_no || 'ประกาศรับสมัครงาน').slice(0, 500);
  const imageRef = content.has_image ? `campaign-content:${content.id}` : null;

  // เผื่อ schema autopost ยังไม่มีคอลัมน์ image_ref (idempotent)
  await q(`ALTER TABLE ${AP}.jobs ADD COLUMN IF NOT EXISTS image_ref TEXT`);

  await q(
    `INSERT INTO ${AP}.jobs (id, title, owner, company, caption, status, image_ref)
     VALUES ($1, $2, 'SO Recruitment', 'SO Recruitment', $3, 'pending', $4)`,
    [jobId, title, content.caption || '', imageRef],
  );
  await q(
    `INSERT INTO ${AP}.assignments (id, job_ids, group_ids, user_id)
     VALUES ($1, $2::jsonb, '[]'::jsonb, $3)`,
    [assignmentId, JSON.stringify([jobId]), userId],
  );
  // requested_by ≠ 'auto-daily' → worker ตั้ง IGNORE_DAILY_CAP=1 (โพสต์แบบสั่งเองข้าม cap ได้)
  await q(
    `INSERT INTO ${AP}.post_run_queue (id, assignment_ids, user_id, status, requested_by, message)
     VALUES ($1, $2::jsonb, $3, 'queued', $4, $5)`,
    [queueId, JSON.stringify([assignmentId]), userId, requestedBy || 'orchestrator', `orchestrator campaign ${campaign.id}`],
  );

  await q(
    `INSERT INTO campaign_posts (campaign_id, content_id, platform, account_ref, job_ref)
     VALUES ($1, $2, 'facebook', $3, $4)`,
    [campaign.id, content.id, userId, jobId],
  );

  return { jobId, assignmentId, queueId };
}

/** enqueue งานวัดผล engagement ของ campaign (worker draining ทำได้ ไม่ต้อง browser). */
export async function enqueueMeasureForCampaign(campaignId: string, ownerUser: string | null = null) {
  await q(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user)
     SELECT 'measure', 'orchestrator', $1, $2, '{}'::jsonb, $3
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w
         WHERE w.ref_id = $2 AND w.type = 'measure' AND w.status IN ('queued','running'))`,
    [`orchestrator:${campaignId}`, campaignId, ownerUser],
  );
}

export type CampaignPostRow = {
  id: string;
  content_id: string | null;
  platform: string;
  account_ref: string | null;
  post_link: string | null;
  posted_at: string | null;
  comments: number;
  lead_count: number;
  likes: number;
  shares: number;
  engagement_score: number | null;
  verdict: string;
  measured_at: string | null;
};

/** โพสต์จริง + engagement ที่วัดได้ ของ campaign (ใหม่สุดก่อน). */
export async function listCampaignPosts(campaignId: string) {
  return q<CampaignPostRow>(
    `SELECT id, content_id, platform, account_ref, post_link, posted_at,
            comments, lead_count, likes, shares, engagement_score, verdict, measured_at
       FROM campaign_posts WHERE campaign_id = $1 ORDER BY created_at DESC`,
    [campaignId],
  );
}
