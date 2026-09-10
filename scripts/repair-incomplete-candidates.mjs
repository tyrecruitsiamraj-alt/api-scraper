/**
 * Repair incomplete candidate rows from stored source raw_text.
 * Never invents values — only fills blank fields that the text already contains.
 *
 * Usage (on the Windows worker with .env):
 *   node scripts/repair-incomplete-candidates.mjs
 *   node scripts/repair-incomplete-candidates.mjs --dry-run
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function say(message) {
  // ASCII-safe + explicit flush so Windows CMD never stays blank.
  process.stdout.write(`${message}\r\n`);
  if (typeof process.stdout.write === 'function' && process.stdout.writableNeedDrain) {
    // no-op marker; real flush below
  }
  try {
    if (typeof process.stdout._handle?.setBlocking === 'function') {
      process.stdout._handle.setBlocking(true);
    }
  } catch {
    // ignore
  }
}

say('[repair] start');
say('[repair] script loaded — preparing...');

const dryRun = process.argv.includes('--dry-run');
if (dryRun) say('[repair] dry-run mode (no DB writes)');

const TEXT_FIELDS = [
  'prefix', 'first_name', 'last_name', 'full_name', 'phone', 'email', 'line_id', 'facebook',
  'gender', 'age', 'birth_date', 'nationality', 'religion', 'height', 'weight', 'marital_status',
  'military_status', 'vehicle', 'driving_license', 'driving_ability', 'address', 'province', 'intro',
  'desired_positions', 'desired_work_area', 'job_type', 'expected_salary', 'available_start',
];
const JSON_FIELDS = ['education', 'work_experience', 'hard_skills', 'soft_skills', 'language_skills'];

function blank(value) {
  return value == null || String(value).trim() === '';
}

function needsRepair(row) {
  return blank(row.phone) || blank(row.email) || blank(row.gender) || blank(row.age)
    || blank(row.address) || blank(row.province) || blank(row.desired_positions)
    || blank(row.expected_salary) || !Array.isArray(row.education) || row.education.length === 0
    || !Array.isArray(row.work_experience) || row.work_experience.length === 0;
}

function validEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) ? email : '';
}

/**
 * Patch one existing candidate by id — never invents, never retargets another row.
 * Intentionally does NOT change dedupe_key (unique) — filling phone/email from
 * raw_text often collides with another candidate's phone:/email: key.
 */
async function patchCandidateById(client, stringifyForJsonb, id, parsed) {
  const phoneNorm = String(parsed.phone ?? '').replace(/\D/g, '');
  const emailNorm = validEmail(parsed.email);
  const sets = [];
  const params = [id];

  for (const col of TEXT_FIELDS) {
    const value = col === 'full_name' ? (parsed.name ?? '') : (parsed[col] ?? '');
    params.push(String(value ?? ''));
    sets.push(`${col} = COALESCE(NULLIF($${params.length}, ''), ${col})`);
  }
  for (const col of JSON_FIELDS) {
    params.push(stringifyForJsonb(parsed[col]));
    sets.push(`${col} = CASE WHEN $${params.length}::jsonb <> '[]'::jsonb AND COALESCE(jsonb_array_length(${col}), 0) = 0 THEN $${params.length}::jsonb ELSE ${col} END`);
  }
  params.push(phoneNorm);
  sets.push(`phone_norm = COALESCE(NULLIF($${params.length}, ''), phone_norm)`);
  params.push(emailNorm);
  sets.push(`email_norm = COALESCE(NULLIF($${params.length}, ''), email_norm)`);
  sets.push('last_updated_at = now()');

  await client.query(`UPDATE candidates SET ${sets.join(', ')} WHERE id = $1`, params);
}

