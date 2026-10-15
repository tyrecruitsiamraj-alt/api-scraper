/**
 * Shared Thai/English name-prefix splitting for JobBKK, JobThai, and repair.
 * Longest-match first so นางสาว wins over นาง.
 */

export const THAI_NAME_PREFIXES = [
  'นางสาว', 'Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'ดร.',
  'น.ส.', 'น.ส', 'ด.ช.', 'ด.ญ.', 'ดช.', 'ดญ.', 'นาย', 'นาง',
];

/** Alternation for regex — longest titles first. */
export const THAI_NAME_PREFIX_ALT = 'นางสาว|น\\.ส\\.?|Mr\\.?|Mrs\\.|Miss|Ms\\.|Dr\\.|ดร\\.|ด\\.ช\\.?|ด\\.ญ\\.?|ดช\\.|ดญ\\.|นาย|นาง';

const clean = (value) => (
  value == null
    ? ''
    : String(value).replace(/\u00a0/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
);

/** Map OCR/label variants onto the canonical list entry. */
export function normalizeNamePrefix(value) {
  const text = clean(value).replace(/\s+/g, '');
  if (!text) return '';
  if (isKnownNamePrefix(text)) return text;
  const lowered = text.toLowerCase();
  for (const prefix of [...THAI_NAME_PREFIXES].sort((a, b) => b.length - a.length)) {
    if (prefix.toLowerCase() === lowered) return prefix;
    if (prefix.replace(/\./g, '').toLowerCase() === lowered.replace(/\./g, '')) return prefix;
  }
  return '';
}

/**
 * Read an explicit คำนำหน้า label from resume text (JobThai often keeps the
 * title in its own field while ชื่อ/นามสกุล stay bare).
 */
export function extractExplicitNamePrefix(text) {
  const src = String(text || '');
  if (!src.trim()) return '';
  const labeled = src.match(new RegExp(
    `คำนำหน้า\\s*[:：]?\\s*(${THAI_NAME_PREFIX_ALT})(?![ก-๙A-Za-z.])`,
    'iu',
  ));
  if (labeled?.[1]) return normalizeNamePrefix(labeled[1]);
  return '';
}

/** Exact known title only — mangled values like "นายสมชาย" return false. */
export function isKnownNamePrefix(value) {
  const text = clean(value);
  if (!text) return false;
  return THAI_NAME_PREFIXES.some((prefix) => prefix === text);
}

/**
 * Split "นาย สมชาย ใจดี" / glued "นายสมชาย ใจดี" into prefix + first + last.
 * Glued strip requires a remainder of at least 2 chars (avoids นายก → นาย + ก).
 */
export function splitThaiFullName(fullName) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  let prefix = '';
  if (parts.length) {
    const sorted = [...THAI_NAME_PREFIXES].sort((a, b) => b.length - a.length);
    for (const candidate of sorted) {
      const head = parts[0];
      if (head === candidate) {
        prefix = parts.shift();
        break;
      }
      if (head.startsWith(candidate)) {
        const rest = head.slice(candidate.length);
        if (rest.length >= 2) {
          prefix = candidate;
          parts[0] = rest;
          break;
        }
      }
    }
  }
  const first_name = parts[0] ?? '';
  const last_name = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const name = [prefix, first_name, last_name].filter(Boolean).join(' ');
  return { prefix, first_name, last_name, name };
}

/**
 * True when we can recover a real title the row is missing/mangling.
 * Pass raw resume text when full_name has no title but JobThai labeled คำนำหน้า.
 */
export function namePrefixNeedsFix(row = {}, rawText = '') {
  const current = clean(row.prefix);
  const full = clean(row.full_name || row.name || '');
  const raw = String(rawText || row.source_raw_text || row.raw_text || '');
  const fromRaw = extractExplicitNamePrefix(raw);
  const split = full ? splitThaiFullName(full) : { prefix: '', first_name: '', last_name: '' };

  if (!current) {
    if (split.prefix || fromRaw) return true;
    return false;
  }
  if (!isKnownNamePrefix(current)) return true;
  if (split.prefix && current !== split.prefix) return true;
  if (fromRaw && current !== fromRaw) return true;
  const first = clean(row.first_name);
  if (!first && split.first_name) return true;
  // Classic JobBKK bug: title ate the given name → first_name is actually the surname.
  if (first && split.first_name && first !== split.first_name
      && split.last_name && first === split.last_name) {
    return true;
  }
  return false;
}

/**
 * Apply split / explicit-label recovery onto a mutable record.
 * @param {object} record
 * @param {string} [rawText] optional resume text (JobThai คำนำหน้า field)
 */
export function applyThaiNameSplit(record = {}, rawText = '') {
  const source = clean(
    record.name
    || record.full_name
    || [record.first_name, record.last_name].filter(Boolean).join(' '),
  );
  const raw = String(rawText || record.raw_text || '');
  const explicit = extractExplicitNamePrefix(raw);
  const split = source ? splitThaiFullName(source) : { prefix: '', first_name: '', last_name: '', name: '' };

  if (!namePrefixNeedsFix({
    prefix: record.prefix,
    first_name: record.first_name,
    last_name: record.last_name,
    full_name: source,
  }, raw)) {
    if (!clean(record.first_name) && split.first_name) record.first_name = split.first_name;
    if (!clean(record.last_name) && split.last_name) record.last_name = split.last_name;
    if (!clean(record.prefix) && explicit) {
      record.prefix = explicit;
      record.name = [explicit, record.first_name || split.first_name, record.last_name || split.last_name]
        .filter(Boolean).join(' ');
    }
    return record;
  }

  const prefix = explicit || split.prefix || normalizeNamePrefix(record.prefix) || '';
  const first_name = split.first_name || clean(record.first_name);
  const last_name = split.last_name || clean(record.last_name);
  if (prefix) record.prefix = prefix;
  if (first_name) record.first_name = first_name;
  if (last_name || split.last_name !== undefined) record.last_name = last_name;
  record.name = [record.prefix, record.first_name, record.last_name].filter(Boolean).join(' ')
    || split.name
    || source;
  return record;
}
