const SITE_PHONE_BLACKLIST = new Set(['025147474', '025147447']);
const SITE_EMAIL_BLACKLIST = new Set(['help@jobbkk.com', 'sales@jobbkk.com']);

export function resumeIdFromUrl(url) {
  const s = String(url ?? '');
  const jobbkk = s.match(/\/preview(?:_new)?\/(\d+)/i);
  if (jobbkk?.[1]) return jobbkk[1];
  const jobthai = s.match(/\/resume\/\d+,(\d+)/i);
  if (jobthai?.[1]) return jobthai[1];
  return '';
}

export function isSitePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return SITE_PHONE_BLACKLIST.has(digits);
}

export function isSiteEmail(email) {
  return SITE_EMAIL_BLACKLIST.has(String(email ?? '').trim().toLowerCase());
}

/** Default dedupe — providers may override via `provider.dedupeKey`. */
export function defaultDedupeKey(candidate) {
  const resumeId = resumeIdFromUrl(candidate.source_url);
  if (resumeId) return `resume:${resumeId}`;

  const phone = String(candidate.phone ?? '').replace(/\D/g, '');
  if (phone && !isSitePhone(phone)) return `phone:${phone}`;

  const email = String(candidate.email ?? '').trim().toLowerCase();
  if (email && !isSiteEmail(email)) return `email:${email}`;

  const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ');
  if (name) return `name:${name}`;

  return `raw:${candidate.source_url ?? candidate.raw_text?.slice(0, 80) ?? ''}`;
}
