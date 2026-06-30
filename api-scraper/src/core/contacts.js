/**
 * Pull contacts out of OCR'd resume text — used by the enrich phase to fill
 * fields the source site hides (e.g. email on a gated JobBKK view). Shared by
 * tasks-worker.js so tests exercise the exact production logic.
 */

/**
 * Strict LINE-id extraction. A loose /line/ match grabs the word "Line" out of
 * ordinary English prose (onLINE, deadLINE, bottom Line) → garbage like "-block".
 * Require a LINE context AND an id-shaped token (must contain a digit, '@' or '_';
 * plain dictionary words are rejected). Returns '' when not confident.
 */
// Words/fragments that signal junk, not a LINE id (CSS classes, error strings…).
const LINE_JUNK = /(error|null|none|undefined|align|txt|block|btn|class|style|width|height|color|margin|font|http|gmail|hotmail|yahoo)/i;

/** Validate a bare LINE-id token (used for every source: icon row, text, OCR). */
export function validLineId(value) {
  let v = String(value || '').trim().replace(/^[^A-Za-z0-9@]+/, '').replace(/[^A-Za-z0-9@._-]+$/, '');
  if (v.length < 3 || v.length > 30) return '';
  if (/^@?\d[\d-]{6,}$/.test(v)) return ''; // a phone number, not a LINE id
  if (!/[\d@_]/.test(v)) return ''; // plain dictionary words (block, mode, training…)
  if (LINE_JUNK.test(v)) return ''; // CSS-class / error-string leakage
  return v;
}

export function extractLineId(text) {
  const m = String(text || '').match(/(?:line\s*id|ไลน์\s*ไอดี|ไอดีไลน์|line|ไลน์)\s*[:：]?\s*(@?[A-Za-z0-9][A-Za-z0-9._-]{2,29})/i);
  return m ? validLineId(m[1]) : '';
}

export function contactsFromText(text) {
  const t = String(text || '');
  const email = (t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0] || '';
  const phoneRaw = (t.match(/\b0\d[\d -]{7,11}\d\b/) || [])[0] || '';
  return {
    email: /@jobbkk\.com$/i.test(email) ? '' : email,
    phone: phoneRaw.replace(/[ -]/g, ''),
    line_id: extractLineId(t),
  };
}
