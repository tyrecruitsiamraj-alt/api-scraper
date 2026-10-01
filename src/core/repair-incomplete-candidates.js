/**
 * Repair incomplete candidate rows from stored source raw_text + OCR.
 * Never invents values — only fills blank fields already present in text,
 * contact tokens in OCR, or an explicit Thai/English name prefix.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contactsFromText } from './contacts.js';
import {
  finalizeCandidateRecord,
  hasUsefulEducation,
  hasUsefulWorkExperience,
  isJunkEducationRow,
  isJunkWorkRow,
  isMangledWorkRow,
} from '../providers/jobbkk/parser.js';

const PROVINCE_NAMES = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = JSON.parse(readFileSync(join(here, '../providers/jobbkk/provinces.json'), 'utf8'));
    return Object.values(raw.provinces || {}).map((name) => String(name).trim()).filter(Boolean);
  } catch {
    return ['กรุงเทพมหานคร', 'สมุทรปราการ', 'นนทบุรี', 'ปทุมธานี', 'ชลบุรี'];
  }
})();
const PROVINCE_BY_LENGTH = [...PROVINCE_NAMES].sort((a, b) => b.length - a.length);

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

/**
 * SQL regex for JobBKK login/register chrome inside work_experience jsonb.
 * Keep specific — bare "เข้าสู่ระบบ" / "jobbkk" match real job duties (e.g. คีย์เข้าสู่ระบบ).
 */
export const WORK_CHROME_SQL_RE = [
  'register_page',
  'username_hint',
  'max_case',
  'no_html',
  'employer_login',
  'help@jobbkk\\.com',
  'sales@jobbkk\\.com',
  'บริษัท\\s*จัดหางาน\\s*จ๊อบบีเคเค',
  'JOBBKK\\.COM',
  'คุณจะไม่สามารถเข้าสู่ระบบ',
  'สมัครสมาชิกไม่สำเร็จ',
  'ไม่อนุญาตให้ใช้',
  'สำหรับผู้ประกอบการเท่านั้น',
  'Resume\\s*-\\s*View\\s*Credit',
  'Credit\\s*ที่ใช้แล้ว',
  'สามารถดูหรือติดต่อได้',
].join('|');

/** Glued labels inside company/position — desk shows unreadable blobs. */
export const WORK_MANGLED_SQL_RE = [
  'เงินเดือน\\s*\\(?บาท\\)?\\s*[:：]?',
  'ประเภทธุรกิจ\\s*[:：]?',
  'รายละเอียดงาน',
  'หน้าที่-ผลงาน',
  'ระยะเวลา\\s*[:：]',
  'ตำแหน่ง(?:งาน)?\\s*[:：]',
  '^ตำแหน่ง(?:งาน)?\\s+',
  'Resume\\s*-\\s*View\\s*Credit',
  'Credit\\s*ที่ใช้แล้ว',
  'สามารถดูหรือติดต่อได้',
  'บันทึก\\s*ยกเลิก\\s*นัดสัมภาษณ์',
  'นัดสัมภาษณ์\\s*ตำแหน่งงาน',
].join('|');

function blank(value) {
  return value == null || String(value).trim() === '';
}

