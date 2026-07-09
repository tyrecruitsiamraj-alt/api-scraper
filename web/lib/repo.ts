import 'server-only';
import { q } from './db';

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
}) {
  const rows = await q<{ id: string }>(
    `INSERT INTO scrape_tasks (name, connector_id, mode, target_count, updated_since, criteria,
                               schedule_cron, next_run_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [t.name, t.connectorId, t.mode, t.targetCount, t.updatedSince, JSON.stringify(t.criteria),
     t.scheduleCron, t.nextRunAt, t.status],
  );
  return rows[0].id;
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
