/**
 * Repair incomplete candidate rows from stored source raw_text + OCR.
 * Never invents values — only fills blank fields already present in text,
 * contact tokens in OCR, or an explicit Thai/English name prefix.
 */
import { contactsFromText } from './contacts.js';
import {
  finalizeCandidateRecord,
  hasUsefulEducation,
  hasUsefulWorkExperience,
} from '../providers/jobbkk/parser.js';

/** PostgreSQL jsonb cannot store the Unicode NUL escape (\\u0000). */
function stringifyForJsonb(value) {
  return JSON.stringify(value ?? [], (_key, current) => (
    typeof current === 'string' ? current.replace(/\u0000/g, '') : current
  ));
}

export const REPAIR_TEXT_FIELDS = [
  'prefix', 'first_name', 'last_name', 'full_name', 'phone', 'email', 'line_id', 'facebook',
  'gender', 'age', 'birth_date', 'nationality', 'religion', 'height', 'weight', 'marital_status',
  'military_status', 'vehicle', 'driving_license', 'driving_ability', 'address', 'province', 'intro',
  'desired_positions', 'desired_work_area', 'job_type', 'expected_salary', 'available_start',
];
export const REPAIR_JSON_FIELDS = ['education', 'work_experience', 'hard_skills', 'soft_skills', 'language_skills'];

function blank(value) {
  return value == null || String(value).trim() === '';
}

function validEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

export function needsRepair(row) {
  return blank(row.phone) || blank(row.email) || blank(row.gender) || blank(row.age)
    || blank(row.address) || blank(row.province) || blank(row.desired_positions)
    || blank(row.expected_salary)
    || !hasUsefulEducation(row.education)
    || !hasUsefulWorkExperience(row.work_experience);
}

function jsonbFillExpression(col, paramIndex) {
  // Replace empty arrays, and also year-only / blank work or education stubs.
  if (col === 'work_experience') {
    return `${col} = CASE
      WHEN $${paramIndex}::jsonb = '[]'::jsonb THEN ${col}
      WHEN COALESCE(jsonb_array_length(${col}), 0) = 0 THEN $${paramIndex}::jsonb
      WHEN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(${col}, '[]'::jsonb)) e
         WHERE NULLIF(trim(e->>'company'), '') IS NOT NULL
            OR NULLIF(trim(e->>'position'), '') IS NOT NULL
      ) THEN $${paramIndex}::jsonb
      ELSE ${col}
    END`;
  }
  if (col === 'education') {
    return `${col} = CASE
      WHEN $${paramIndex}::jsonb = '[]'::jsonb THEN ${col}
      WHEN COALESCE(jsonb_array_length(${col}), 0) = 0 THEN $${paramIndex}::jsonb
      WHEN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(${col}, '[]'::jsonb)) e
         WHERE NULLIF(trim(e->>'institution'), '') IS NOT NULL
            OR NULLIF(trim(e->>'degree'), '') IS NOT NULL
            OR NULLIF(trim(e->>'major'), '') IS NOT NULL
      ) THEN $${paramIndex}::jsonb
      ELSE ${col}
    END`;
  }
  return `${col} = CASE WHEN $${paramIndex}::jsonb <> '[]'::jsonb AND COALESCE(jsonb_array_length(${col}), 0) = 0 THEN $${paramIndex}::jsonb ELSE ${col} END`;
}

async function patchCandidateById(client, id, parsed) {
  const phoneNorm = String(parsed.phone ?? '').replace(/\D/g, '');
  const emailNorm = validEmail(parsed.email);
  const sets = [];
  const params = [id];

  for (const col of REPAIR_TEXT_FIELDS) {
    const value = col === 'full_name' ? (parsed.name ?? '') : (parsed[col] ?? '');
    params.push(String(value ?? ''));
    sets.push(`${col} = COALESCE(NULLIF($${params.length}, ''), ${col})`);
  }
  for (const col of REPAIR_JSON_FIELDS) {
    params.push(stringifyForJsonb(parsed[col]));
    sets.push(jsonbFillExpression(col, params.length));
  }
  params.push(phoneNorm);
  sets.push(`phone_norm = COALESCE(NULLIF($${params.length}, ''), phone_norm)`);
  params.push(emailNorm);
  sets.push(`email_norm = COALESCE(NULLIF($${params.length}, ''), email_norm)`);
  sets.push('last_updated_at = now()');

  await client.query(`UPDATE candidates SET ${sets.join(', ')} WHERE id = $1`, params);
}

