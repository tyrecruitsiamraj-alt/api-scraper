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
  process.stdout.write(`${message}\n`);
}

// Print BEFORE any heavy import so a hang is never silent on Windows.
say('[repair] เริ่มซ่อม Resume ที่ไม่ครบ...');

const dryRun = process.argv.includes('--dry-run');
if (dryRun) say('[repair] โหมด dry-run — จะไม่เขียนลง DB');

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

/** Patch one existing candidate by id — never invents, never retargets another row. */
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
  if (phoneNorm) {
    params.push(`phone:${phoneNorm}`);
    sets.push(`dedupe_key = $${params.length}`);
  } else if (emailNorm) {
    params.push(`email:${emailNorm}`);
    sets.push(`dedupe_key = CASE WHEN phone_norm = '' OR phone_norm IS NULL THEN $${params.length} ELSE dedupe_key END`);
  }
  sets.push('last_updated_at = now()');

  await client.query(`UPDATE candidates SET ${sets.join(', ')} WHERE id = $1`, params);
}

async function main() {
  say('[repair] กำลังโหลด dotenv / parser / db...');
  const [{ default: dotenv }, parser, poolMod, repo] = await Promise.all([
    import('dotenv'),
    import('../src/providers/jobbkk/parser.js'),
    import('../src/db/pool.js'),
    import('../src/db/repositories.js'),
  ]);
  const { fillMissingFromRawText } = parser;
  const { getPool, closePool, withTransaction } = poolMod;
  const { stringifyForJsonb } = repo;

  const rootEnv = resolve(process.cwd(), '.env');
  const webEnv = resolve(process.cwd(), 'web/.env');
  if (existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv, override: true });
    say('[repair] โหลด .env ที่รากโปรเจกต์แล้ว');
  } else {
    say('[repair] ไม่พบ .env ที่รากโปรเจกต์');
  }
  if (existsSync(webEnv)) {
    dotenv.config({ path: webEnv });
    say('[repair] โหลด web/.env แล้ว');
  }

  const hasDb = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGPASSWORD));
  say(`[repair] การตั้งค่า DB: ${hasDb ? 'พบค่าเชื่อมต่อ' : 'ไม่ครบ'}`);
  if (!hasDb) throw new Error('ต้องมี .env (PGHOST/PGPASSWORD หรือ DATABASE_URL)');

  say(`[repair] เป้าหมาย DB: ${process.env.PGHOST || 'DATABASE_URL'} / schema=${process.env.DB_SCHEMA || 'so-candidate-data'}`);
  say('[repair] กำลังเชื่อมต่อฐานข้อมูล (timeout 15 วินาที)...');
  const pool = getPool();
  await Promise.race([
    pool.query('SELECT 1 AS ok'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('ต่อ DB ไม่สำเร็จภายใน 15 วินาที — เช็กเน็ต/VPN/.env')), 15_000)),
  ]);
  say('[repair] เชื่อมต่อ DB ได้ กำลังค้น Resume ที่ไม่ครบ...');

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
  say(`[repair] พบผู้สมัครที่เข้าข่าย ${rows.length} คน`);

  let scanned = 0;
  let repaired = 0;
  let filledFields = 0;
  const sample = [];

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
        if (blank(before[key]) && !blank(next)) {
          changed.push(key);
          filledFields += 1;
        }
      }
      if ((!Array.isArray(row.education) || row.education.length === 0) && parsed.education?.length) {
        changed.push('education');
        filledFields += 1;
      }
      if ((!Array.isArray(row.work_experience) || row.work_experience.length === 0) && parsed.work_experience?.length) {
        changed.push('work_experience');
        filledFields += 1;
      }
      if (!changed.length) continue;

      repaired += 1;
      if (sample.length < 8) sample.push({ id: row.id, fields: changed });
      if (repaired % 25 === 0) say(`[repair] ซ่อมแล้ว ${repaired} คน...`);

      if (dryRun) continue;
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
    }

    say(JSON.stringify({ dryRun, scanned, repaired, filledFields, sample }, null, 2));
    say('[repair] เสร็จแล้ว');
  } finally {
    await closePool();
  }
}

// Always run when invoked via `node scripts/...` (Windows path URL compare is unreliable).
main().catch((error) => {
  say(`[repair] ล้มเหลว: ${error.message}`);
  process.exitCode = 1;
});