/** Bare quotes / punctuation left by bad parses — treat as empty for repair. */
export function isJunkText(value) {
  const text = String(value ?? '').trim();
  return !text || /^["'\\.\-_/]+$/.test(text);
}

function validEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

export function needsRepair(row) {
  const work = Array.isArray(row.work_experience) ? row.work_experience : [];
  const education = Array.isArray(row.education) ? row.education : [];
  const hasJunkWork = work.some((item) => isJunkWorkRow(item) || isMangledWorkRow(item));
  const hasJunkEducation = education.some((item) => isJunkEducationRow(item));
  const junkAddress = /JOBBKK\s*TEST|เทสระบบสมัครงาน/i.test(String(row.address || ''));
  const junkDesired = /เทสระบบสมัครงาน|เรซูเม่นี้สำหรับใช้ทดสอบระบบ/i.test(String(row.desired_positions || ''));
  return blank(row.phone) || blank(row.email) || blank(row.gender) || blank(row.age)
    || blank(row.address) || isJunkText(row.province) || blank(row.desired_positions)
    || blank(row.expected_salary)
    || !hasUsefulEducation(row.education)
    || !hasUsefulWorkExperience(row.work_experience)
    || hasJunkWork
    || hasJunkEducation
    || junkAddress
    || junkDesired;
}

/** Resolve province from address / desired area / raw text using JobBKK province list. */
export function resolveProvinceFromRow(row = {}, combinedText = '') {
  if (!isJunkText(row.province) && PROVINCE_NAMES.includes(String(row.province).trim())) {
    return String(row.province).trim();
  }
  const chunks = [
    row.address,
    row.desired_work_area,
    combinedText,
  ].map((part) => String(part || '').trim()).filter(Boolean);
  for (const chunk of chunks) {
    const labeled = chunk.match(/จังหวัด\s*([ก-๙]+)/u)?.[1];
    if (labeled) {
      const hit = PROVINCE_BY_LENGTH.find((name) => name === labeled || name.includes(labeled) || labeled.includes(name));
      if (hit) return hit;
    }
    const metro = chunk.match(/([ก-๙]+มหานคร)/u)?.[1];
    if (metro && PROVINCE_NAMES.includes(metro)) return metro;
    for (const name of PROVINCE_BY_LENGTH) {
      if (chunk.includes(name)) return name;
    }
  }
  // Last token before postcode: "… สมุทรปราการ 10270"
  for (const chunk of chunks) {
    const m = chunk.replace(/\s*ประเทศไทย\s*$/u, '').match(/([ก-๙][ก-๙.\s]*?)\s+(\d{5})\s*$/u);
    if (!m?.[1]) continue;
    const last = m[1].trim().split(/\s+/).filter(Boolean).pop() || '';
    const hit = PROVINCE_BY_LENGTH.find((name) => name === last || name.endsWith(last) || last.includes(name));
    if (hit) return hit;
  }
  return '';
}

function jsonbFillExpression(col, paramIndex) {
  // Replace empty arrays, and also year-only / blank work or education stubs.
  if (col === 'work_experience') {
    // Replace empty/year-only stubs, login chrome, and glued company/position blobs.
    const junkRow = `e::text ~* '${WORK_CHROME_SQL_RE}'
      OR COALESCE(e->>'company','') ~* '${WORK_MANGLED_SQL_RE}'
      OR COALESCE(e->>'position','') ~* '${WORK_MANGLED_SQL_RE}'`;
    return `${col} = CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(${col}, '[]'::jsonb)) e WHERE ${junkRow}
      ) THEN $${paramIndex}::jsonb
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
    const junkEdu = `e::text ~* 'JOBBKK\\.COM|JOBBKK\\s*TEST|เทสระบบสมัครงาน|register_page|username_hint'`;
    return `${col} = CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(${col}, '[]'::jsonb)) e WHERE ${junkEdu}
      ) THEN $${paramIndex}::jsonb
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
    if (col === 'province') {
      // Replace blank OR junk tags like " so a real province can land.
      sets.push(`${col} = CASE
        WHEN $${params.length} <> '' AND (
          NULLIF(trim(COALESCE(${col}, '')), '') IS NULL
          OR trim(${col}) ~ '^["''\\\\.\\-_/]+$'
        ) THEN $${params.length}
        ELSE COALESCE(NULLIF($${params.length}, ''), ${col})
      END`);
    } else if (col === 'address' || col === 'desired_positions') {
      // Clear JobBKK test-resume placeholders even when the repaired value is empty.
      sets.push(`${col} = CASE
        WHEN $${params.length} <> '' THEN $${params.length}
        WHEN COALESCE(${col}, '') ~* 'JOBBKK\\s*TEST|เทสระบบสมัครงาน|เรซูเม่นี้สำหรับใช้ทดสอบระบบ'
          THEN ''
        ELSE ${col}
      END`);
    } else {
      sets.push(`${col} = COALESCE(NULLIF($${params.length}, ''), ${col})`);
    }
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
         COALESCE((
           SELECT string_agg(s2.raw_text, E'\\n' ORDER BY length(COALESCE(s2.raw_text, '')) DESC)
             FROM candidate_sources s2
            WHERE s2.candidate_id = c.id
              AND s2.raw_text IS NOT NULL
              AND length(trim(s2.raw_text)) > 40
         ), '') AS source_raw_text,
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
    JOIN LATERAL (
      SELECT s0.platform, s0.source_url, s0.external_id, s0.parse_status, s0.raw_text
        FROM candidate_sources s0
       WHERE s0.candidate_id = c.id
       ORDER BY length(COALESCE(s0.raw_text, '')) DESC, s0.last_seen_at DESC NULLS LAST
       LIMIT 1
    ) s ON TRUE
   WHERE (
       length(trim(COALESCE((
         SELECT string_agg(s2.raw_text, E'\\n')
           FROM candidate_sources s2
          WHERE s2.candidate_id = c.id
            AND s2.raw_text IS NOT NULL
            AND length(trim(s2.raw_text)) > 40
       ), ''))) > 40
       OR EXISTS (
         SELECT 1 FROM candidate_assets a
          WHERE a.candidate_id = c.id
            AND a.extract_status = 'success'
            AND a.extracted_text IS NOT NULL
            AND length(trim(a.extracted_text)) > 20
       )
       -- Province-only repair can use address / desired_work_area without long raw_text.
       OR NULLIF(trim(COALESCE(c.address, '')), '') IS NOT NULL
       OR NULLIF(trim(COALESCE(c.desired_work_area, '')), '') IS NOT NULL
     )
     AND (
       COALESCE(NULLIF(trim(c.phone), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.email), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.gender), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.age), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.address), ''), '') = ''
       OR COALESCE(NULLIF(trim(c.province), ''), '') = ''
       OR (
         NULLIF(trim(c.province), '') IS NOT NULL
         AND trim(c.province) !~ '[ก-๙]'
       )
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
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(c.work_experience, '[]'::jsonb)) e
          WHERE e::text ~* '${WORK_CHROME_SQL_RE}'
             OR COALESCE(e->>'company','') ~* '${WORK_MANGLED_SQL_RE}'
             OR COALESCE(e->>'position','') ~* '${WORK_MANGLED_SQL_RE}'
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(c.education, '[]'::jsonb)) e
          WHERE e::text ~* 'JOBBKK\\.COM|JOBBKK\\s*TEST|เทสระบบสมัครงาน'
       )
       OR COALESCE(c.address,'') ~* 'JOBBKK\\s*TEST|เทสระบบสมัครงาน'
       OR COALESCE(c.desired_positions,'') ~* 'เทสระบบสมัครงาน|เรซูเม่นี้สำหรับใช้ทดสอบระบบ'
     )
   ORDER BY c.last_updated_at DESC
   LIMIT $1
