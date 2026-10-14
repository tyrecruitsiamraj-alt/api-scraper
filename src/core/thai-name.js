/**
 * Shared Thai/English name-prefix splitting for JobBKK, JobThai, and repair.
 * Longest-match first so นางสาว wins over นาง.
 */

export const THAI_NAME_PREFIXES = [
  'นางสาว', 'Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'ดร.',
  'น.ส.', 'น.ส', 'ด.ช.', 'ด.ญ.', 'ดช.', 'ดญ.', 'นาย', 'นาง',
];

const clean = (value) => (
  value == null
    ? ''
    : String(value).replace(/\u00a0/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
);

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

/** True when full_name carries a title we should store but prefix is blank/mangled. */
export function namePrefixNeedsFix(row = {}) {
  const full = clean(row.full_name || row.name || '');
  if (!full) return false;
  const split = splitThaiFullName(full);
  if (!split.prefix) return false;
  const current = clean(row.prefix);
  if (!current) return true;
  if (!isKnownNamePrefix(current)) return true;
  if (current !== split.prefix) return true;
  const first = clean(row.first_name);
  if (!first && split.first_name) return true;
  // Classic JobBKK bug: title ate the given name → first_name is actually the surname.
  if (first && split.first_name && first !== split.first_name
      && split.last_name && first === split.last_name) {
    return true;
  }
  return false;
}

/** Apply split onto a mutable record when prefix/name parts need recovery. */
export function applyThaiNameSplit(record = {}) {
  const source = clean(record.name || record.full_name || '');
  if (!source) return record;
  const split = splitThaiFullName(source);
  if (!split.prefix && !split.first_name) return record;

  if (!namePrefixNeedsFix({
    prefix: record.prefix,
    first_name: record.first_name,
    full_name: source,
  })) {
    if (!clean(record.first_name) && split.first_name) record.first_name = split.first_name;
    if (!clean(record.last_name) && split.last_name) record.last_name = split.last_name;
    return record;
  }

  if (split.prefix) record.prefix = split.prefix;
  if (split.first_name) record.first_name = split.first_name;
  record.last_name = split.last_name;
  if (split.name) record.name = split.name;
  return record;
}
