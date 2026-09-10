/**
 * Repair incomplete candidate rows from stored source raw_text.
 * Never invents values — only fills blank fields that the text already contains.
 *
 * Usage (on the Windows worker with .env):
 *   node scripts/repair-incomplete-candidates.mjs
 *   node scripts/repair-incomplete-candidates.mjs --dry-run
 */
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fillMissingFromRawText } from '../src/providers/jobbkk/parser.js';
import { getPool, closePool, withTransaction } from '../src/db/pool.js';
import { upsertCandidate } from '../src/db/repositories.js';

console.log('[repair] เริ่มซ่อม Resume ที่ไม่ครบ...');

const rootEnv = resolve(process.cwd(), '.env');
const webEnv = resolve(process.cwd(), 'web/.env');
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
  console.log('[repair] โหลด .env ที่รากโปรเจกต์แล้ว');
} else {
  console.log('[repair] ไม่พบ .env ที่รากโปรเจกต์');
}
if (existsSync(webEnv)) {
  dotenv.config({ path: webEnv });
  console.log('[repair] โหลด web/.env แล้ว');
}

const hasDb = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGPASSWORD));
console.log(`[repair] การตั้งค่า DB: ${hasDb ? 'พบค่าเชื่อมต่อ' : 'ไม่ครบ — ต้องมี .env (PGHOST/PGPASSWORD หรือ DATABASE_URL)'}`);
if (!hasDb) {
  console.error('[repair] หยุด เพราะไม่มีค่าเชื่อมฐานข้อมูล');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
if (dryRun) console.log('[repair] โหมด dry-run — จะไม่เขียนลง DB');

const TEXT_FIELDS = [
  'prefix', 'first_name', 'last_name', 'full_name', 'phone', 'email', 'line_id', 'facebook',
  'gender', 'age', 'birth_date', 'nationality', 'religion', 'height', 'weight', 'marital_status',
  'military_status', 'vehicle', 'driving_license', 'driving_ability', 'address', 'province', 'intro',
  'desired_positions', 'desired_work_area', 'job_type', 'expected_salary', 'available_start',
];

function blank(value) {
  return value == null || String(value).trim() === '';
}

function needsRepair(row) {
  return blank(row.phone) || blank(row.email) || blank(row.gender) || blank(row.age)
    || blank(row.address) || blank(row.province) || blank(row.desired_positions)
    || blank(row.expected_salary) || !Array.isArray(row.education) || row.education.length === 0
    || !Array.isArray(row.work_experience) || row.work_experience.length === 0;
}

async function main() {
  console.log('[repair] กำลังเชื่อมต่อฐานข้อมูล...');
  const pool = getPool();
  // Fail fast if the office network / VPN cannot reach Postgres.
  await Promise.race([
    pool.query('SELECT 1 AS ok'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('ต่อ DB ไม่สำเร็จภายใน 15 วินาที — เช็กเน็ต/.env')), 15_000)),
  ]);
  console.log('[repair] เชื่อมต่อ DB ได้ กำลังค้น Resume ที่ไม่ครบ...');

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
  console.log(`[repair] พบผู้สมัครที่เข้าข่าย ${rows.length} คน`);

  let scanned = 0;
  let repaired = 0;
  let filledFields = 0;
  const sample = [];

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
    if (repaired % 25 === 0) console.log(`[repair] ซ่อมแล้ว ${repaired} คน...`);

    if (dryRun) continue;
    await withTransaction(async (client) => {
      await upsertCandidate(client, parsed);
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

  console.log(JSON.stringify({
    dryRun,
    scanned,
    repaired,
    filledFields,
    sample,
  }, null, 2));
  console.log('[repair] เสร็จแล้ว');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main()
    .catch((error) => {
      console.error('[repair] ล้มเหลว:', error.message);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
