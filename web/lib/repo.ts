import 'server-only';
import { randomUUID } from 'node:crypto';
import { pool, q } from './db';
import { evaluateContentQuality, qualityFailureMessages } from '../../src/core/content-quality.js';
import type { ContentQualityResult } from '../../src/core/content-quality.js';
import { evaluateWorkflowReadiness } from '../../src/core/workflow-readiness.js';
import type { WorkflowReadiness } from '../../src/core/workflow-readiness.js';
import { renderPoster } from '../../src/core/poster.js';

// schema ของ autopost — แยกต่อ project ได้ผ่าน env (ไม่ตั้ง = so_autopost_jobs เดิม)
// ใช้กับทุก query ข้าม schema ไปฝั่ง autopost. ค่าจาก env เราคุมเอง (ไม่ใช่ input ผู้ใช้)
const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) {
  throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
}
const AP = `"${AP_SCHEMA}"`;
// Worker compatibility is a release contract, not the current web commit.
// UI-only deploys must not take both Mac workers offline. Bump this SHA only
// after worker code changes have been deployed and verified on the Mac.
const REQUIRED_WORKER_BUILD_SHA = String(
  process.env.REQUIRED_WORKER_BUILD_SHA || 'a602d66cd932c23de05541cae70bd3456a76f56e',
).trim();
const REQUIRED_CONTENT_PIPELINE = 'evidence-v1';

function workerBuildMatches(meta: Record<string, unknown> | null | undefined): boolean {
  return (!REQUIRED_WORKER_BUILD_SHA || String(meta?.build_sha || '') === REQUIRED_WORKER_BUILD_SHA)
    && String(meta?.content_pipeline || '') === REQUIRED_CONTENT_PIPELINE;
}

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
  viewed_at: string | null;
  viewed_by: string | null;
  called_at: string | null;
  called_by: string | null;
};

export type CandidateFilter = {
  search?: string;
  platform?: string;
  position?: string;
  province?: string;
  updatedDays?: number; // อัปเดตภายใน N วันล่าสุด
  activity?: 'viewed' | 'unviewed' | 'called' | 'uncalled';
  limit?: number;
  offset?: number;
};

/** สร้าง WHERE ร่วมกันระหว่าง list กับ count (params ต่อเนื่องกัน) */
function buildCandidateWhere(opts: CandidateFilter, params: unknown[]): string {
  const where: string[] = [];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.desired_positions ILIKE $${params.length})`);
  }
  if (opts.platform) {
    params.push(opts.platform);
    where.push(`EXISTS (SELECT 1 FROM candidate_sources s WHERE s.candidate_id = c.id AND s.platform = $${params.length})`);
  }
  if (opts.position) {
    params.push(`%${opts.position}%`);
    where.push(`c.desired_positions ILIKE $${params.length}`);
  }
  if (opts.province) {
    params.push(opts.province);
    where.push(`c.province = $${params.length}`);
  }
  if (opts.updatedDays && opts.updatedDays > 0) {
    params.push(opts.updatedDays);
    where.push(`c.last_updated_at >= now() - ($${params.length} || ' days')::interval`);
  }
  if (opts.activity === 'viewed') {
    where.push(`EXISTS (SELECT 1 FROM candidate_activity av WHERE av.candidate_id = c.id AND av.activity_type = 'viewed')`);
  } else if (opts.activity === 'unviewed') {
    where.push(`NOT EXISTS (SELECT 1 FROM candidate_activity av WHERE av.candidate_id = c.id AND av.activity_type = 'viewed')`);
  } else if (opts.activity === 'called') {
    where.push(`EXISTS (SELECT 1 FROM candidate_activity ac WHERE ac.candidate_id = c.id AND ac.activity_type = 'called')`);
  } else if (opts.activity === 'uncalled') {
    where.push(`NOT EXISTS (SELECT 1 FROM candidate_activity ac WHERE ac.candidate_id = c.id AND ac.activity_type = 'called')`);
  }
  return where.length ? 'WHERE ' + where.join(' AND ') : '';
}

export async function listCandidates(opts: CandidateFilter = {}) {
  const { limit = 40, offset = 0 } = opts;
  const params: unknown[] = [];
  const whereSql = buildCandidateWhere(opts, params);
  params.push(limit);
  params.push(offset);
  const rows = await q<CandidateRow>(
    `SELECT c.id, c.full_name, c.prefix, c.phone, c.email, c.province, c.expected_salary,
            c.desired_positions, c.last_updated_at,
            ARRAY(SELECT DISTINCT s.platform FROM candidate_sources s WHERE s.candidate_id = c.id) AS platforms,
            (SELECT count(*)::int FROM candidate_assets a WHERE a.candidate_id = c.id) AS asset_count,
            (SELECT av.occurred_at FROM candidate_activity av
              WHERE av.candidate_id = c.id AND av.activity_type = 'viewed'
              ORDER BY av.occurred_at DESC LIMIT 1) AS viewed_at,
            (SELECT av.actor FROM candidate_activity av
              WHERE av.candidate_id = c.id AND av.activity_type = 'viewed'
              ORDER BY av.occurred_at DESC LIMIT 1) AS viewed_by,
            (SELECT ac.occurred_at FROM candidate_activity ac
              WHERE ac.candidate_id = c.id AND ac.activity_type = 'called'
              ORDER BY ac.occurred_at DESC LIMIT 1) AS called_at,
            (SELECT ac.actor FROM candidate_activity ac
              WHERE ac.candidate_id = c.id AND ac.activity_type = 'called'
              ORDER BY ac.occurred_at DESC LIMIT 1) AS called_by
       FROM candidates c
      ${whereSql}
      ORDER BY c.last_updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function countCandidates(opts: CandidateFilter = {}) {
  const params: unknown[] = [];
  const whereSql = buildCandidateWhere(opts, params);
  const rows = await q<{ n: number }>(
    `SELECT count(*)::int n FROM candidates c ${whereSql}`,
    params,
  );
  return rows[0]?.n ?? 0;
}

/** รายชื่อจังหวัดที่มีในฐานผู้สมัคร (สำหรับ dropdown ฟิลเตอร์) */
export async function listCandidateProvinces(): Promise<string[]> {
  const rows = await q<{ province: string }>(
    `SELECT DISTINCT province FROM candidates
      WHERE province IS NOT NULL AND TRIM(province) <> ''
      ORDER BY province`,
  );
  return rows.map((r) => r.province);
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
  const activity = await q<any>(
    `SELECT id, activity_type, actor, note, occurred_at
       FROM candidate_activity WHERE candidate_id = $1 ORDER BY occurred_at DESC`,
    [id],
  );
  const viewed = activity.find((a) => a.activity_type === 'viewed');
  const called = activity.find((a) => a.activity_type === 'called');
  return {
    ...rows[0],
    sources,
    assets,
    activity,
    viewed_at: viewed?.occurred_at ?? null,
    viewed_by: viewed?.actor ?? null,
    called_at: called?.occurred_at ?? null,
    called_by: called?.actor ?? null,
    latest_call_note: called?.note ?? null,
  };
}

