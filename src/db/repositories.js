import { query, withTransaction } from './pool.js';
import { decryptSecret, encryptSecret } from './crypto.js';

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export async function createConnector({ platform, label, username, password, scrapeLimit = 15, dailyCap = 200, settings = {} }) {
  const { rows } = await query(
    `INSERT INTO connectors (platform, label, username, password_enc, scrape_limit, daily_cap, settings)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [platform, label, username, encryptSecret(password), scrapeLimit, dailyCap, settings],
  );
  return rows[0].id;
}

export async function listConnectors({ platform, enabledOnly = false } = {}) {
  const where = [];
  const params = [];
  if (platform) { params.push(platform); where.push(`platform = $${params.length}`); }
  if (enabledOnly) where.push('enabled = true');
  const sql = `SELECT * FROM connectors ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY platform, label`;
  const { rows } = await query(sql, params);
  return rows.map(decorateConnector);
}

export async function getConnector(id) {
  const { rows } = await query('SELECT * FROM connectors WHERE id = $1', [id]);
  return rows[0] ? decorateConnector(rows[0]) : null;
}

function decorateConnector(row) {
  return { ...row, password: () => decryptSecret(row.password_enc) };
}

export async function saveConnectorSession(id, sessionState) {
  await query('UPDATE connectors SET session_state = $2, last_login_at = now(), updated_at = now() WHERE id = $1', [id, sessionState]);
}

export async function setConnectorCooldown(id, until) {
  await query('UPDATE connectors SET cooldown_until = $2, updated_at = now() WHERE id = $1', [id, until]);
}

/** Candidates scraped by this connector since midnight (Asia/Bangkok) — live from sources. */
export async function countScrapedToday(connectorId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM candidate_sources
      WHERE connector_id = $1
        AND last_seen_at >= ((now() AT TIME ZONE 'Asia/Bangkok')::date::timestamp AT TIME ZONE 'Asia/Bangkok')`,
    [connectorId],
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Provider-level daily cap (across ALL connectors of a platform) — enforced strictly
// ---------------------------------------------------------------------------
export async function getProviderCap(platform) {
  const { rows } = await query('SELECT daily_cap FROM provider_limits WHERE platform = $1', [platform]);
  return rows[0]?.daily_cap ?? null; // null = no provider-level cap configured
}

export async function setProviderCap(platform, dailyCap) {
  await query(
    `INSERT INTO provider_limits (platform, daily_cap) VALUES ($1,$2)
     ON CONFLICT (platform) DO UPDATE SET daily_cap = EXCLUDED.daily_cap, updated_at = now()`,
    [platform, dailyCap],
  );
}

/** Candidates scraped today across ALL connectors of this platform (live). */
export async function platformScrapedToday(platform) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM candidate_sources
      WHERE platform = $1
        AND last_seen_at >= ((now() AT TIME ZONE 'Asia/Bangkok')::date::timestamp AT TIME ZONE 'Asia/Bangkok')`,
    [platform],
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Scrape tasks
// ---------------------------------------------------------------------------
export async function createTask(t) {
  const { rows } = await query(
    `INSERT INTO scrape_tasks (name, connector_id, mode, target_count, updated_since, criteria, schedule_cron, next_run_at, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [t.name, t.connectorId, t.mode ?? 'count', t.targetCount ?? null, t.updatedSince ?? null,
     t.criteria ?? {}, t.scheduleCron ?? null, t.nextRunAt ?? null, t.enabled ?? true],
  );
  return rows[0].id;
}

export async function listTasks() {
  const { rows } = await query(
    `SELECT t.*, c.label AS connector_label, c.platform
       FROM scrape_tasks t JOIN connectors c ON c.id = t.connector_id
      ORDER BY t.created_at DESC`,
  );
  return rows;
}

/** Tasks to run now: explicitly queued, or scheduled and due. */
export async function dueTasks() {
  const { rows } = await query(
    `SELECT * FROM scrape_tasks
      WHERE enabled = true
        AND (status = 'queued' OR (schedule_cron IS NOT NULL AND next_run_at IS NOT NULL AND next_run_at <= now() AND status <> 'running'))
      ORDER BY created_at`,
  );
  return rows;
}

export async function markTaskRunning(id, target, { resume = false } = {}) {
  if (resume) {
    await query(
      `UPDATE scrape_tasks SET status='running', phase='scraping', progress_target=$2, last_error=NULL, updated_at=now() WHERE id=$1`,
      [id, target],
    );
    return;
  }
  await query(`UPDATE scrape_tasks SET status='running', phase='scraping', progress_got=0, progress_target=$2, last_error=NULL, updated_at=now() WHERE id=$1`, [id, target]);
}
/** Move a running task to a new phase and reset its progress counter. */
export async function setTaskPhase(id, phase, target = 0) {
  await query(`UPDATE scrape_tasks SET phase=$2, progress_got=0, progress_target=$3, updated_at=now() WHERE id=$1`, [id, phase, target]);
}
export async function bumpTaskProgress(id, got) {
  await query(`UPDATE scrape_tasks SET progress_got=$2, updated_at=now() WHERE id=$1`, [id, got]);
}
export async function touchTask(id) {
  await query(`UPDATE scrape_tasks SET updated_at=now() WHERE id=$1`, [id]);
}
export async function setTaskProgressTarget(id, target) {
  await query(`UPDATE scrape_tasks SET progress_target=$2, updated_at=now() WHERE id=$1`, [id, target]);
}
/** Unstick tasks whose worker died or hung (no heartbeat for maxStaleMin). */
export async function recoverStaleRunningTasks(maxStaleMin = 10) {
  const { rows } = await query(
    `UPDATE scrape_tasks
        SET status='queued', phase='idle', last_error=$2
      WHERE status='running'
        AND updated_at < now() - ($1::text || ' minutes')::interval
      RETURNING id, name`,
    [String(maxStaleMin), `ค้างนานเกิน ${maxStaleMin} นาที — จะลองรันใหม่อัตโนมัติ`],
  );
  return rows;
}
export async function finishTask(id, { status, phase, runId, error, nextRunAt }) {
  await query(
    `UPDATE scrape_tasks SET status=$2, phase=$3, last_run_id=$4, last_run_at=now(), last_error=$5, next_run_at=$6, updated_at=now() WHERE id=$1`,
    [id, status, phase ?? (status === 'error' ? 'error' : 'done'), runId ?? null, error ?? null, nextRunAt ?? null],
  );
}
export async function queueTask(id) {
  await query(`UPDATE scrape_tasks SET status='queued', phase='idle', enabled=true, updated_at=now() WHERE id=$1`, [id]);
}

// ---------------------------------------------------------------------------
// Asset AI-extraction (Ollama)
// ---------------------------------------------------------------------------
export async function listPendingExtractions(limit = 10) {
  const { rows } = await query(
    `SELECT id, candidate_id, file_type, mime FROM candidate_assets
      WHERE kind='attachment' AND extract_status='pending' AND content IS NOT NULL
      ORDER BY created_at LIMIT $1`,
    [limit],
  );
  return rows;
}
export async function getAssetContent(id) {
  const { rows } = await query('SELECT content, file_type FROM candidate_assets WHERE id=$1', [id]);
  return rows[0] ?? null;
}
export async function saveExtraction(id, { text, structured, status }) {
  await query(
    `UPDATE candidate_assets SET extracted_text=$2, extracted=$3, extract_status=$4, extracted_at=now() WHERE id=$1`,
    [id, text ?? null, structured ? JSON.stringify(structured) : null, status],
  );
}

/** Pending attachment extractions for candidates touched by ONE run (for the per-task OCR phase). */
export async function pendingExtractionsForRun(runId) {
  const { rows } = await query(
    `SELECT DISTINCT a.id, a.file_type FROM candidate_assets a
       JOIN candidate_sources s ON s.id = a.candidate_source_id
      WHERE s.run_id = $1 AND a.kind='attachment' AND a.extract_status='pending' AND a.content IS NOT NULL
      ORDER BY a.id`,
    [runId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Enrich: fill missing candidate contacts from OCR'd attachment text
// ---------------------------------------------------------------------------
/** Candidates found/updated by ONE run, with their current contact fields. */
export async function candidatesForRun(runId) {
  const { rows } = await query(
    `SELECT DISTINCT c.id, c.email, c.phone, c.line_id
       FROM candidates c JOIN candidate_sources s ON s.candidate_id = c.id
      WHERE s.run_id = $1`,
    [runId],
  );
  return rows;
}

/** Concatenated successful OCR text across a candidate's attachments. */
export async function extractedTextForCandidate(candidateId) {
  const { rows } = await query(
    `SELECT string_agg(extracted_text, E'\n') AS txt FROM candidate_assets
      WHERE candidate_id=$1 AND extract_status='success' AND extracted_text IS NOT NULL`,
    [candidateId],
  );
  return rows[0]?.txt ?? '';
}

/** Fill ONLY missing contact fields (never overwrite existing scraped values). */
export async function fillCandidateContacts(id, { email, phone, line_id }) {
  const sets = [];
  const params = [id];
  const add = (col, val, norm) => {
    if (!val) return;
    params.push(val);
    sets.push(`${col} = COALESCE(NULLIF(${col}, ''), $${params.length})`);
    if (norm) {
      params.push(norm);
      sets.push(`${col}_norm = COALESCE(NULLIF(${col}_norm, ''), $${params.length})`);
    }
  };
  add('email', email, email ? String(email).toLowerCase() : '');
  add('phone', phone, phone ? String(phone).replace(/\D/g, '') : '');
  add('line_id', line_id);
  if (!sets.length) return false;
  await query(
    `UPDATE candidates SET ${sets.join(', ')}, last_updated_at=now() WHERE id=$1`,
    params,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Scrape runs
// ---------------------------------------------------------------------------
export async function startRun(connectorId, platform, criteria, taskId = null) {
  const { rows } = await query(
    `INSERT INTO scrape_runs (connector_id, platform, criteria, task_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [connectorId, platform, criteria, taskId],
  );
  return rows[0].id;
}

export async function finishRun(runId, { status, requested, found, newCount, updatedCount, failed, error }) {
  await query(
    `UPDATE scrape_runs SET status=$2, requested=$3, found=$4, new_count=$5, updated_count=$6,
       failed=$7, error=$8, finished_at=now() WHERE id=$1`,
    [runId, status, requested, found, newCount, updatedCount, failed, error ?? null],
  );
}

// ---------------------------------------------------------------------------
// Candidates — dedupe + upsert
// ---------------------------------------------------------------------------
const TEXT_COLS = [
  'prefix', 'first_name', 'last_name', 'full_name', 'phone', 'email', 'line_id', 'facebook',
  'gender', 'age', 'birth_date', 'nationality', 'religion', 'height', 'weight', 'marital_status',
  'military_status', 'vehicle', 'driving_license', 'driving_ability', 'address', 'province', 'intro',
  'desired_positions', 'desired_work_area', 'job_type', 'expected_salary', 'available_start',
];
const JSON_COLS = ['education', 'work_experience', 'hard_skills', 'soft_skills', 'language_skills'];

function validEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) ? e : '';
}

function buildRow(parsed) {
  const phoneNorm = String(parsed.phone ?? '').replace(/\D/g, '');
  const emailNorm = validEmail(parsed.email);
  const dedupeKey = phoneNorm
    ? `phone:${phoneNorm}`
    : emailNorm
      ? `email:${emailNorm}`
      : `name:${parsed.name ?? ''}:${parsed.birth_date ?? ''}`;
  const text = {};
  for (const c of TEXT_COLS) text[c] = c === 'full_name' ? (parsed.name ?? '') : (parsed[c] ?? '');
  const json = {};
  for (const c of JSON_COLS) json[c] = JSON.stringify(parsed[c] ?? []);
  return { phoneNorm, emailNorm, dedupeKey, text, json };
}

/**
 * Upsert a candidate with cross-platform dedupe.
 * Matches existing by phone_norm → email_norm → dedupe_key, else inserts.
 * On match: fills blank text fields and refreshes non-empty arrays.
 * Returns { id, isNew }.
 */
export async function upsertCandidate(client, parsed) {
  const q = client.query.bind(client);
  const { phoneNorm, emailNorm, dedupeKey, text, json } = buildRow(parsed);

  const found = await q(
    `SELECT id FROM candidates
      WHERE ($1 <> '' AND phone_norm = $1) OR ($2 <> '' AND email_norm = $2) OR dedupe_key = $3
      LIMIT 1`,
    [phoneNorm, emailNorm, dedupeKey],
  );

  if (found.rows[0]) {
    const id = found.rows[0].id;
    const sets = [];
    const params = [id];
    for (const c of TEXT_COLS) {
      params.push(text[c]);
      sets.push(`${c} = COALESCE(NULLIF($${params.length}, ''), ${c})`);
    }
    for (const c of JSON_COLS) {
      params.push(json[c]);
      sets.push(`${c} = CASE WHEN $${params.length}::jsonb <> '[]'::jsonb THEN $${params.length}::jsonb ELSE ${c} END`);
    }
    params.push(phoneNorm); sets.push(`phone_norm = COALESCE(NULLIF($${params.length}, ''), phone_norm)`);
    params.push(emailNorm); sets.push(`email_norm = COALESCE(NULLIF($${params.length}, ''), email_norm)`);
    sets.push('last_updated_at = now()');
    await q(`UPDATE candidates SET ${sets.join(', ')} WHERE id = $1`, params);
    return { id, isNew: false };
  }

  const cols = ['dedupe_key', 'phone_norm', 'email_norm', ...TEXT_COLS, ...JSON_COLS];
  const vals = [dedupeKey, phoneNorm, emailNorm, ...TEXT_COLS.map((c) => text[c]), ...JSON_COLS.map((c) => json[c])];
  const placeholders = cols.map((c, i) => (JSON_COLS.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const ins = await q(
    `INSERT INTO candidates (${cols.join(',')}) VALUES (${placeholders.join(',')})
     ON CONFLICT (dedupe_key) DO UPDATE SET last_updated_at = now() RETURNING id`,
    vals,
  );
  return { id: ins.rows[0].id, isNew: true };
}

/** Upsert the provenance "tag" for where this candidate was found. */
export async function upsertSource(client, candidateId, { platform, connectorId, externalId, sourceUrl, runId, parseStatus, rawText }) {
  const { rows } = await client.query(
    `INSERT INTO candidate_sources (candidate_id, platform, connector_id, external_id, source_url, run_id, parse_status, raw_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (platform, external_id) DO UPDATE
       SET candidate_id = EXCLUDED.candidate_id, connector_id = EXCLUDED.connector_id,
           source_url = EXCLUDED.source_url, run_id = EXCLUDED.run_id,
           parse_status = EXCLUDED.parse_status, raw_text = EXCLUDED.raw_text, last_seen_at = now()
     RETURNING id`,
    [candidateId, platform, connectorId ?? null, externalId ?? null, sourceUrl ?? null, runId ?? null, parseStatus ?? null, rawText ?? null],
  );
  return rows[0].id;
}

/** Save one asset (profile/attachment) as bytea, deduped by sha256 per candidate. */
export async function saveAsset(client, candidateId, sourceId, asset) {
  await client.query(
    `INSERT INTO candidate_assets
       (candidate_id, candidate_source_id, kind, title, source_url, file_type, mime, byte_size, sha256, storage_kind, content, download_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'db',$10,$11)
     ON CONFLICT (candidate_id, sha256) DO UPDATE
       SET candidate_source_id = EXCLUDED.candidate_source_id, title = EXCLUDED.title,
           download_status = EXCLUDED.download_status`,
    [
      candidateId, sourceId ?? null, asset.kind, asset.title ?? null, asset.source_url ?? null,
      asset.file_type ?? null, asset.mime ?? null, asset.byte_size ?? null, asset.sha256 ?? null,
      asset.content ?? null, asset.download_status ?? 'pending',
    ],
  );
}

// ---------------------------------------------------------------------------
// Read queries (for the control API)
// ---------------------------------------------------------------------------
export async function listCandidates({ limit = 50, offset = 0, platform } = {}) {
  const params = [];
  let join = '';
  let where = '';
  if (platform) {
    params.push(platform);
    join = 'JOIN candidate_sources s ON s.candidate_id = c.id';
    where = `WHERE s.platform = $${params.length}`;
  }
  params.push(Math.min(200, limit));
  params.push(offset);
  const { rows } = await query(
    `SELECT DISTINCT c.id, c.full_name, c.phone, c.email, c.province, c.expected_salary,
            c.last_updated_at
       FROM candidates c ${join} ${where}
      ORDER BY c.last_updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

export async function getCandidateDetail(id) {
  const cand = (await query('SELECT * FROM candidates WHERE id = $1', [id])).rows[0];
  if (!cand) return null;
  const sources = (await query('SELECT platform, connector_id, external_id, source_url, parse_status, first_seen_at, last_seen_at FROM candidate_sources WHERE candidate_id = $1', [id])).rows;
  const assets = (await query('SELECT id, kind, title, file_type, mime, byte_size, download_status FROM candidate_assets WHERE candidate_id = $1', [id])).rows;
  return { ...cand, sources, assets };
}

export async function getAsset(id) {
  const { rows } = await query('SELECT title, file_type, mime, content FROM candidate_assets WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export { withTransaction };