const INCOMPLETE_SQL = `
  SELECT c.*,
         s.raw_text AS source_raw_text,
         s.platform, s.source_url, s.external_id, s.parse_status,
         COALESCE((
           SELECT string_agg(a.extracted_text, E'\\n' ORDER BY a.created_at)
             FROM candidate_assets a
            WHERE a.candidate_id = c.id
              AND a.extract_status = 'success'
              AND a.extracted_text IS NOT NULL
              AND length(trim(a.extracted_text)) > 20
         ), '') AS ocr_text
    FROM candidates c
    JOIN candidate_sources s ON s.candidate_id = c.id
   WHERE (
       (s.raw_text IS NOT NULL AND length(trim(s.raw_text)) > 40)
       OR EXISTS (
         SELECT 1 FROM candidate_assets a
          WHERE a.candidate_id = c.id
            AND a.extract_status = 'success'
            AND a.extracted_text IS NOT NULL
            AND length(trim(a.extracted_text)) > 20
       )
     )
     AND (
       COALESCE(NULLIF(trim(c.phone), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.email), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.gender), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.age), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.address), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.desired_positions), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.expected_salary), ''), '') = ''
       OR COALESCE(jsonb_array_length(c.education), 0) = 0
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(c.education, '[]'::jsonb)) e
          WHERE NULLIF(trim(e->>'institution'), '') IS NOT NULL
             OR NULLIF(trim(e->>'degree'), '') IS NOT NULL
             OR NULLIF(trim(e->>'major'), '') IS NOT NULL
       )
       OR COALESCE(jsonb_array_length(c.work_experience), 0) = 0
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(c.work_experience, '[]'::jsonb)) e
          WHERE NULLIF(trim(e->>'company'), '') IS NOT NULL
             OR NULLIF(trim(e->>'position'), '') IS NOT NULL
       )
     )
   ORDER BY c.last_updated_at DESC
   LIMIT $1
`;

function remainingGaps(row, parsed) {
  const gaps = [];
  for (const key of ['phone', 'email', 'gender', 'age', 'address', 'province', 'desired_positions', 'expected_salary']) {
    const after = key === 'full_name' ? parsed.name : parsed[key];
    const before = row[key];
    if (blank(before) && blank(after)) gaps.push(key);
  }
  if (!hasUsefulEducation(parsed.education)) gaps.push('education');
  if (!hasUsefulWorkExperience(parsed.work_experience)) gaps.push('work_experience');
  return gaps;
}

/** Gender from an explicit name prefix already stored on the row (not invented). */
export function genderFromPrefix(prefix, fullName = '') {
  // Thai letters are non-word chars in JS, so avoid \\b — match start of prefix/name.
  const sources = [String(prefix || '').trim(), String(fullName || '').trim()].filter(Boolean);
  for (const source of sources) {
    if (/^(นางสาว|น\.ส\.?|ด\.ญ\.|ดญ\.|Mrs\.?|Miss\.?|Ms\.?)/i.test(source)) return 'หญิง';
    if (/^นาง(?!สาว)/.test(source)) return 'หญิง';
    if (/^(นาย|ด\.ช\.|ดช\.|Mr\.?)/i.test(source)) return 'ชาย';
  }
  return '';
}

/** Extra OCR/contact fills that the JobBKK label parser may miss. */
function applyOcrAndPrefixFills(parsed, row, combinedText) {
  const contacts = contactsFromText(combinedText);
  if (blank(parsed.phone) && contacts.phone) parsed.phone = contacts.phone;
  if (blank(parsed.email) && contacts.email) parsed.email = contacts.email;
  if (blank(parsed.line_id) && contacts.line_id) parsed.line_id = contacts.line_id;

  if (blank(parsed.gender)) {
    const fromLabel = String(combinedText).match(/เพศ\s*[:：]?\s*(ชาย|หญิง)/u)?.[1]
      || String(combinedText).match(/\bGender\s*[:：]?\s*(Male|Female)\b/i)?.[1]
      || '';
    if (/^male$/i.test(fromLabel)) parsed.gender = 'ชาย';
    else if (/^female$/i.test(fromLabel)) parsed.gender = 'หญิง';
    else if (fromLabel) parsed.gender = fromLabel;
  }
  if (blank(parsed.gender)) {
    parsed.gender = genderFromPrefix(row.prefix || parsed.prefix, row.full_name || parsed.name);
  }

  if (blank(parsed.expected_salary)) {
    const salary = String(combinedText).match(
      /(?:เงินเดือน(?:ที่ต้องการ)?|Expected\s*Salary|Salary)\s*[:：]?\s*([\d,][\d,\s-]*\d)/iu,
    )?.[1];
    if (salary) parsed.expected_salary = salary.replace(/\s+/g, '');
  }
}