`;

function remainingGaps(row, parsed) {
  const gaps = [];
  for (const key of ['phone', 'email', 'gender', 'age', 'address', 'province', 'desired_positions', 'expected_salary']) {
    const after = key === 'full_name' ? parsed.name : parsed[key];
    const before = row[key];
    const beforeEmpty = key === 'province' ? isJunkText(before) : blank(before);
    const afterEmpty = key === 'province' ? isJunkText(after) : blank(after);
    if (beforeEmpty && afterEmpty) gaps.push(key);
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

  if (isJunkText(parsed.province)) {
    parsed.province = resolveProvinceFromRow({
      ...row,
      address: parsed.address || row.address,
      desired_work_area: parsed.desired_work_area || row.desired_work_area,
      province: '',
    }, combinedText);
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
    const beforeHadJunkWork = Array.isArray(row.work_experience)
      && row.work_experience.some((item) => isJunkWorkRow(item) || isMangledWorkRow(item));
    const beforeUsefulEdu = hasUsefulEducation(row.education);
    const beforeHadJunkEdu = Array.isArray(row.education)
      && row.education.some((item) => isJunkEducationRow(item));
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
      const beforeVal = before[key];
      const beforeJunkTest = (key === 'address' || key === 'desired_positions')
        && /JOBBKK\s*TEST|เทสระบบสมัครงาน|เรซูเม่นี้สำหรับใช้ทดสอบระบบ/i.test(String(beforeVal || ''));
      const beforeEmpty = key === 'province' ? isJunkText(beforeVal) : (blank(beforeVal) || beforeJunkTest);
      const nextOk = key === 'province' ? !isJunkText(next) : !blank(next);
      if (beforeEmpty && nextOk) changed.push(key);
      else if (beforeJunkTest && blank(next)) changed.push(key);
    }
    if ((!beforeUsefulEdu && hasUsefulEducation(parsed.education))
        || (beforeHadJunkEdu && !parsed.education.some((item) => isJunkEducationRow(item)))) {
      changed.push('education');
    }
    if ((!beforeUsefulWork && hasUsefulWorkExperience(parsed.work_experience))
        || (beforeHadJunkWork && !parsed.work_experience.some((item) => isJunkWorkRow(item) || isMangledWorkRow(item)))) {
      changed.push('work_experience');
    }
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
          // Do NOT bump last_seen_at here — legacy quota counters keyed off it and
          // repair would falsely exhaust the JobBKK daily cap.
          await client.query(
            `UPDATE candidate_sources
                SET parse_status = CASE
                      WHEN $2 <> '' OR $3 <> '' THEN 'success'
                      ELSE COALESCE(parse_status, 'partial')
                    END
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