async function main() {
  say('[repair] loading dotenv / parser / db ...');
  const heartbeat = setInterval(() => {
    say('[repair] still loading modules (cheerio/pg) ...');
  }, 2000);

  let dotenv;
  let fillMissingFromRawText;
  let getPool;
  let closePool;
  let withTransaction;
  let stringifyForJsonb;
  try {
    const mods = await Promise.all([
      import('dotenv'),
      import('../src/providers/jobbkk/parser.js'),
      import('../src/db/pool.js'),
      import('../src/db/repositories.js'),
    ]);
    dotenv = mods[0].default;
    fillMissingFromRawText = mods[1].fillMissingFromRawText;
    getPool = mods[2].getPool;
    closePool = mods[2].closePool;
    withTransaction = mods[2].withTransaction;
    stringifyForJsonb = mods[3].stringifyForJsonb;
  } finally {
    clearInterval(heartbeat);
  }
  say('[repair] modules loaded');

  const rootEnv = resolve(process.cwd(), '.env');
  const webEnv = resolve(process.cwd(), 'web/.env');
  if (existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv, override: true });
    say('[repair] loaded root .env');
  } else {
    say('[repair] root .env NOT found');
  }
  if (existsSync(webEnv)) {
    dotenv.config({ path: webEnv });
    say('[repair] loaded web/.env');
  }

  const hasDb = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGPASSWORD));
  say(`[repair] DB config: ${hasDb ? 'ok' : 'MISSING'}`);
  if (!hasDb) throw new Error('Need .env with PGHOST/PGPASSWORD or DATABASE_URL');

  say(`[repair] target: ${process.env.PGHOST || 'DATABASE_URL'} schema=${process.env.DB_SCHEMA || 'so-candidate-data'}`);
  say('[repair] connecting DB (15s timeout)...');
  const pool = getPool();
  await Promise.race([
    pool.query('SELECT 1 AS ok'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB connect timeout 15s — check VPN/network/.env')), 15_000)),
  ]);
  say('[repair] DB connected — scanning incomplete resumes...');

  const { rows } = await pool.query(`
    SELECT c.*, s.raw_text, s.platform, s.source_url, s.external_id, s.parse_status
      FROM candidates c
      JOIN candidate_sources s ON s.candidate_id = c.id
     WHERE s.raw_text IS NOT NULL AND length(trim(s.raw_text)) > 40
       AND (
         COALESCE(NULLIF(trim(c.phone), ''), '') = ''
         OR COALESCE(NULLIF(trim(c.email), ''), '') = ''
         OR COALESCE(NULLIF(trim(c.gender), ''), '') = ''
         OR COALESCE(NULLIF(trim(c.age), ''), '') = ''
         OR COALESCE(NULLIF(trim(c.address), ''), '') = ''
         OR COALESCE(NULLIF(trim(c.desired_positions), ''), '') = ''
         OR COALESCE(NULLIF(trim(c.expected_salary), ''), '') = ''
         OR COALESCE(jsonb_array_length(c.education), 0) = 0
         OR COALESCE(jsonb_array_length(c.work_experience), 0) = 0
       )
     ORDER BY c.last_updated_at DESC
     LIMIT 2000
  `);
  say(`[repair] candidates to check: ${rows.length}`);

  let scanned = 0;
  let repaired = 0;
  let filledFields = 0;
  let failed = 0;
  const sample = [];
  const errors = [];

  try {
    for (const row of rows) {
      scanned += 1;
      if (!needsRepair(row)) continue;
      const before = Object.fromEntries(TEXT_FIELDS.map((key) => [key, row[key]]));
      const parsed = {
        name: row.full_name || '',
        ...Object.fromEntries(TEXT_FIELDS.filter((key) => key !== 'full_name').map((key) => [key, row[key] ?? ''])),
        education: Array.isArray(row.education) ? row.education : [],
        work_experience: Array.isArray(row.work_experience) ? row.work_experience : [],
        hard_skills: Array.isArray(row.hard_skills) ? row.hard_skills : [],
        soft_skills: Array.isArray(row.soft_skills) ? row.soft_skills : [],
        language_skills: Array.isArray(row.language_skills) ? row.language_skills : [],
      };
      fillMissingFromRawText(parsed, row.raw_text);
      if (!parsed.name && row.full_name) parsed.name = row.full_name;

      const changed = [];
      for (const key of TEXT_FIELDS) {
        const target = key === 'full_name' ? 'name' : key;
        const next = parsed[target] ?? '';
        if (blank(before[key]) && !blank(next)) changed.push(key);
      }
      if ((!Array.isArray(row.education) || row.education.length === 0) && parsed.education?.length) {
        changed.push('education');
      }
      if ((!Array.isArray(row.work_experience) || row.work_experience.length === 0) && parsed.work_experience?.length) {
        changed.push('work_experience');
      }
      if (!changed.length) continue;

      if (dryRun) {
        repaired += 1;
        filledFields += changed.length;
        if (sample.length < 8) sample.push({ id: row.id, fields: changed });
        continue;
      }

      try {
        await withTransaction(async (client) => {
          await patchCandidateById(client, stringifyForJsonb, row.id, parsed);
          if (parsed.phone || parsed.email || (parsed.education?.length) || (parsed.work_experience?.length)
              || parsed.gender || parsed.age || parsed.desired_positions) {
            await client.query(
              `UPDATE candidate_sources
                  SET parse_status = CASE
                        WHEN $2 <> '' OR $3 <> '' THEN 'success'
                        ELSE COALESCE(parse_status, 'partial')
                      END,
                      last_seen_at = now()
                WHERE candidate_id = $1 AND platform = $4`,
              [row.id, parsed.phone || '', parsed.email || '', row.platform],
            );
          }
        });
        repaired += 1;
        filledFields += changed.length;
        if (sample.length < 8) sample.push({ id: row.id, fields: changed });
        if (repaired % 25 === 0) say(`[repair] repaired ${repaired}...`);
      } catch (error) {
        failed += 1;
        if (errors.length < 12) errors.push({ id: row.id, error: error.message });
        say(`[repair] skip id=${row.id}: ${error.message}`);
      }
    }

    say(JSON.stringify({ dryRun, scanned, repaired, failed, filledFields, sample, errors }, null, 2));
    say('[repair] done');
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  say(`[repair] FAILED: ${error.message}`);
  process.exitCode = 1;
});