export async function recordCandidateActivity(input: {
  candidateId: string;
  activityType: 'viewed' | 'called';
  actor: string | null;
  note?: string | null;
}) {
  const rows = await q<{ id: string }>(
    `INSERT INTO candidate_activity (candidate_id, activity_type, actor, note)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM candidates WHERE id = $1)
     RETURNING id`,
    [input.candidateId, input.activityType, input.actor, input.note ?? null],
  );
  if (!rows[0]) throw new Error('ไม่พบผู้สมัครที่ต้องการบันทึกกิจกรรม');
  return rows[0].id;
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

/** แก้ข้อมูล Scraper connector (jobbkk/jobthai). password ว่าง = ไม่เปลี่ยนรหัสเดิม. */
export async function updateScraperConnector(
  id: string,
  c: { label: string; username: string; passwordEnc: string | null },
) {
  if (c.passwordEnc) {
    await q('UPDATE connectors SET label=$2, username=$3, password_enc=$4, updated_at=now() WHERE id=$1', [
      id, c.label, c.username, c.passwordEnc,
    ]);
  } else {
    await q('UPDATE connectors SET label=$2, username=$3, updated_at=now() WHERE id=$1', [id, c.label, c.username]);
  }
}

/** แก้ข้อมูลบัญชี Facebook. password ว่าง = ไม่เปลี่ยนรหัสเดิม. */
export async function updateFacebookAccount(
  id: string,
  c: { label: string; username: string; password: string | null },
) {
  if (c.password) {
    await q(
      `UPDATE ${AP}.users SET name=$2, poster_name=$2, email=$3, password=$4, updated_at=now() WHERE id=$1`,
      [id, c.label, c.username, c.password],
    );
  } else {
    await q(`UPDATE ${AP}.users SET name=$2, poster_name=$2, email=$3, updated_at=now() WHERE id=$1`, [
      id, c.label, c.username,
    ]);
  }
}

/** ลบบัญชี Facebook ออกจาก schema Auto-Post ของ project นี้. */
export async function deleteFacebookAccount(id: string) {
  await q(`DELETE FROM ${AP}.users WHERE id = $1`, [id]);
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

// ---------------------------------------------------------------------------
// ผลลัพธ์ & Leads — เก็บเกี่ยวเบอร์จากคอมเมนต์ (อ่านจาก post_logs ฝั่ง autopost)
// lead = เบอร์ใน customer_phone (ตัวเก็บคอมเมนต์ join ด้วย ', '); 1 โพสต์ได้หลายเบอร์
// ตัวเก็บ dedupe เบอร์ข้ามโพสต์แล้ว (เก็บโพสต์ล่าสุดของเบอร์นั้น) → นับตรง ๆ ได้
// ---------------------------------------------------------------------------
// จำนวนเบอร์ใน 1 แถว post_logs — split ด้วย ',' (ครอบทั้ง ', ' ใหม่และ ',' เก่า)
const LEAD_COUNT_SQL = `CASE WHEN NULLIF(TRIM(pl.customer_phone), '') IS NULL THEN 0
  ELSE COALESCE(array_length(string_to_array(TRIM(pl.customer_phone), ','), 1), 0) END`;

export type LeadResultsSummary = {
  leads_total: number;
  leads_today: number;
  leads_7d: number;
  posts_with_leads: number;
  posts_total: number;
  top_position: string | null;
  top_position_leads: number;
};

/** สรุปภาพรวมผลลัพธ์ leads (การ์ดบนสุดของหน้าผลลัพธ์). guarded — null ถ้า schema ไม่พร้อม. */
export async function leadResultsSummary(): Promise<LeadResultsSummary | null> {
  try {
    const [s] = await q<Omit<LeadResultsSummary, 'top_position' | 'top_position_leads'>>(
      `SELECT
         COALESCE(sum(${LEAD_COUNT_SQL}), 0)::int AS leads_total,
         COALESCE(sum(${LEAD_COUNT_SQL}) FILTER (
           WHERE (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date = (now() AT TIME ZONE 'Asia/Bangkok')::date
         ), 0)::int AS leads_today,
         COALESCE(sum(${LEAD_COUNT_SQL}) FILTER (WHERE pl.created_at >= now() - interval '7 days'), 0)::int AS leads_7d,
         count(*) FILTER (WHERE ${LEAD_COUNT_SQL} > 0)::int AS posts_with_leads,
         count(*)::int AS posts_total
       FROM ${AP}.post_logs pl`,
    );
    if (!s) return null;
    const [tp] = await q<{ position: string; leads: number }>(
      `SELECT COALESCE(NULLIF(TRIM(pl.job_title), ''), 'ไม่ระบุตำแหน่ง') AS position,
              COALESCE(sum(${LEAD_COUNT_SQL}), 0)::int AS leads
         FROM ${AP}.post_logs pl
        GROUP BY 1 ORDER BY leads DESC NULLS LAST LIMIT 1`,
    );
    return {
      ...s,
      top_position: tp && tp.leads > 0 ? tp.position : null,
      top_position_leads: tp?.leads ?? 0,
    };
  } catch {
    return null;
  }
}

export type LeadByPosition = { position: string; leads: number; posts: number; comments: number };

/** leads แยกตามตำแหน่งงาน — บอกว่าประกาศตำแหน่งไหนดึงคนได้จริง. */
export async function leadsByPosition(limit = 12): Promise<LeadByPosition[]> {
  try {
    return await q<LeadByPosition>(
      `SELECT COALESCE(NULLIF(TRIM(pl.job_title), ''), 'ไม่ระบุตำแหน่ง') AS position,
              COALESCE(sum(${LEAD_COUNT_SQL}), 0)::int AS leads,
              count(*)::int AS posts,
              COALESCE(sum(COALESCE(pl.comment_count, 0)), 0)::int AS comments
         FROM ${AP}.post_logs pl
        GROUP BY 1
       HAVING COALESCE(sum(${LEAD_COUNT_SQL}), 0) > 0
        ORDER BY leads DESC, posts DESC
        LIMIT $1`,
      [limit],
    );
  } catch {
    return [];
  }
}

export type LeadPostRow = {
  id: string;
  job_title: string | null;
  group_name: string | null;
  account: string | null;
  post_link: string | null;
  post_status: string | null;
  comment_count: number;
  reactions: number;
  shares: number;
  lead_count: number;
  phones: string | null; // customer_phone ดิบ (คั่น ', ') — แยกเป็นชิปในหน้าจอ
  created_at: string;
};

/** โพสต์ที่เก็บ lead ได้ เรียงเบอร์มากสุดก่อน — เบอร์พร้อมทักกลับ (ฐานของ Lead Responder). guarded. */
export async function topLeadPosts(opts: { limit?: number; days?: number } = {}): Promise<LeadPostRow[]> {
  const { limit = 60, days } = opts;
  try {
    // reactions/shares เป็น runtime migration ของ autopost — ensure ก่อนกัน query ล้มทั้งก้อน
    await q(`ALTER TABLE ${AP}.post_logs ADD COLUMN IF NOT EXISTS reactions INT DEFAULT 0`);
    await q(`ALTER TABLE ${AP}.post_logs ADD COLUMN IF NOT EXISTS shares INT DEFAULT 0`);
    const params: unknown[] = [];
    let filter = `WHERE ${LEAD_COUNT_SQL} > 0`;
    if (days && days > 0) {
      params.push(days);
      filter += ` AND pl.created_at >= now() - ($${params.length}::text || ' days')::interval`;
    }
    params.push(limit);
    return await q<LeadPostRow>(
      `SELECT pl.id,
              NULLIF(TRIM(pl.job_title), '') AS job_title,
              NULLIF(TRIM(pl.group_name), '') AS group_name,
              COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(pl.poster_name), '')) AS account,
              pl.post_link,
              pl.post_status,
              COALESCE(pl.comment_count, 0) AS comment_count,
              COALESCE(pl.reactions, 0) AS reactions,
              COALESCE(pl.shares, 0) AS shares,
              ${LEAD_COUNT_SQL} AS lead_count,
              pl.customer_phone AS phones,
              pl.created_at
         FROM ${AP}.post_logs pl
         LEFT JOIN ${AP}.users u ON u.id = pl.user_id
        ${filter}
        ORDER BY lead_count DESC, pl.created_at DESC
        LIMIT $${params.length}`,
      params,
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Weekly Report — สรุปผลรายสัปดาห์ส่งหัวหน้า (โพสต์ · lead · ผู้สมัคร · แคมเปญ)
// หน้าต่าง = 7 วันย้อนหลัง (เลื่อน offset สัปดาห์ได้) เทียบกับ 7 วันก่อนหน้า (WoW)
// crosses schemas: post_logs (AP) + candidate_sources/campaign_posts (candidate schema)
// ---------------------------------------------------------------------------
export type ReportMetric = { value: number; prev: number };
export type WeeklyReport = {
  from: string;
  to: string;
  offset: number;
  posts: ReportMetric;
  leads: ReportMetric;
  candidates: ReportMetric;
  campaigns: ReportMetric;
  byPosition: { position: string; leads: number; posts: number }[];
  byDay: { day: string; posts: number; leads: number }[];
  topPosts: LeadPostRow[];
};

export async function weeklyReport(offset = 0): Promise<WeeklyReport | null> {
  const off = Math.max(0, Math.min(52, Math.floor(offset || 0)));
  const DAY = 86_400_000;
  const wEnd = new Date(Date.now() - off * 7 * DAY);
  const wStart = new Date(wEnd.getTime() - 7 * DAY);
  const pStart = new Date(wStart.getTime() - 7 * DAY);
  const [P, W, E] = [pStart.toISOString(), wStart.toISOString(), wEnd.toISOString()];

  // โพสต์ + lead (cur/prev) — ตัวหลัก; ถ้าอ่านไม่ได้ถือว่าไม่มีข้อมูลรายงาน
  let posts: ReportMetric;
  let leads: ReportMetric;
  try {
    await q(`ALTER TABLE ${AP}.post_logs ADD COLUMN IF NOT EXISTS reactions INT DEFAULT 0`);
    await q(`ALTER TABLE ${AP}.post_logs ADD COLUMN IF NOT EXISTS shares INT DEFAULT 0`);
    const [row] = await q<{ posts: number; posts_prev: number; leads: number; leads_prev: number }>(
      `SELECT
         count(*) FILTER (WHERE pl.created_at >= $2 AND pl.created_at < $3)::int AS posts,
         count(*) FILTER (WHERE pl.created_at >= $1 AND pl.created_at < $2)::int AS posts_prev,
         COALESCE(sum(${LEAD_COUNT_SQL}) FILTER (WHERE pl.created_at >= $2 AND pl.created_at < $3), 0)::int AS leads,
         COALESCE(sum(${LEAD_COUNT_SQL}) FILTER (WHERE pl.created_at >= $1 AND pl.created_at < $2), 0)::int AS leads_prev
       FROM ${AP}.post_logs pl
      WHERE pl.created_at >= $1 AND pl.created_at < $3`,
      [P, W, E],
    );
    if (!row) return null;
    posts = { value: row.posts, prev: row.posts_prev };
    leads = { value: row.leads, prev: row.leads_prev };
  } catch {
    return null;
  }

  // ผู้สมัครที่ดึงได้ใหม่ (candidate_sources.first_seen_at) — guarded
  let candidates: ReportMetric = { value: 0, prev: 0 };
  try {
    const [c] = await q<{ cur: number; prev: number }>(
      `SELECT count(*) FILTER (WHERE first_seen_at >= $2 AND first_seen_at < $3)::int AS cur,
              count(*) FILTER (WHERE first_seen_at >= $1 AND first_seen_at < $2)::int AS prev
         FROM candidate_sources
        WHERE first_seen_at >= $1 AND first_seen_at < $3`,
      [P, W, E],
    );
    if (c) candidates = { value: c.cur, prev: c.prev };
  } catch {
    /* schema/สิทธิ์ไม่พร้อม — คง 0 */
  }

  // แคมเปญคอนเทนต์ที่ส่งโพสต์ (distinct campaign จาก campaign_posts) — guarded
  let campaigns: ReportMetric = { value: 0, prev: 0 };
  try {
    const [c] = await q<{ cur: number; prev: number }>(
      `SELECT count(DISTINCT campaign_id) FILTER (WHERE created_at >= $2 AND created_at < $3)::int AS cur,
              count(DISTINCT campaign_id) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS prev
         FROM campaign_posts
        WHERE created_at >= $1 AND created_at < $3`,
      [P, W, E],
    );
    if (c) campaigns = { value: c.cur, prev: c.prev };
  } catch {
    /* คง 0 */
  }

  // lead ตามตำแหน่ง + รายวัน + โพสต์เด่น (เฉพาะหน้าต่างสัปดาห์นี้)
  let byPosition: WeeklyReport['byPosition'] = [];
  let byDay: WeeklyReport['byDay'] = [];
  let topPosts: LeadPostRow[] = [];
  try {
    byPosition = await q<{ position: string; leads: number; posts: number }>(
      `SELECT COALESCE(NULLIF(TRIM(pl.job_title), ''), 'ไม่ระบุตำแหน่ง') AS position,
              COALESCE(sum(${LEAD_COUNT_SQL}), 0)::int AS leads,
              count(*)::int AS posts
         FROM ${AP}.post_logs pl
        WHERE pl.created_at >= $1 AND pl.created_at < $2
        GROUP BY 1 HAVING count(*) > 0
        ORDER BY leads DESC, posts DESC LIMIT 10`,
      [W, E],
    );
    byDay = await q<{ day: string; posts: number; leads: number }>(
      `SELECT to_char((pl.created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS day,
              count(*)::int AS posts,
              COALESCE(sum(${LEAD_COUNT_SQL}), 0)::int AS leads
         FROM ${AP}.post_logs pl
        WHERE pl.created_at >= $1 AND pl.created_at < $2
        GROUP BY 1 ORDER BY 1`,
      [W, E],
    );
    topPosts = await q<LeadPostRow>(
      `SELECT pl.id,
              NULLIF(TRIM(pl.job_title), '') AS job_title,
              NULLIF(TRIM(pl.group_name), '') AS group_name,
              COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(pl.poster_name), '')) AS account,
              pl.post_link, pl.post_status,
              COALESCE(pl.comment_count, 0) AS comment_count,
              COALESCE(pl.reactions, 0) AS reactions,
              COALESCE(pl.shares, 0) AS shares,
              ${LEAD_COUNT_SQL} AS lead_count,
              pl.customer_phone AS phones,
              pl.created_at
         FROM ${AP}.post_logs pl
         LEFT JOIN ${AP}.users u ON u.id = pl.user_id
        WHERE ${LEAD_COUNT_SQL} > 0 AND pl.created_at >= $1 AND pl.created_at < $2
        ORDER BY lead_count DESC, pl.created_at DESC LIMIT 8`,
      [W, E],
    );
  } catch {
    /* คง [] */
  }

  return { from: W, to: E, offset: off, posts, leads, candidates, campaigns, byPosition, byDay, topPosts };
}

// ---------------------------------------------------------------------------
// เทรนด์ที่กำลังมา (content_trends, schema-016) — คนกรอกเทรนด์/มีมให้คอนเทนต์เกาะกระแส
// worker (orchestrator-draft) ดึงตัว active ไปใส่ตอนคิดแคปชัน/รูป
// ---------------------------------------------------------------------------
export type ContentTrend = {
  id: string;
  label: string;
  note: string | null;
  for_caption: boolean;
  for_image: boolean;
  active: boolean;
  source: 'manual' | 'discovered';
  created_at: string;
};

/** เทรนด์ทั้งหมด (จัดการบนหน้า Settings) — ระบบเสนอ (discovered) ที่ยังไม่อนุมัติขึ้นก่อน. guarded. */
export async function listContentTrends(): Promise<ContentTrend[]> {
  try {
    return await q<ContentTrend>(
      `SELECT id, label, note, for_caption, for_image, active,
              COALESCE(source, 'manual') AS source, created_at
         FROM content_trends
        ORDER BY (source = 'discovered' AND active = false) DESC, active DESC, updated_at DESC`,
    );
  } catch {
    // schema-016 ยังไม่ migrate (ไม่มีตาราง) หรือ schema-017 ยังไม่มา (ไม่มี source)
    try {
      const rows = await q<Omit<ContentTrend, 'source'>>(
        `SELECT id, label, note, for_caption, for_image, active, created_at
           FROM content_trends ORDER BY active DESC, updated_at DESC`,
      );
      return rows.map((r) => ({ ...r, source: 'manual' as const }));
    } catch {
      return [];
    }
  }
}

export async function createContentTrend(input: {
  label: string;
  note?: string | null;
  forCaption?: boolean;
  forImage?: boolean;
}): Promise<void> {
  await q(
    `INSERT INTO content_trends (label, note, for_caption, for_image)
     VALUES ($1, $2, $3, $4)`,
    [input.label.trim(), input.note?.trim() || null, input.forCaption ?? true, input.forImage ?? true],
  );
}

export async function setContentTrendActive(id: string, active: boolean): Promise<void> {
  await q(`UPDATE content_trends SET active = $2, updated_at = now() WHERE id = $1`, [id, active]);
}

export async function deleteContentTrend(id: string): Promise<void> {
  await q(`DELETE FROM content_trends WHERE id = $1`, [id]);
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
  source_request_no: string | null;
  review_status: 'not_required' | 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  qualified_count: number;
  needs_review_count: number;
  rejected_count: number;
  assessed_total: number;
  /** Latest real candidate result or queue start. Worker heartbeats do not advance this. */
  last_progress_at: string | null;
};

export async function listTasks() {
  return q<TaskRow>(
    `SELECT t.*, c.label AS connector_label, c.platform,
            COALESCE(s.qualified_count,0)::int AS qualified_count,
            COALESCE(s.needs_review_count,0)::int AS needs_review_count,
            COALESCE(s.rejected_count,0)::int AS rejected_count,
            COALESCE(s.assessed_total,0)::int AS assessed_total,
            GREATEST(s.last_result_at, w.started_at) AS last_progress_at
       FROM scrape_tasks t JOIN connectors c ON c.id = t.connector_id
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE qualification_status='qualified') AS qualified_count,
                count(*) FILTER (WHERE qualification_status='needs_review') AS needs_review_count,
                count(*) FILTER (WHERE qualification_status='rejected') AS rejected_count,
                count(*) AS assessed_total,
                max(last_matched_at) AS last_result_at
           FROM scrape_task_candidates tc WHERE tc.task_id=t.id
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT max(COALESCE(started_at, created_at)) AS started_at
           FROM work_queue q
          WHERE q.ref_id=t.id::text AND q.type='scrape' AND q.status IN ('queued','running')
       ) w ON true
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
  const readyWorkers = (await listWorkerHeartbeats()).filter((worker) => {
    if (!worker.online || worker.kind !== 'scraper') return false;
    const types = Array.isArray(worker.meta?.types) ? worker.meta.types.map(String) : [];
    // A resume scrape must not depend on the content/image-generation setup.
    // Temporary or dedicated scraper machines commonly have no OpenAI image key,
    // but are still fully capable of running the evidence-v1 sourcing pipeline.
    return types.includes('scrape')
      && String(worker.meta?.content_pipeline || '') === REQUIRED_CONTENT_PIPELINE;
  });
  if (readyWorkers.length === 0) {
    await q(
      `UPDATE scrape_tasks
          SET status='idle', phase='idle', last_error=$2, updated_at=now()
        WHERE id=$1 AND status <> 'running'`,
      [taskId, 'ยังไม่เริ่มค้นหา: ยังไม่มีเครื่องค้นหาผู้สมัครที่พร้อมรับงาน กรุณาเปิด Worker แล้วลองอีกครั้ง'],
    );
    return false;
  }
  // Pin to a capability-verified machine. Old processes can remain online but
  // cannot claim new work after this point.
  const preferredWorker = readyWorkers[0].name;
  await q(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user, preferred_worker)
     SELECT 'scrape', 'scraper', $1, $2, $3::jsonb, $4, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w WHERE w.ref_id = $2 AND w.status IN ('queued','running'))`,
    [`${platform}:${connector_id}`, taskId, JSON.stringify(criteria ?? {}), ownerUser, preferredWorker],
  );
  return true;
}

/**
 * แก้เกณฑ์การค้นของ task หลังสร้าง (ก่อนรัน/หลังจบ — ห้ามแก้ตอนกำลังวิ่ง)
 * ฟอร์ม prefill ค่าเดิม: ช่องที่ลบว่าง = เอาเกณฑ์นั้นออก
 */
export async function updateScrapeTaskCriteria(
  id: string,
  patch: { position?: string; keyword?: string; province?: string; targetCount?: number | null },
) {
  const rows = await q<{ criteria: Record<string, unknown>; status: string }>(
    `SELECT criteria, status FROM scrape_tasks WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new Error(`task not found: ${id}`);
  if (rows[0].status === 'running') throw new Error('งานกำลังวิ่งอยู่ — รอจบก่อนแล้วค่อยแก้');
  const criteria = { ...(rows[0].criteria ?? {}) };
  const setOrDelete = (k: string, v?: string) => {
    const s = String(v ?? '').trim();
    if (s) criteria[k] = s;
    else delete criteria[k];
  };
  setOrDelete('position', patch.position);
  setOrDelete('keyword', patch.keyword);
  setOrDelete('province', patch.province);
  await q(
    `UPDATE scrape_tasks
        SET criteria = $2::jsonb, target_count = COALESCE($3, target_count), updated_at = now()
      WHERE id = $1 AND status <> 'running'`,
    [id, JSON.stringify(criteria), patch.targetCount ?? null],
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
  return q<{ id: string; status: string; phase: string; progress_got: number; progress_target: number; last_error: string | null; last_run_at: string | null; updated_at: string; qualified_count: number; needs_review_count: number; rejected_count: number; assessed_total: number; last_progress_at: string | null }>(
    `SELECT t.id, t.status, t.phase, t.progress_got, t.progress_target, t.last_error, t.last_run_at, t.updated_at,
            count(tc.candidate_id) FILTER (WHERE tc.qualification_status='qualified')::int AS qualified_count,
            count(tc.candidate_id) FILTER (WHERE tc.qualification_status='needs_review')::int AS needs_review_count,
            count(tc.candidate_id) FILTER (WHERE tc.qualification_status='rejected')::int AS rejected_count,
            count(tc.candidate_id)::int AS assessed_total,
            GREATEST(
              max(tc.last_matched_at),
              (SELECT max(COALESCE(w.started_at, w.created_at))
                 FROM work_queue w
                WHERE w.ref_id=t.id::text AND w.type='scrape' AND w.status IN ('queued','running'))
            ) AS last_progress_at
       FROM scrape_tasks t LEFT JOIN scrape_task_candidates tc ON tc.task_id=t.id
      GROUP BY t.id`,
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

// --- Intake จาก So Recruit: "คำขอโพสหางานใหม่" (หน้า matching กดส่งมา) ---
// อ่าน jarvis_rm.job_posting_requests (Postgres เดียวกัน คนละ schema) เฉพาะ pending
// ที่ยังไม่ได้เริ่ม campaign; LEFT JOIN erp_open_requests เผื่อ staging มีรายละเอียดใบขอเต็ม
// (ตำแหน่ง/จังหวัด/จำนวน — จะมีเมื่อ MSSQL creds มาแล้ว erp:sync วิ่ง). guarded — [] ถ้าเข้าไม่ได้.
export type PostingRequest = {
  id: string;
  request_no: string;
  request_type: 'content' | 'scraping';
  job_id: string | null;
  reason: string | null;
  notes: string | null;
  requested_by_name: string | null;
  created_at: string;
  erp_title: string | null;
  erp_province: string | null;
  erp_qty: number | null;
  erp_remaining: number | null;
  /** ข้อมูลใบขอที่ So Recruit แนบมา (migration 055 ฝั่ง jarvis) — ใช้ทำ checklist + โปสเตอร์ */
  job_snapshot: Record<string, unknown> | null;
};

export async function listSoRecruitPostingRequests(): Promise<PostingRequest[]> {
  try {
    return await q<PostingRequest>(
      `SELECT r.id, r.request_no, r.job_id, r.reason, r.notes, r.requested_by_name, r.created_at,
              COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') AS request_type,
              (to_jsonb(r)->'job_snapshot') AS job_snapshot,
              COALESCE(NULLIF(to_jsonb(r)->'job_snapshot'->>'position', ''),
                       e.title, NULLIF(to_jsonb(j)->>'job_description_code_1', ''),
                       NULLIF(to_jsonb(j)->>'staff_title_name', ''), j.job_type, j.unit_name) AS erp_title,
              COALESCE(NULLIF(to_jsonb(r)->'job_snapshot'->>'location', ''),
                       e.province, j.location_address) AS erp_province,
              COALESCE((to_jsonb(r)->'job_snapshot'->>'qty')::int, e.qty) AS erp_qty,
              e.remaining_qty AS erp_remaining
         FROM "jarvis_rm".job_posting_requests r
         LEFT JOIN "jarvis_rm".jobs j ON j.id::text = r.job_id
         LEFT JOIN recruit_campaigns c ON c.request_no = r.request_no
         LEFT JOIN scrape_tasks st ON st.source_request_no = r.request_no
         LEFT JOIN erp_open_requests e ON e.request_no = r.request_no
        WHERE r.status = 'pending' AND c.id IS NULL AND st.id IS NULL
        ORDER BY r.created_at DESC`,
    );
  } catch {
    return []; // สคีมา/สิทธิ์ไม่พร้อม — หน้า imports โชว์ empty state
  }
}

/** ค่าที่คนแก้ก่อนรับงาน (จากฟอร์มบนการ์ด intake) — ทับข้อมูลใบขอเฉพาะช่องที่กรอก */
export type IntakeOverrides = Partial<Record<
  'position' | 'location' | 'income' | 'qty' | 'work_schedule' | 'gender' | 'age_min' | 'age_max' | 'unit_name' | 'note',
  string
>>;

/** ตัดช่องว่างออกจาก overrides — เหลือเฉพาะช่องที่คนกรอกจริง */
function cleanOverrides(ov?: IntakeOverrides): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ov ?? {})) {
    const s = String(v ?? '').trim();
    if (s) out[k] = s;
  }
  return out;
}

/** สร้าง Scraping task จากคำขอ So Recruit แบบ idempotent แล้วส่ง id กลับให้ action enqueue. */
export async function createScrapeTaskFromSoRecruit(
  requestNo: string,
  connectorId: string,
  overrides?: { position?: string; province?: string; target?: number },
): Promise<string> {
  const existing = await q<{ id: string }>(
    `SELECT id FROM scrape_tasks WHERE source_request_no = $1 LIMIT 1`,
    [requestNo],
  );
  if (existing[0]) return existing[0].id;

  const req = await q<{
    request_type: string;
    reason: string | null;
    erp_title: string | null;
    erp_province: string | null;
    erp_qty: number | null;
    erp_remaining: number | null;
  }>(
    `SELECT COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') AS request_type,
            r.reason,
            COALESCE(e.title, NULLIF(to_jsonb(j)->>'job_description_code_1', ''),
                     NULLIF(to_jsonb(j)->>'staff_title_name', ''), j.job_type, j.unit_name) AS erp_title,
            COALESCE(e.province, j.location_address) AS erp_province,
            e.qty AS erp_qty, e.remaining_qty AS erp_remaining
       FROM "jarvis_rm".job_posting_requests r
       LEFT JOIN "jarvis_rm".jobs j ON j.id::text = r.job_id
       LEFT JOIN erp_open_requests e ON e.request_no = r.request_no
      WHERE r.request_no = $1 AND r.status = 'pending'
      LIMIT 1`,
    [requestNo],
  );
  if (!req[0]) throw new Error(`ไม่พบคำขอ Scraping ที่รอดำเนินการ: ${requestNo}`);
  if (req[0].request_type !== 'scraping') throw new Error(`คำขอ ${requestNo} ไม่ใช่ประเภท Scraping`);

  const connector = await q<{ platform: string }>(
    `SELECT platform FROM connectors WHERE id = $1 AND enabled = true`,
    [connectorId],
  );
  if (!connector[0]) throw new Error('Connector ไม่พร้อมใช้งาน');

  // คนแก้บนการ์ดก่อนกด = ใช้ค่าที่แก้; ไม่แก้ = ใช้ตามใบขอ
  const position = (overrides?.position ?? '').trim() || req[0].erp_title || '';
  const province = (overrides?.province ?? '').trim() || req[0].erp_province || '';
  const criteria: Record<string, string> = {};
  if (position) criteria.position = position;
  if (province) criteria.province = province;
  const target = Math.max(1, overrides?.target || req[0].erp_remaining || req[0].erp_qty || 20);

  const inserted = await q<{ id: string }>(
    `INSERT INTO scrape_tasks
       (name, connector_id, mode, target_count, criteria, status, enabled,
        expand_adjacent, source_request_no, review_status)
     VALUES ($1,$2,'count',$3,$4::jsonb,'queued',true,true,$5,'pending')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [`${requestNo} · ${position || 'Scraping งาน'}`, connectorId, target, JSON.stringify(criteria), requestNo],
  );
  let taskId = inserted[0]?.id;
  if (!taskId) {
    const raced = await q<{ id: string }>(`SELECT id FROM scrape_tasks WHERE source_request_no = $1`, [requestNo]);
    taskId = raced[0]?.id;
  }
  if (!taskId) throw new Error(`สร้าง Scraping task ไม่สำเร็จ: ${requestNo}`);

  try {
    await q(
      `UPDATE "jarvis_rm".job_posting_requests
          SET status = 'in_progress', updated_at = now()
        WHERE request_no = $1 AND status = 'pending'`,
      [requestNo],
    );
  } catch (e) {
    console.warn(`[scraping] เขียนสถานะกลับ So Recruit ไม่สำเร็จ (${requestNo}): ${(e as Error).message}`);
  }
  return taskId;
}

/** ตรวจรับผล Scraping จากศูนย์งาน; ข้อมูลเดิมไม่ได้รับผลกระทบเพราะมี source_request_no เท่านั้น. */
export async function approveScrapeTaskResult(taskId: string, reviewedBy: string | null) {
  const rows = await q<{ source_request_no: string | null }>(
    `UPDATE scrape_tasks
        SET review_status = 'approved', reviewed_by = $2, reviewed_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'done' AND review_status = 'pending'
      RETURNING source_request_no`,
    [taskId, reviewedBy],
  );
  if (!rows[0]) throw new Error('งานยังไม่เสร็จหรือถูกตรวจรับไปแล้ว');
  if (rows[0].source_request_no) {
    try {
      await q(
        `UPDATE "jarvis_rm".job_posting_requests
            SET status = 'completed', updated_at = now()
          WHERE request_no = $1`,
        [rows[0].source_request_no],
      );
    } catch (e) {
      console.warn(`[scraping] ปิดคำขอ So Recruit ไม่สำเร็จ (${rows[0].source_request_no}): ${(e as Error).message}`);
    }
  }
}

/** เปลี่ยนสถานะคำขอ So Recruit แบบ guarded เพื่อให้ระบบต้นทางเห็นความคืบหน้า. */
export async function setSoRecruitRequestStatus(requestNo: string | null, status: 'in_progress' | 'posted' | 'completed') {
  if (!requestNo) return;
  try {
    await q(
      `UPDATE "jarvis_rm".job_posting_requests SET status = $2, updated_at = now() WHERE request_no = $1`,
      [requestNo, status],
    );
  } catch (e) {
    console.warn(`[orchestrator] เขียนสถานะกลับ So Recruit ไม่สำเร็จ (${requestNo}): ${(e as Error).message}`);
  }
}

/** ตีกลับใบขอไป So Recruit พร้อมเหตุผล (เขียนลง notes ให้ผู้ขอเห็นว่าขาดอะไร). */
export async function rejectSoRecruitRequest(requestNo: string | null, reason: string | null) {
  if (!requestNo) return;
  const note = reason ? `ตีกลับ: ${reason}` : 'ตีกลับ — ข้อมูลไม่พอ/ไม่รับงาน';
  try {
    await q(
      `UPDATE "jarvis_rm".job_posting_requests SET status = 'rejected', notes = $2, updated_at = now() WHERE request_no = $1`,
      [requestNo, note],
    );
  } catch (e) {
    console.warn(`[orchestrator] ตีกลับใบขอ So Recruit ไม่สำเร็จ (${requestNo}): ${(e as Error).message}`);
  }
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

export type ContentBrainSummary = {
  learning_events: number;
  campaigns_with_evidence: number;
  collecting_patterns: number;
  proven_patterns: number;
};

export async function getContentBrainSummary(): Promise<ContentBrainSummary> {
  try {
    const rows = await q<ContentBrainSummary>(
      `SELECT
         (SELECT count(*)::int FROM content_learning_events) AS learning_events,
         (SELECT count(DISTINCT campaign_id)::int FROM content_learning_events) AS campaigns_with_evidence,
         count(*) FILTER (WHERE confidence < 1)::int AS collecting_patterns,
         count(*) FILTER (WHERE confidence >= 1)::int AS proven_patterns
       FROM content_pattern_stats`,
    );
    return rows[0] ?? { learning_events: 0, campaigns_with_evidence: 0, collecting_patterns: 0, proven_patterns: 0 };
  } catch {
    return { learning_events: 0, campaigns_with_evidence: 0, collecting_patterns: 0, proven_patterns: 0 };
  }
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

/**
 * สร้าง campaign จากใบขอ (คนกดสั่งต่อใบ) + ผูกกันสร้างซ้ำ.
 * แหล่งใบขอ 2 ทาง (เรียงตามความครบของข้อมูล):
 *   1. erp_open_requests (staging จาก MSSQL) — มีตำแหน่ง/จังหวัด/จำนวนครบ → ผูก campaign_id กันสร้างซ้ำ
 *   2. jarvis_rm.job_posting_requests (So Recruit ส่งมาจากหน้า matching) — มีแค่เลขใบขอ+เหตุผล;
 *      สร้าง campaign snapshot={source:'so_recruit',...} title=request_no แล้ว **เขียนสถานะกลับ**
 *      เป็น in_progress ให้ทีม matching เห็นว่ารับเรื่องแล้ว (guarded — พังไม่ block campaign)
 */
export async function createCampaignFromRequest(
  requestNo: string,
  createdBy: string | null,
  overrides?: IntakeOverrides,
) {
  const ov = cleanOverrides(overrides);
  const st = await q<StagedRequest>(`SELECT * FROM erp_open_requests WHERE request_no = $1`, [requestNo]);

  let snapshot: unknown;
  let title: string | null;
  let province: string | null = null;
  let qty: number | null = null;
  let remaining: number | null = null;
  let fromErp = false;
  let fromSoRecruit = false;

  if (st[0]) {
    const s = st[0];
    fromErp = true;
    // คนแก้บนการ์ด = ทับข้อมูล staging เฉพาะช่องที่กรอก (ไม่แก้ = ตามใบขอเป๊ะ)
    snapshot = Object.keys(ov).length ? { ...(s.snapshot ?? {}), ...ov, user_edited: true } : (s.snapshot ?? {});
    title = ov.position || s.title;
    province = ov.location || s.province;
    qty = (ov.qty ? Number(ov.qty) : null) || s.qty;
    remaining = s.remaining_qty;
  } else {
    // ไม่มีใน ERP staging → ลองหยิบจากคำขอ So Recruit
    let pr: PostingRequest[] = [];
    try {
      pr = await q<PostingRequest>(
        `SELECT id, request_no, job_id, reason, notes, requested_by_name, created_at,
                COALESCE(NULLIF(to_jsonb(job_posting_requests)->>'request_type', ''), 'content') AS request_type,
                (to_jsonb(job_posting_requests)->'job_snapshot') AS job_snapshot,
                NULL::text AS erp_title, NULL::text AS erp_province, NULL::int AS erp_qty, NULL::int AS erp_remaining
           FROM "jarvis_rm".job_posting_requests WHERE request_no = $1`,
        [requestNo],
      );
    } catch {
      pr = [];
    }
    if (!pr[0]) throw new Error(`ไม่พบใบขอ ${requestNo} (ทั้ง ERP staging และ So Recruit)`);
    const p = pr[0];
    if (p.request_type !== 'content') throw new Error(`คำขอ ${requestNo} ไม่ใช่ประเภท Content`);
    fromSoRecruit = true;
    // ข้อมูลที่ So Recruit แนบมากับคำขอ (job_snapshot) — ตำแหน่ง/พื้นที่/รายได้ ฯลฯ
    // merge ค่าที่คนแก้บนการ์ดทับก่อน — title/detail/poster ทั้งสายใช้ค่าที่แก้แล้วอัตโนมัติ
    const js = { ...((p.job_snapshot ?? {}) as Record<string, unknown>), ...ov };
    const s = (k: string) => String(js[k] ?? '').trim();
    const position = s('position');
    title = position || p.request_no; // มีชื่อตำแหน่งจริง = ใช้เลย, ไม่มี = เลขใบขอ
    province = s('location') || null;
    qty = Number(js.qty) || null;
    // แปลงเป็นรูปที่ poster/caption ใช้ (campaignContext อ่าน request_name/work_addr/detail)
    const detail = [
      s('income') ? `รายได้รวม ${s('income')}` : '',
      s('work_schedule') ? `เวลางาน ${s('work_schedule')}` : '',
      s('gender') ? `เพศ ${s('gender')}` : '',
      js.age_min || js.age_max ? `อายุ ${js.age_min ?? ''}-${js.age_max ?? ''} ปี` : '',
      s('unit_name') ? `หน่วยงาน ${s('unit_name')}` : '',
      s('note'),
    ].filter(Boolean).join(' · ');
    snapshot = {
      source: 'so_recruit', job_id: p.job_id, reason: p.reason, requested_by_name: p.requested_by_name,
      ...js, request_name: position || undefined, work_addr: s('location') || undefined, detail: detail || undefined,
      ...(Object.keys(ov).length ? { user_edited: true } : {}),
    };
  }

  const ins = await q<{ id: string }>(
    `INSERT INTO recruit_campaigns (request_no, request_snapshot, title, province, qty, remaining_qty, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'new',$7)
     ON CONFLICT (request_no) DO NOTHING
     RETURNING id`,
    [requestNo, JSON.stringify(snapshot ?? {}), title, province, qty, remaining, createdBy],
  );
  let campaignId = ins[0]?.id;
  if (!campaignId) {
    const ex = await q<{ id: string }>(`SELECT id FROM recruit_campaigns WHERE request_no = $1`, [requestNo]);
    campaignId = ex[0]?.id;
  }
  if (campaignId && fromErp) {
    await q(`UPDATE erp_open_requests SET campaign_id = $2 WHERE request_no = $1`, [requestNo, campaignId]);
  }
  if (campaignId && fromSoRecruit) {
    // เขียนสถานะกลับให้ So Recruit (guarded — ถ้าเขียนไม่ได้ก็ไม่ทำให้ campaign ล้ม)
    try {
      await q(
        `UPDATE "jarvis_rm".job_posting_requests SET status = 'in_progress', updated_at = now() WHERE request_no = $1`,
        [requestNo],
      );
    } catch (e) {
      console.warn(`[orchestrator] เขียนสถานะกลับ So Recruit ไม่สำเร็จ (${requestNo}): ${(e as Error).message}`);
    }
  }
  return campaignId;
}

export async function setCampaignStatus(id: string, status: string, note: string | null = null) {
  await q(`UPDATE recruit_campaigns SET status = $2, status_note = $3, updated_at = now() WHERE id = $1`, [id, status, note]);
}

// ส่วนผสมที่ AI ใช้คิด content (โชว์บนหน้า campaign ให้คนเห็นว่าร่างมาจากอะไร)
// query เดียวกับ orchestrator-draft ฝั่ง worker — winning 2 + losing 2 ตามตำแหน่งใกล้เคียง
export type GenIngredients = { winning: string[]; losing: string[] };

export async function contentGenIngredients(title: string | null): Promise<GenIngredients> {
  const t = String(title ?? '').trim();
  let winning: string[] = [];
  let losing: string[] = [];
  try {
    winning = (await q<{ caption: string }>(
      `SELECT cc.caption
         FROM content_winning_patterns wp
         JOIN campaign_contents cc ON cc.id = wp.sample_content_id
        WHERE cc.caption IS NOT NULL AND TRIM(cc.caption) <> ''
        ORDER BY (wp.position_family IS NOT NULL AND $1 <> '' AND wp.position_family ILIKE '%' || $1 || '%') DESC,
                 wp.engagement_score DESC NULLS LAST
        LIMIT 2`,
      [t],
    )).map((r) => r.caption);
  } catch { /* ตารางยังไม่พร้อม */ }
  try {
    losing = (await q<{ caption: string }>(
      `SELECT cc.caption
         FROM content_losing_patterns lp
         JOIN campaign_contents cc ON cc.id = lp.sample_content_id
        WHERE cc.caption IS NOT NULL AND TRIM(cc.caption) <> ''
        ORDER BY (lp.position_family IS NOT NULL AND $1 <> '' AND lp.position_family ILIKE '%' || $1 || '%') DESC,
                 lp.engagement_score ASC NULLS LAST
        LIMIT 2`,
      [t],
    )).map((r) => r.caption);
  } catch { /* schema-014 ยังไม่ migrate — ไม่มี losing */ }
  return { winning, losing };
}

export type PosterFields = {
  title: string;
  badge: string;
  location: string;
  worktime: string;
  salaryTotal: string;
  salaryBreakdown: string;
  quantity: string;
  qualifications: string[];
  benefits: string[];
  contactLine: string;
  imageSide: 'left' | 'right';
};

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
  has_source_image: boolean;
  image_generation_ok: boolean;
  quality_status: 'pending' | 'pass' | 'warning' | 'fail';
  quality_score: number | null;
  quality_checks: ContentQualityResult | null;
  quality_checked_at: string | null;
  poster_fields: PosterFields | null;
  /** provenance ว่าร่างนี้ AI คิดจากอะไร (schema-015) — {angles,hooks,imageStyle,style,used_winning,used_losing} */
  gen_notes: {
    generation_mode?: 'preview' | 'production';
    angles?: string[];
    hooks?: string[];
    imageStyle?: string;
    trends?: string[];
    research_keywords?: string[];
    style?: string | null;
    used_winning?: number;
    used_feedback?: number;
    used_losing?: number;
    research_model?: string;
    research_gate?: { ready?: boolean; issues?: string[]; googleEvidence?: number; facebookEvidence?: number };
    image_generation?: { ok?: boolean; provider?: string | null; model?: string | null; prompt?: string | null };
  } | null;
};

/** ร่างคอนเทนต์ทุก version ของ campaign (ใหม่สุดก่อน). image bytes ไม่ดึงมา (สตรีมแยก). */
export async function listCampaignContents(campaignId: string) {
  try {
    const [rows, campaign] = await Promise.all([
      q<ContentRow>(
      `SELECT id, campaign_id, version, platform, caption, video_brief, gen_model, status,
              engagement_score, reject_reason, created_at, (image_bytes IS NOT NULL) AS has_image,
              (source_image_bytes IS NOT NULL) AS has_source_image, poster_fields,
              COALESCE((gen_notes->'image_generation'->>'ok')::boolean,false) AS image_generation_ok, gen_notes,
              quality_status, quality_score, quality_checks, quality_checked_at
         FROM campaign_contents WHERE campaign_id = $1 ORDER BY version DESC`,
      [campaignId],
      ),
      getCampaign(campaignId),
    ]);
    // ตรวจทุก version ด้วยกฎปัจจุบันทุกครั้ง ไม่เชื่อคะแนนเก่าที่อาจสร้างก่อนเพิ่ม
    // factual gate รุ่นใหม่ มิฉะนั้นร่างเก่าที่แต่งสวัสดิการ/LINE อาจยังโชว์ 100/100.
    return rows.map((row) => {
      if (!campaign) return row;
      const quality = evaluateContentQuality({
        campaign,
        caption: row.caption,
        posterFields: row.poster_fields ?? row.quality_checks?.posterFields ?? null,
        imageReady: row.has_image && row.image_generation_ok,
        researchGate: row.gen_notes?.research_gate ?? { ready: false, issues: ['ร่างนี้ไม่มีหลักฐานสำรวจตลาดก่อนสร้าง'] },
      });
      return { ...row, quality_status: quality.status, quality_score: quality.score, quality_checks: quality };
    });
  } catch {
    // schema-015 (gen_notes) ยังไม่ migrate — query แบบไม่มีคอลัมน์นั้น
    const rows = await q<Omit<ContentRow, 'gen_notes' | 'image_generation_ok' | 'quality_status' | 'quality_score' | 'quality_checks' | 'quality_checked_at' | 'has_source_image' | 'poster_fields'>>(
      `SELECT id, campaign_id, version, platform, caption, video_brief, gen_model, status,
              engagement_score, reject_reason, created_at, (image_bytes IS NOT NULL) AS has_image
         FROM campaign_contents WHERE campaign_id = $1 ORDER BY version DESC`,
      [campaignId],
    );
    return rows.map((r) => ({
      ...r,
      gen_notes: null,
      has_source_image: false,
      poster_fields: null,
      image_generation_ok: false,
      quality_status: 'pending' as const,
      quality_score: null,
      quality_checks: null,
      quality_checked_at: null,
    }));
  }
}

export async function setContentStatus(id: string, status: string, reason: string | null = null) {
  await q(`UPDATE campaign_contents SET status = $2, reject_reason = $3 WHERE id = $1`, [id, status, reason]);
}

const FEEDBACK_CODES = new Set([
  'ready', 'strong_hook', 'complete_info', 'good_visual',
  'incorrect_info', 'weak_hook', 'too_long', 'missing_details',
  'wrong_tone', 'poor_visual', 'other',
]);

/** เก็บคำตัดสินของคนเป็นข้อมูลฝึกงานถัดไป โดยแยกจากผลตอบรับหลังโพสต์จริง. */
export async function recordContentFeedback(opts: {
  campaignId: string;
  contentId: string;
  decision: 'approved' | 'rejected';
  reasonCodes: string[];
  note: string | null;
  reviewer: string | null;
}) {
  const reasonCodes = [...new Set(opts.reasonCodes.filter((code) => FEEDBACK_CODES.has(code)))];
  await q(
    `INSERT INTO content_feedback
       (campaign_id, content_id, decision, reason_codes, note, reviewer)
     VALUES ($1, $2, $3, $4::text[], $5, $6)
     ON CONFLICT (content_id, decision) DO UPDATE SET
       reason_codes=EXCLUDED.reason_codes, note=EXCLUDED.note,
       reviewer=EXCLUDED.reviewer, created_at=now()`,
    [opts.campaignId, opts.contentId, opts.decision, reasonCodes, opts.note, opts.reviewer],
  );

  // สิ่งที่คนปฏิเสธต้องถูกเตือนใน prompt งานถัดไปทันที แต่ไม่ปนกับผลลัพธ์หลังโพสต์จริง.
  if (opts.decision === 'rejected') {
    const reason = [reasonCodes.join(', '), opts.note].filter(Boolean).join(' · ') || 'ผู้ตรวจไม่อนุมัติ';
    await q(
      `INSERT INTO content_losing_patterns
         (position_family, platform, sample_content_id, campaign_id, reason, source)
       SELECT rc.title, cc.platform, cc.id, rc.id, $3, 'human_feedback'
         FROM campaign_contents cc
         JOIN recruit_campaigns rc ON rc.id=cc.campaign_id
        WHERE cc.id=$1 AND rc.id=$2
       ON CONFLICT (sample_content_id) WHERE sample_content_id IS NOT NULL DO UPDATE SET
         reason=EXCLUDED.reason, source='human_feedback'`,
      [opts.contentId, opts.campaignId, reason],
    );
  }
}

/** แก้ caption ของร่างคอนเทนต์ (คนปรับข้อความก่อนอนุมัติ). แก้ได้เฉพาะที่ยังเป็น draft. */
export async function updateContentCaption(id: string, caption: string) {
  await q(`UPDATE campaign_contents SET caption = $2 WHERE id = $1 AND status = 'draft'`, [id, caption]);
}

/** เบอร์ที่ผู้ตรวจกรอกถือเป็นข้อมูลยืนยันล่าสุดของงาน และถูกเก็บกลับเข้า source snapshot. */
export async function confirmCampaignContactPhone(campaignId: string, value: string) {
  const phone = String(value ?? '').trim();
  const digits = phone.replace(/[^\d]/g, '');
  if (!/^0\d{8,9}$/.test(digits)) throw new Error('กรุณากรอกเบอร์โทรไทย 9–10 หลัก เช่น 02-123-4567 หรือ 081-234-5678');
  await q(
    `UPDATE recruit_campaigns
        SET request_snapshot=jsonb_set(COALESCE(request_snapshot,'{}'::jsonb), '{contact_phone}', to_jsonb($2::text), true),
            updated_at=now()
      WHERE id=$1`,
    [campaignId, phone],
  );
  return phone;
}

/** เติม/แทนบรรทัดเบอร์ใน Caption เดิม โดยเก็บข้อความสร้างสรรค์ส่วนอื่นไว้. */
export async function syncContentContactPhone(contentId: string, phone: string) {
  const rows = await q<{ caption: string | null }>(`SELECT caption FROM campaign_contents WHERE id=$1 AND status='draft'`, [contentId]);
  if (!rows[0]) throw new Error('ไม่พบร่างที่แก้ไขได้');
  const lines = String(rows[0].caption || '').split(/\r?\n/).filter((line) => !/^\s*📞\s*ติดต่อ\s*:/i.test(line));
  let index = lines.findIndex((line) => /^\s*#/.test(line));
  if (index < 0) index = lines.length;
  if (index > 0 && lines[index - 1]?.trim()) lines.splice(index, 0, '');
  lines.splice(index, 0, `📞 ติดต่อ: ${phone}`);
  await updateContentCaption(contentId, lines.join('\n').trim());
}

const cleanPosterText = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** แก้ structured text แล้วประกอบ PNG ใหม่จากภาพต้นฉบับเดิม โดยตรวจ ERP ซ้ำทุกครั้ง. */
export async function updateContentPoster(id: string, input: Partial<PosterFields>, editor: string | null = null) {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query<{
      status: string;
      caption: string | null;
      source_image_bytes: Buffer | null;
      source_image_mime: string | null;
      campaign: CampaignRow;
      gen_notes: Record<string, any> | null;
    }>(
      `SELECT cc.status, cc.caption, cc.source_image_bytes, cc.source_image_mime, cc.gen_notes,
              to_jsonb(c.*) AS campaign
         FROM campaign_contents cc
         JOIN recruit_campaigns c ON c.id=cc.campaign_id
        WHERE cc.id=$1 FOR UPDATE OF cc`,
      [id],
    );
    const row = selected.rows[0];
    if (!row) throw new Error('ไม่พบร่างประกาศนี้');
    if (row.status !== 'draft') throw new Error('แก้รูปได้เฉพาะร่างที่ยังไม่อนุมัติ');
    if (!row.source_image_bytes || !row.source_image_mime) {
      throw new Error('ร่างเก่านี้ไม่มีภาพต้นฉบับ กรุณาสั่งสร้างรูปใหม่หนึ่งครั้งก่อนแก้ข้อความบนรูป');
    }

    const fields: PosterFields = {
      title: cleanPosterText(input.title, 80),
      badge: cleanPosterText(input.badge || 'เปิดรับสมัครด่วน', 40),
      location: cleanPosterText(input.location, 140),
      worktime: cleanPosterText(input.worktime, 140),
      salaryTotal: cleanPosterText(input.salaryTotal, 40),
      salaryBreakdown: cleanPosterText(input.salaryBreakdown, 160),
      quantity: cleanPosterText(input.quantity, 40),
      qualifications: (input.qualifications ?? []).map((value) => cleanPosterText(value, 90)).filter(Boolean).slice(0, 6),
      benefits: (input.benefits ?? []).map((value) => cleanPosterText(value, 70)).filter(Boolean).slice(0, 4),
      contactLine: cleanPosterText(input.contactLine, 80),
      imageSide: input.imageSide === 'left' ? 'left' : 'right',
    };
    if (!fields.title) throw new Error('กรุณาระบุตำแหน่งบนรูป');

    const sourceUri = `data:${row.source_image_mime};base64,${row.source_image_bytes.toString('base64')}`;
    const rendered = await renderPoster(fields, sourceUri);
    if (!rendered) throw new Error('ประกอบโปสเตอร์ไม่สำเร็จ กรุณาลองใหม่');
    const researchGate = row.gen_notes?.research_gate ?? { ready: false, issues: ['ร่างนี้ไม่มีหลักฐานสำรวจตลาดก่อนสร้าง'] };
    const quality = evaluateContentQuality({
      campaign: row.campaign,
      caption: row.caption,
      posterFields: fields,
      imageReady: true,
      researchGate,
    });
    const editedAt = new Date().toISOString();
    await client.query(
      `UPDATE campaign_contents
          SET image_bytes=$2, image_mime=$3, poster_fields=$4::jsonb,
              quality_status=$5, quality_score=$6, quality_checks=$7::jsonb, quality_checked_at=now(),
              gen_notes=COALESCE(gen_notes,'{}'::jsonb) || $8::jsonb
        WHERE id=$1`,
      [id, rendered.bytes, rendered.mime, JSON.stringify(fields), quality.status, quality.score,
        JSON.stringify(quality), JSON.stringify({ poster_edited_at: editedAt, poster_edited_by: editor })],
    );
    await client.query('COMMIT');
    return quality;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** ตรวจร่างล่าสุดกับใบขอจริง และเก็บผลไว้ให้ UI แสดงทันที. */
export async function refreshContentQuality(id: string): Promise<ContentQualityResult> {
  const rows = await q<{ caption: string | null; campaign: CampaignRow; quality_checks: ContentQualityResult | null; image_ready: boolean; gen_notes: Record<string, any> | null }>(
    `SELECT cc.caption, cc.quality_checks, cc.gen_notes, to_jsonb(c.*) AS campaign,
            (cc.image_bytes IS NOT NULL AND COALESCE((cc.gen_notes->'image_generation'->>'ok')::boolean,false)) AS image_ready
       FROM campaign_contents cc
       JOIN recruit_campaigns c ON c.id=cc.campaign_id
      WHERE cc.id=$1`,
    [id],
  );
  if (!rows[0]) throw new Error('ไม่พบร่างประกาศนี้');
  const result = evaluateContentQuality({
    campaign: rows[0].campaign,
    caption: rows[0].caption,
    posterFields: rows[0].quality_checks?.posterFields ?? null,
    imageReady: rows[0].image_ready,
    researchGate: rows[0].gen_notes?.research_gate ?? { ready: false, issues: ['ร่างนี้ไม่มีหลักฐานสำรวจตลาดก่อนสร้าง'] },
  });
  await q(
    `UPDATE campaign_contents
        SET quality_status=$2, quality_score=$3, quality_checks=$4::jsonb, quality_checked_at=now()
      WHERE id=$1`,
    [id, result.status, result.score, JSON.stringify(result)],
  );
  return result;
}

/**
 * Enqueue งาน AI คิด content ให้ campaign เข้า work_queue (type='draft',
 * module='orchestrator') ให้ runner บนเครื่อง PC หยิบไปทำ. connector_key
 * 'orchestrator:<id>' ล็อกต่อ campaign กันคิดซ้ำซ้อน; ข้ามถ้ามี draft job ค้างอยู่แล้ว.
 */
export async function enqueueDraftForCampaign(campaignId: string, ownerUser: string | null = null) {
  const workers = await q<{ name: string }>(
    `SELECT name FROM workers
      WHERE last_seen > now() - interval '2 minutes'
        AND COALESCE(meta->'types', '[]'::jsonb) ? 'draft'
        AND ($1 = '' OR COALESCE(meta->>'build_sha', '') = $1)
        AND COALESCE(meta->>'content_pipeline', '') = $2
      ORDER BY last_seen DESC LIMIT 1`,
    [REQUIRED_WORKER_BUILD_SHA, REQUIRED_CONTENT_PIPELINE],
  );
  if (!workers[0]) {
    await q(
      `UPDATE recruit_campaigns
          SET status='needs_input',
              status_note='ยังไม่มี Worker สำหรับสร้าง Content ออนไลน์ งานจะเริ่มเองเมื่อเปิดเครื่อง Worker',
              updated_at=now()
        WHERE id=$1`,
      [campaignId],
    );
    return false;
  }
  await q(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user, preferred_worker)
     SELECT 'draft', 'orchestrator', $1, $2, '{}'::jsonb, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w
         WHERE w.ref_id = $2 AND w.type = 'draft' AND w.status IN ('queued','running'))`,
    [`orchestrator:${campaignId}`, campaignId, ownerUser, workers[0].name],
  );
  return true;
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
  const rows = await q<{ id: string; campaign_id: string; caption: string | null; has_image: boolean; image_generation_ok: boolean }>(
    `SELECT id, campaign_id, caption, (image_bytes IS NOT NULL) AS has_image,
            COALESCE((gen_notes->'image_generation'->>'ok')::boolean,false) AS image_generation_ok
       FROM campaign_contents WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Orchestrator → Autopost bridge (cross-schema, DB เดียวกัน)
// ---------------------------------------------------------------------------
export type FbAccount = {
  id: string;
  label: string;
  group_count: number;
  preferred_worker: string | null;
  worker_online: boolean;
  preflight_ready: boolean;
  preflight_verified: boolean;
};

/** บัญชี Facebook ที่ตั้งไว้ในโมดูล autopost (ให้เลือกตอนอนุมัติ). guarded — [] ถ้า schema ไม่มี. */
export async function listFacebookAccounts(): Promise<FbAccount[]> {
  try {
    return await q<FbAccount>(
      `SELECT id,
              COALESCE(NULLIF(TRIM(name), ''), env_key, id) AS label,
              COALESCE(jsonb_array_length(
                CASE WHEN jsonb_typeof(group_ids::jsonb) = 'array' THEN group_ids::jsonb ELSE '[]'::jsonb END
              ), 0) AS group_count,
              preferred_worker,
              EXISTS (
                SELECT 1 FROM ${AP}.workers w
                 WHERE w.name=users.preferred_worker AND w.last_seen > now() - interval '2 minutes'
              ) AS worker_online,
              EXISTS (
                SELECT 1 FROM ${AP}.workers w
                 WHERE w.name=users.preferred_worker
                   AND w.last_seen > now() - interval '2 minutes'
                   AND COALESCE(w.meta->'capabilities', '[]'::jsonb) ? 'preflight'
                   AND ($1 = '' OR COALESCE(w.meta->>'build_sha', '') = $1)
              ) AS preflight_ready,
              EXISTS (
                SELECT 1 FROM ${AP}.post_run_queue q
                 WHERE q.user_id=users.id AND q.mode='preflight' AND q.status='completed'
                   AND q.finished_at > now() - interval '24 hours'
                   AND ($1 = '' OR COALESCE(q.worker_build_sha, '') = $1)
              ) AS preflight_verified
         FROM ${AP}.users users
        ORDER BY label`,
      [REQUIRED_WORKER_BUILD_SHA],
    );
  } catch {
    return [];
  }
}

/** ส่งงานตรวจ Facebook ไปยังเครื่องที่ผูกไว้ โดยเปิด browser ตรวจ session+group และไม่โพสต์จริง */
export async function enqueueFacebookPreflight(userId: string, requestedBy: string | null): Promise<string> {
  const id = autopostId();
  await q(`ALTER TABLE ${AP}.post_run_queue ADD COLUMN IF NOT EXISTS mode VARCHAR(30) NOT NULL DEFAULT 'post'`);
  const rows = await q<{ id: string; preferred_worker: string | null; group_count: number; worker_online: boolean; preflight_ready: boolean }>(
    `SELECT u.id, u.preferred_worker,
            jsonb_array_length(CASE WHEN jsonb_typeof(u.group_ids::jsonb)='array' THEN u.group_ids::jsonb ELSE '[]'::jsonb END)::int AS group_count,
            EXISTS (SELECT 1 FROM ${AP}.workers w WHERE w.name=u.preferred_worker AND w.last_seen > now() - interval '2 minutes') AS worker_online,
            EXISTS (
              SELECT 1 FROM ${AP}.workers w
               WHERE w.name=u.preferred_worker
                 AND w.last_seen > now() - interval '2 minutes'
                 AND COALESCE(w.meta->'capabilities', '[]'::jsonb) ? 'preflight'
                 AND ($2 = '' OR COALESCE(w.meta->>'build_sha', '') = $2)
            ) AS preflight_ready
       FROM ${AP}.users u WHERE u.id=$1`,
    [userId, REQUIRED_WORKER_BUILD_SHA],
  );
  const account = rows[0];
  if (!account) throw new Error('ไม่พบบัญชี Facebook');
  if (!account.preferred_worker) throw new Error('บัญชี Facebook ยังไม่ได้ผูกกับเครื่อง');
  if (!account.worker_online) throw new Error(`เครื่องที่ผูกไว้ (${account.preferred_worker}) ยังออฟไลน์`);
  if (!account.preflight_ready) throw new Error(`เครื่องที่ผูกไว้ (${account.preferred_worker}) ยังเป็นรุ่นเดิม กรุณารีเฟรช Worker ให้รองรับการทดสอบแบบไม่โพสต์จริงก่อน`);
  if (Number(account.group_count) <= 0) throw new Error('บัญชี Facebook ยังไม่ได้เลือกกลุ่มปลายทาง');
  await q(
    `INSERT INTO ${AP}.post_run_queue (id, assignment_ids, user_id, status, requested_by, message, mode)
     VALUES ($1, '[]'::jsonb, $2, 'queued', $3, $4, 'preflight')`,
    [id, userId, requestedBy || 'web-preflight', 'ตรวจ Facebook แบบไม่โพสต์จริง'],
  );
  return id;
}

function autopostId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// จัดการกลุ่มโพสต์ + ผูกกลุ่มเข้าบัญชี (native — แทน iframe เดิม)
// ---------------------------------------------------------------------------
export type PostingGroup = {
  id: string;
  name: string;
  fb_group_id: string;
  province: string | null;
  department: string | null;
};

/** กลุ่ม Facebook ทั้งหมดในระบบ. guarded — [] ถ้า schema ไม่มี. */
export async function listPostingGroups(): Promise<PostingGroup[]> {
  try {
    return await q<PostingGroup>(
      `SELECT id, COALESCE(NULLIF(TRIM(name), ''), fb_group_id) AS name,
              fb_group_id, province, department
         FROM ${AP}.groups
        ORDER BY created_at DESC`,
    );
  } catch {
    return [];
  }
}

export type FbAccountGroups = { id: string; label: string; groupIds: string[] };

/** บัญชี FB พร้อม id กลุ่มที่ผูกไว้ (สำหรับหน้าเลือกกลุ่ม). */
export async function listFbAccountsWithGroups(): Promise<FbAccountGroups[]> {
  try {
    const rows = await q<{ id: string; label: string; group_ids: unknown }>(
      `SELECT id, COALESCE(NULLIF(TRIM(name), ''), env_key, id) AS label,
              CASE WHEN jsonb_typeof(group_ids::jsonb) = 'array' THEN group_ids::jsonb ELSE '[]'::jsonb END AS group_ids
         FROM ${AP}.users
        ORDER BY label`,
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      groupIds: Array.isArray(r.group_ids) ? r.group_ids.map(String) : [],
    }));
  } catch {
    return [];
  }
}

/** เพิ่มกลุ่มใหม่. คืน id กลุ่ม. */
export async function createPostingGroup(input: {
  fbGroupId: string;
  name?: string | null;
  province?: string | null;
  department?: string | null;
}): Promise<string> {
  const id = autopostId();
  const name = (input.name || '').trim() || `Group ${input.fbGroupId}`;
  await q(
    `INSERT INTO ${AP}.groups (id, name, fb_group_id, province, department)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, input.fbGroupId.trim(), input.province || null, input.department || null],
  );
  return id;
}

/** ลบกลุ่ม + ถอดกลุ่มนั้นออกจากทุกบัญชีที่ผูกไว้ (กัน group_ids ชี้กลุ่มที่หายไป). */
export async function deletePostingGroup(id: string): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${AP}.groups WHERE id = $1`, [id]);
    await client.query(
      `UPDATE ${AP}.users
          SET group_ids = COALESCE((
                SELECT jsonb_agg(v) FROM jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(group_ids::jsonb) = 'array' THEN group_ids::jsonb ELSE '[]'::jsonb END
                ) AS v WHERE v <> $1
              ), '[]'::jsonb)
        WHERE group_ids::jsonb ? $1`,
      [id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** ตั้งกลุ่มของบัญชี (แทนที่ทั้งชุด). */
export async function setAccountGroups(userId: string, groupIds: string[]): Promise<void> {
  await q(
    `UPDATE ${AP}.users SET group_ids = $2::jsonb, updated_at = now() WHERE id = $1`,
    [userId, JSON.stringify(groupIds)],
  );
}

/**
 * อนุมัติร่างคอนเทนต์ → ส่งเข้าคิวโพสต์ของ autopost: สร้าง job (+image_ref ชี้รูป AI) +
 * assignment (บัญชีที่เลือก, กลุ่มว่าง = ใช้กลุ่มที่ตั้งในบัญชี) + post_run_queue (queued).
 * ทั้งหมดอยู่ schema `so_autopost_jobs` (DB เดียวกัน). แล้วบันทึก campaign_posts ฝั่ง orchestrator
 * (เตรียมวัดผลเฟส 4). worker บนเครื่อง PC จะหยิบคิวไปโพสต์ FB พร้อมรูป.
 */
export type PostMode = 'both' | 'image' | 'caption';

export async function enqueueApprovedPost(opts: {
  campaign: CampaignRow;
  content: { id: string; caption: string | null; has_image: boolean; image_generation_ok: boolean };
  userId: string;
  requestedBy: string | null;
  /** โพสต์อะไร: ทั้งคู่ / เฉพาะรูป / เฉพาะแคปชัน (default both) */
  postMode?: PostMode;
  feedbackCode?: string;
  feedbackNote?: string | null;
}) {
  const { campaign, content, userId, requestedBy } = opts;
  const mode: PostMode = opts.postMode ?? 'both';
  const jobId = autopostId();
  const assignmentId = autopostId();
  const queueId = autopostId();
  const title = (campaign.title || campaign.request_no || 'ประกาศรับสมัครงาน').slice(0, 500);
  // เลือกโพสต์: เฉพาะแคปชัน = ไม่แนบรูป · เฉพาะรูป = แคปชันว่าง (ต้องมีรูปจริง)
  const useImage = mode !== 'caption' && content.has_image;
  const useCaption = mode !== 'image';
  const imageRef = useImage ? `campaign-content:${content.id}` : null;
  const captionText = useCaption ? (content.caption || '') : '';

  // เผื่อ schema autopost ยังไม่มีคอลัมน์ image_ref (idempotent)
  await q(`ALTER TABLE ${AP}.jobs ADD COLUMN IF NOT EXISTS image_ref TEXT`);

  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    // ล็อก campaign ก่อนสร้างคิว กันกดอนุมัติซ้ำหรือชนกับ “ให้ AI คิดใหม่”.
    const locked = await client.query<{ campaign_status: string; content_status: string; campaign: CampaignRow; caption: string | null; quality_checks: ContentQualityResult | null; gen_notes: Record<string, any> | null; has_image: boolean; image_generation_ok: boolean }>(
      `SELECT c.status AS campaign_status, cc.status AS content_status,
              to_jsonb(c.*) AS campaign, cc.caption, cc.quality_checks, cc.gen_notes,
              (cc.image_bytes IS NOT NULL) AS has_image,
              COALESCE((cc.gen_notes->'image_generation'->>'ok')::boolean, false) AS image_generation_ok
         FROM recruit_campaigns c
         JOIN campaign_contents cc ON cc.id = $2 AND cc.campaign_id = c.id
        WHERE c.id = $1
        FOR UPDATE OF c, cc`,
      [campaign.id, content.id],
    );
    if (locked.rows[0]?.campaign_status !== 'pending_approval' || locked.rows[0]?.content_status !== 'draft') {
      throw new Error('Content นี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้า');
    }
    if (locked.rows[0].gen_notes?.generation_mode === 'preview') {
      throw new Error('ร่างนี้เป็น Preview ชั่วคราว ใช้ตรวจรูปและแคปชันเท่านั้น กรุณาให้ Worker สร้างร่าง Production ก่อนโพสต์');
    }
    // ตรวจซ้ำภายใน transaction หลังล็อกแถว เพื่อกันทั้งการกดซ้ำและการแก้ caption แข่งกับการอนุมัติ.
    const quality = evaluateContentQuality({
      campaign: locked.rows[0].campaign,
      caption: locked.rows[0].caption,
      posterFields: locked.rows[0].quality_checks?.posterFields ?? null,
      imageReady: locked.rows[0].has_image && locked.rows[0].image_generation_ok,
      researchGate: locked.rows[0].gen_notes?.research_gate ?? { ready: false, issues: ['ร่างนี้ไม่มีหลักฐานสำรวจตลาดก่อนสร้าง'] },
    });
    await client.query(
      `UPDATE campaign_contents
          SET quality_status=$2, quality_score=$3, quality_checks=$4::jsonb, quality_checked_at=now()
        WHERE id=$1`,
      [content.id, quality.status, quality.score, JSON.stringify(quality)],
    );
    if (quality.blocking) {
      throw new Error(`ยังอนุมัติไม่ได้ กรุณาแก้ข้อมูลเหล่านี้ก่อน: ${qualityFailureMessages(quality).join(' · ')}`);
    }
    const accountReady = await client.query<{ id: string; group_count: number; paused_until: string | null; preferred_worker: string | null; worker_online: boolean; preflight_ready: boolean; preflight_verified: boolean }>(
      `SELECT u.id,
              jsonb_array_length(CASE WHEN jsonb_typeof(u.group_ids::jsonb)='array' THEN u.group_ids::jsonb ELSE '[]'::jsonb END)::int AS group_count,
              u.paused_until, u.preferred_worker,
              CASE WHEN NULLIF(TRIM(u.preferred_worker),'') IS NULL THEN true
                   ELSE EXISTS (SELECT 1 FROM ${AP}.workers w WHERE w.name=u.preferred_worker AND w.last_seen > now() - interval '2 minutes')
              END AS worker_online,
              EXISTS (
                SELECT 1 FROM ${AP}.workers w
                 WHERE w.name=u.preferred_worker
                   AND w.last_seen > now() - interval '2 minutes'
                   AND COALESCE(w.meta->'capabilities', '[]'::jsonb) ? 'preflight'
                   AND ($2 = '' OR COALESCE(w.meta->>'build_sha', '') = $2)
              ) AS preflight_ready,
              EXISTS (
                SELECT 1 FROM ${AP}.post_run_queue q
                 WHERE q.user_id=u.id AND q.mode='preflight' AND q.status='completed'
                   AND q.finished_at > now() - interval '24 hours'
                   AND ($2 = '' OR COALESCE(q.worker_build_sha, '') = $2)
              ) AS preflight_verified
         FROM ${AP}.users u WHERE u.id=$1`,
      [userId, REQUIRED_WORKER_BUILD_SHA],
    );
    const account = accountReady.rows[0];
    if (!account) throw new Error('ไม่พบบัญชี Facebook ที่เลือก');
    if (Number(account.group_count) <= 0) throw new Error('บัญชี Facebook นี้ยังไม่ได้เลือกกลุ่มที่จะเผยแพร่');
    if (account.paused_until && new Date(account.paused_until) > new Date()) throw new Error('บัญชี Facebook นี้ถูกพักชั่วคราว กรุณาแก้ Session หรือข้อจำกัดบัญชีก่อน');
    if (!account.worker_online) throw new Error(`เครื่องที่ผูกกับบัญชี Facebook (${account.preferred_worker}) ยังออฟไลน์`);
    if (!account.preflight_ready) throw new Error(`เครื่องที่ผูกกับบัญชี Facebook (${account.preferred_worker}) ยังเป็นรุ่นเดิม กรุณารีเฟรช Worker ก่อน`);
    if (!account.preflight_verified) throw new Error('บัญชี Facebook นี้ยังไม่ผ่านการทดสอบ Session + กลุ่มแบบไม่โพสต์จริงภายใน 24 ชั่วโมง');
    await client.query(
      `INSERT INTO ${AP}.jobs (id, title, owner, company, caption, status, image_ref)
       VALUES ($1, $2, 'SO Recruitment', 'SO Recruitment', $3, 'pending', $4)`,
      [jobId, title, captionText, imageRef],
    );
    await client.query(
      `INSERT INTO ${AP}.assignments (id, job_ids, group_ids, user_id)
       VALUES ($1, $2::jsonb, '[]'::jsonb, $3)`,
      [assignmentId, JSON.stringify([jobId]), userId],
    );
    // requested_by ≠ 'auto-daily' → worker ตั้ง IGNORE_DAILY_CAP=1 (โพสต์แบบสั่งเองข้าม cap ได้)
    await client.query(
      `INSERT INTO ${AP}.post_run_queue (id, assignment_ids, user_id, status, requested_by, message)
       VALUES ($1, $2::jsonb, $3, 'queued', $4, $5)`,
      [queueId, JSON.stringify([assignmentId]), userId, requestedBy || 'orchestrator', `orchestrator campaign ${campaign.id}`],
    );
    await client.query(
      `INSERT INTO campaign_posts (campaign_id, content_id, platform, account_ref, job_ref)
       VALUES ($1, $2, 'facebook', $3, $4)`,
      [campaign.id, content.id, userId, jobId],
    );
    await client.query(`UPDATE campaign_contents SET status = 'approved', reject_reason = NULL WHERE id = $1`, [content.id]);
    const feedbackCode = FEEDBACK_CODES.has(String(opts.feedbackCode || '')) ? String(opts.feedbackCode) : 'ready';
    await client.query(
      `INSERT INTO content_feedback
         (campaign_id, content_id, decision, reason_codes, note, reviewer)
       VALUES ($1, $2, 'approved', ARRAY[$3]::text[], $4, $5)
       ON CONFLICT (content_id, decision) DO UPDATE SET
         reason_codes=EXCLUDED.reason_codes, note=EXCLUDED.note,
         reviewer=EXCLUDED.reviewer, created_at=now()`,
      [campaign.id, content.id, feedbackCode, opts.feedbackNote || null, requestedBy],
    );
    await client.query(
      `UPDATE recruit_campaigns SET status = 'posting', status_note = NULL, updated_at = now() WHERE id = $1`,
      [campaign.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { jobId, assignmentId, queueId };
}

export type CampaignPostQueueState = {
  campaign_id: string;
  queue_id: string;
  assignment_id: string;
  user_id: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

/** สถานะคิวโพสต์ล่าสุดของแต่ละ campaign เพื่อให้ Work Center แสดงผลจริงจาก Auto-Post. */
export async function listCampaignPostQueueStates(): Promise<CampaignPostQueueState[]> {
  try {
    return await q<CampaignPostQueueState>(
      `SELECT DISTINCT ON (cp.campaign_id)
              cp.campaign_id, q.id AS queue_id, a.id AS assignment_id, q.user_id,
              q.status, NULLIF(COALESCE(q.error, ''), '') AS error,
              q.created_at, q.finished_at
         FROM campaign_posts cp
         JOIN ${AP}.assignments a ON a.job_ids ? cp.job_ref
         JOIN ${AP}.post_run_queue q ON q.assignment_ids ? a.id
        ORDER BY cp.campaign_id, q.created_at DESC`,
    );
  } catch {
    return [];
  }
}

/** สถานะคิวโพสต์ล่าสุดของ campaign เดียว ใช้ล็อก action ที่ชนกับงานโพสต์. */
export async function getCampaignPostQueueState(campaignId: string): Promise<CampaignPostQueueState | null> {
  try {
    const rows = await q<CampaignPostQueueState>(
      `SELECT cp.campaign_id, q.id AS queue_id, a.id AS assignment_id, q.user_id,
              q.status, NULLIF(COALESCE(q.error, ''), '') AS error,
              q.created_at, q.finished_at
         FROM campaign_posts cp
         JOIN ${AP}.assignments a ON a.job_ids ? cp.job_ref
         JOIN ${AP}.post_run_queue q ON q.assignment_ids ? a.id
        WHERE cp.campaign_id = $1
        ORDER BY q.created_at DESC
        LIMIT 1`,
      [campaignId],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * เปลี่ยน campaign เข้าสู่ drafting แบบ atomic เฉพาะเมื่อไม่มี draft/post/measure ที่กำลังทำ.
 * ป้องกัน action ถูกเรียกตรงหรือกดซ้อน แม้หน้า UI จะเก่าอยู่.
 */
export async function beginCampaignDraftRetry(campaignId: string, ownerUser: string | null): Promise<boolean> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const campaigns = await client.query<{ status: string }>(
      `SELECT status FROM recruit_campaigns WHERE id = $1 FOR UPDATE`,
      [campaignId],
    );
    const status = campaigns.rows[0]?.status;
    if (!status || ['researching', 'drafting', 'posting', 'measuring'].includes(status)) {
      await client.query('ROLLBACK');
      return false;
    }
    const busy = await client.query<{ busy: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM campaign_posts cp
           JOIN ${AP}.assignments a ON a.job_ids ? cp.job_ref
           JOIN ${AP}.post_run_queue q ON q.assignment_ids ? a.id
          WHERE cp.campaign_id = $1
            AND q.status IN ('queued', 'running')
       ) AS busy`,
      [campaignId],
    );
    if (busy.rows[0]?.busy) {
      await client.query('ROLLBACK');
      return false;
    }
    const workers = await client.query<{ name: string }>(
      `SELECT name FROM workers
        WHERE last_seen > now() - interval '2 minutes'
          AND COALESCE((meta->'image_generation'->>'configured')::boolean, false)
          AND COALESCE(meta->'image_generation'->>'model', '') = 'gpt-image-2'
          AND COALESCE(meta->'types', '[]'::jsonb) ? 'draft'
          AND ($1 = '' OR COALESCE(meta->>'build_sha', '') = $1)
          AND COALESCE(meta->>'content_pipeline', '') = $2
        ORDER BY last_seen DESC LIMIT 1`,
      [REQUIRED_WORKER_BUILD_SHA, REQUIRED_CONTENT_PIPELINE],
    );
    if (!workers.rows[0]) {
      await client.query(
        `UPDATE recruit_campaigns
            SET status='needs_input',
                status_note='เครื่องสร้าง Content ยังไม่ได้รีเฟรชเป็นรุ่นที่สร้างรูปตามตำแหน่งด้วย gpt-image-2 จึงยังไม่ส่งงานเพื่อป้องกันรูปผิด',
                updated_at=now()
          WHERE id=$1`,
        [campaignId],
      );
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      `UPDATE recruit_campaigns SET status = 'drafting', status_note = NULL, updated_at = now() WHERE id = $1`,
      [campaignId],
    );
    await client.query(
      `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user, preferred_worker)
       VALUES ('draft', 'orchestrator', $1, $2, '{}'::jsonb, $3, $4)`,
      [`orchestrator:${campaignId}`, campaignId, ownerUser, workers.rows[0].name],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** นำ assignment เดิมที่โพสต์ไม่สำเร็จกลับเข้าคิว โดยไม่สร้าง Content/Job ซ้ำ. */
export async function retryCampaignPost(campaignId: string, requestedBy: string | null) {
  const rows = await q<CampaignPostQueueState>(
    `SELECT cp.campaign_id, q.id AS queue_id, a.id AS assignment_id, q.user_id,
            q.status, NULLIF(COALESCE(q.error, ''), '') AS error,
            q.created_at, q.finished_at
       FROM campaign_posts cp
       JOIN ${AP}.assignments a ON a.job_ids ? cp.job_ref
       JOIN ${AP}.post_run_queue q ON q.assignment_ids ? a.id
      WHERE cp.campaign_id = $1
      ORDER BY q.created_at DESC
      LIMIT 1`,
    [campaignId],
  );
  const latest = rows[0];
  if (!latest) throw new Error('ไม่พบงานโพสต์เดิมสำหรับลองใหม่');
  if (latest.status === 'queued' || latest.status === 'running') return latest.queue_id;
  if (latest.status !== 'failed' && latest.status !== 'cancelled') {
    throw new Error(`งานโพสต์สถานะ ${latest.status} ไม่สามารถลองใหม่ได้`);
  }
  const queueId = autopostId();
  await q(
    `INSERT INTO ${AP}.post_run_queue (id, assignment_ids, user_id, status, requested_by, message)
     VALUES ($1, $2::jsonb, $3, 'queued', $4, $5)`,
    [queueId, JSON.stringify([latest.assignment_id]), latest.user_id, requestedBy || 'orchestrator', `retry orchestrator campaign ${campaignId}`],
  );
  return queueId;
}

// --- หน้า /autopost: Content รออนุมัติ + คิวโพสต์ ---
export type PendingApproval = {
  id: string;
  campaign_id: string;
  version: number;
  caption: string | null;
  has_image: boolean;
  title: string | null;
  request_no: string | null;
  quality_status: 'pending' | 'pass' | 'warning' | 'fail';
  quality_score: number | null;
  quality_checks: ContentQualityResult | null;
};

/** ร่างคอนเทนต์ที่รออนุมัติ (campaign อยู่สถานะ pending_approval) — เก่าก่อน. */
export async function listPendingApprovalContents(): Promise<PendingApproval[]> {
  try {
    const rows = await q<PendingApproval & { campaign: CampaignRow }>(
      `SELECT cc.id, cc.campaign_id, cc.version, cc.caption,
              (cc.image_bytes IS NOT NULL) AS has_image, c.title, c.request_no,
              cc.quality_status, cc.quality_score, cc.quality_checks,
              to_jsonb(c.*) AS campaign
         FROM campaign_contents cc
         JOIN recruit_campaigns c ON c.id = cc.campaign_id
        WHERE cc.status = 'draft' AND c.status = 'pending_approval'
        ORDER BY cc.created_at ASC`,
    );
    return rows.map(({ campaign, ...row }) => {
      if (row.quality_status !== 'pending') return row;
      const quality = evaluateContentQuality({ campaign, caption: row.caption });
      return { ...row, quality_status: quality.status, quality_score: quality.score, quality_checks: quality };
    });
  } catch {
    return [];
  }
}

export type PostQueueRow = {
  id: string;
  status: string;
  account: string | null;
  job_title: string | null;
  created_at: string;
};

/** คิวโพสต์ (queued/running) เรียงตามเวลาเข้าคิว — worker รันตามลำดับนี้ บัญชีละ 1 งานพร้อมกัน. guarded — [] ถ้า schema ไม่พร้อม. */
export async function postQueueList(): Promise<PostQueueRow[]> {
  try {
    return await q<PostQueueRow>(
      `SELECT q.id, q.status, q.created_at,
              COALESCE(NULLIF(TRIM(u.name), ''), u.env_key, u.id) AS account,
              j.title AS job_title
         FROM ${AP}.post_run_queue q
         LEFT JOIN ${AP}.users u ON u.id = q.user_id
         LEFT JOIN ${AP}.assignments a ON a.id = (q.assignment_ids->>0)
         LEFT JOIN ${AP}.jobs j ON j.id = (a.job_ids->>0)
        WHERE q.status IN ('queued', 'running')
        ORDER BY q.created_at ASC`,
    );
  } catch {
    return [];
  }
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

// --- Worker heartbeat (schema-011 + autopost.workers) — เครื่องไหนยังมีชีวิต ---
export type WorkerHeartbeat = {
  name: string;
  kind: string; // scraper | autopost
  last_seen: string;
  online: boolean; // last_seen ใหม่กว่า 2 นาที (heartbeat เขียนทุก ~15 วิ)
  meta: Record<string, unknown> | null;
};

/** รวม worker ทั้งสองฝั่ง (scraper + autopost) เพื่อโชว์บนศูนย์งาน. fail-soft: ตารางยังไม่มี = list ว่าง */
export async function listWorkerHeartbeats(): Promise<WorkerHeartbeat[]> {
  const out: WorkerHeartbeat[] = [];
  for (const src of ['workers', `${AP}.workers`]) {
    try {
      const rows = await q<WorkerHeartbeat>(
        `SELECT name, kind, last_seen, (last_seen > now() - interval '2 minutes') AS online, meta
           FROM ${src} ORDER BY name`,
      );
      out.push(...rows);
    } catch {
      /* ตารางยังไม่ถูก migrate — ข้าม */
    }
  }
  return out;
}

export type WorkflowReadinessSnapshot = WorkflowReadiness & { workers: WorkerHeartbeat[] };

/** ตรวจความพร้อมครบเส้นแบบ read-only สำหรับศูนย์งาน. ทุกจุด fail-soft แต่รายงานว่าไม่พร้อมแทนการเงียบ. */
export async function getWorkflowReadiness(): Promise<WorkflowReadinessSnapshot> {
  const [workers, facebookAccounts, queue, postQueue, inconsistent, selftest, contentOutput, scrapeOutput, recentPostRuns] = await Promise.all([
    listWorkerHeartbeats(),
    listFacebookAccounts(),
    q<{ queued: number; oldest_queued_minutes: number | null; stale_running: number; stalled_progress: number; errors_24h: number }>(
      `SELECT
         count(*) FILTER (WHERE status='queued')::int AS queued,
         EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status='queued'))) / 60 AS oldest_queued_minutes,
         count(*) FILTER (WHERE status='running' AND locked_at < now() - interval '30 minutes')::int AS stale_running,
         count(*) FILTER (
           WHERE status='running' AND type='scrape'
             AND GREATEST(
               COALESCE(started_at, created_at),
               (SELECT max(tc.last_matched_at)
                  FROM scrape_task_candidates tc
                 WHERE tc.task_id::text=work_queue.ref_id)
             ) < now() - interval '10 minutes'
         )::int AS stalled_progress,
         count(*) FILTER (WHERE status='error' AND finished_at > now() - interval '24 hours')::int AS errors_24h
       FROM work_queue`,
    ).then((rows) => rows[0] ?? {}).catch(() => ({})),
    q<{ queued: number; running: number; failed_24h: number }>(
      `SELECT
         count(*) FILTER (WHERE status='queued')::int AS queued,
         count(*) FILTER (WHERE status='running')::int AS running,
         count(*) FILTER (WHERE status IN ('failed','cancelled') AND COALESCE(finished_at, created_at) > now() - interval '24 hours')::int AS failed_24h
       FROM ${AP}.post_run_queue`,
    ).then((rows) => rows[0] ?? {}).catch(() => ({})),
    q<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM recruit_campaigns c
         JOIN "jarvis_rm".job_posting_requests r ON r.request_no=c.request_no
        WHERE r.status IN ('cancelled','rejected')
          AND c.status NOT IN ('done','cancelled')`,
    ).then((rows) => rows[0]?.count ?? 0).catch(() => 0),
    q<{ status: string; finished_at: string | null; last_error: string | null }>(
      `SELECT status, finished_at, last_error
         FROM work_queue WHERE type='selftest'
        ORDER BY created_at DESC LIMIT 1`,
    ).then((rows) => rows[0] ?? null).catch(() => null),
    q<{ passing_with_image: number; verified_generation: number; failed_quality: number }>(
      `SELECT
         count(*) FILTER (WHERE quality_status='pass' AND image_bytes IS NOT NULL)::int AS passing_with_image,
         count(*) FILTER (WHERE quality_status='pass' AND image_bytes IS NOT NULL AND COALESCE((gen_notes->'image_generation'->>'ok')::boolean,false))::int AS verified_generation,
         count(*) FILTER (WHERE quality_status='fail')::int AS failed_quality
       FROM campaign_contents
       WHERE created_at > now() - interval '30 days'`,
    ).then((rows) => rows[0] ?? {}).catch(() => ({})),
    q<{ completed: number; partial: number; error: number }>(
      `SELECT
         count(*) FILTER (WHERE status='done')::int AS completed,
         count(*) FILTER (WHERE status='partial')::int AS partial,
         count(*) FILTER (WHERE status='error')::int AS error
       FROM scrape_tasks
       WHERE created_at > now() - interval '30 days'`,
    ).then((rows) => rows[0] ?? {}).catch(() => ({})),
    q<{ status: string; mode: string }>(
      `SELECT status, COALESCE(mode, 'post') AS mode
         FROM ${AP}.post_run_queue
        WHERE COALESCE(mode, 'post') = 'post'
        ORDER BY created_at DESC LIMIT 3`,
    ).catch(() => []),
  ]);
  return {
    ...evaluateWorkflowReadiness({ requiredBuildSha: REQUIRED_WORKER_BUILD_SHA, workers, facebookAccounts, queue, postQueue, inconsistentCampaigns: inconsistent, lastSelftest: selftest, contentOutput, scrapeOutput, recentPostRuns }),
    workers,
  };
}

/** สร้างงาน smoke test ที่ไม่มีข้อมูลผู้สมัครและไม่แตะ Facebook. */
export async function enqueueWorkflowSelfTest(ownerUser: string | null): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO work_queue
       (id, type, module, connector_key, payload, owner_user, priority, max_attempts)
     VALUES ($1, 'selftest', 'system', 'system:selftest', $2::jsonb, $3, 1000, 1)`,
    [id, JSON.stringify({ started_from: 'work_center', safe: true }), ownerUser],
  );
  return id;
}

export async function getWorkflowSelfTest(id: string) {
  const rows = await q<{ status: string; last_error: string | null }>(
    `SELECT status, last_error FROM work_queue WHERE id=$1 AND type='selftest'`,
    [id],
  );
  return rows[0] ?? null;
}

// --- ช่วงเวลาโพสต์ที่ได้ผล (post_time_insights — best-time-update.mjs อัปเดตรายสัปดาห์) ---
export type BestPostTime = { dow: number; hour: number; posts: number; score: number };

/** ช่วงเวลาที่ engagement/lead ต่อโพสต์สูงสุด (ต้องมี ≥2 โพสต์ในช่วงนั้นถึงนับ) */
export async function listBestPostTimes(limit = 3): Promise<BestPostTime[]> {
  try {
    return await q<BestPostTime>(
      `SELECT dow, hour, posts, score::float AS score
         FROM post_time_insights WHERE posts >= 2 AND score > 0
        ORDER BY score DESC LIMIT $1`,
      [limit],
    );
  } catch {
    return [];
  }
}

/** จำนวนโพสต์ที่ค้าง "รอแอดมินกลุ่มอนุมัติ" ต่อ campaign (จาก post_logs.post_status ของ autopost) */
export async function listCampaignPendingAdminCounts(): Promise<{ campaign_id: string; pending: number }[]> {
  try {
    return await q<{ campaign_id: string; pending: number }>(
      `SELECT cp.campaign_id, count(*)::int AS pending
         FROM campaign_posts cp
         JOIN ${AP}.post_logs pl ON pl.job_id = cp.job_ref
        WHERE pl.post_status = 'รออนุมัติ'
        GROUP BY cp.campaign_id`,
    );
  } catch {
    return [];
  }
}