/**
 * @param {{ query: Function, withTransaction: Function }} db
 * @param {{ dryRun?: boolean, limit?: number, onProgress?: Function }} [opts]
 */
export async function repairIncompleteCandidates(db, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 2000);
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const { rows } = await db.query(INCOMPLETE_SQL, [limit]);
  let scanned = 0;
  let repaired = 0;
  let filledFields = 0;
  let failed = 0;
  let unrepaired = 0;
  let withOcr = 0;
  let ocrChars = 0;
  const sample = [];
  const errors = [];
  const gapCounts = {};

  for (const row of rows) {
    scanned += 1;
    if (!needsRepair(row)) continue;
    const before = Object.fromEntries(REPAIR_TEXT_FIELDS.map((key) => [key, row[key]]));
    const beforeUsefulWork = hasUsefulWorkExperience(row.work_experience);
    const beforeUsefulEdu = hasUsefulEducation(row.education);
    const ocrPart = String(row.ocr_text || '').trim();
    if (ocrPart.length > 20) {
      withOcr += 1;
      ocrChars += ocrPart.length;
    }
    const combinedText = [row.source_raw_text || row.raw_text || '', ocrPart]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join('\n');
    const parsed = finalizeCandidateRecord({
      name: row.full_name || '',
      ...Object.fromEntries(REPAIR_TEXT_FIELDS.filter((key) => key !== 'full_name').map((key) => [key, row[key] ?? ''])),
      education: Array.isArray(row.education) ? row.education : [],
      work_experience: Array.isArray(row.work_experience) ? row.work_experience : [],
      hard_skills: Array.isArray(row.hard_skills) ? row.hard_skills : [],
      soft_skills: Array.isArray(row.soft_skills) ? row.soft_skills : [],
      language_skills: Array.isArray(row.language_skills) ? row.language_skills : [],
      raw_text: combinedText,
    });
    if (!parsed.name && row.full_name) parsed.name = row.full_name;
    applyOcrAndPrefixFills(parsed, row, combinedText);

    const changed = [];
    for (const key of REPAIR_TEXT_FIELDS) {
      const target = key === 'full_name' ? 'name' : key;
      const next = parsed[target] ?? '';
      if (blank(before[key]) && !blank(next)) changed.push(key);
    }
    if (!beforeUsefulEdu && hasUsefulEducation(parsed.education)) changed.push('education');
    if (!beforeUsefulWork && hasUsefulWorkExperience(parsed.work_experience)) changed.push('work_experience');
    if (!changed.length) {
      unrepaired += 1;
      for (const gap of remainingGaps(row, parsed)) {
        gapCounts[gap] = (gapCounts[gap] || 0) + 1;
      }
      continue;
    }

    if (dryRun) {
      repaired += 1;
      filledFields += changed.length;
      if (sample.length < 8) sample.push({ id: row.id, fields: changed });
      continue;
    }

    try {
      await db.withTransaction(async (client) => {
        await patchCandidateById(client, row.id, parsed);
        if (parsed.phone || parsed.email || hasUsefulEducation(parsed.education) || hasUsefulWorkExperience(parsed.work_experience)
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
      if (repaired % 25 === 0) onProgress({ repaired, scanned });
    } catch (error) {
      failed += 1;
      if (errors.length < 12) errors.push({ id: row.id, error: error.message });
      onProgress({ repaired, scanned, failed, lastError: error.message });
    }
  }

  return {
    dryRun,
    limit,
    scanned,
    repaired,
    unrepaired,
    failed,
    filledFields,
    withOcr,
    ocrChars,
    sample,
    errors,
    unrepairedGapCounts: gapCounts,
    hasMore: rows.length >= limit,
  };
}
