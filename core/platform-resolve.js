export const PLATFORM_IDS = ['jobbkk', 'jobthai'];

export function normalizePlatformMode(value) {
  const v = String(value || 'jobbkk').trim().toLowerCase();
  if (v === 'both' || v === 'all') return 'both';
  if (PLATFORM_IDS.includes(v)) return v;
  return 'jobbkk';
}

export function resolvePlatforms(platformMode, envFallback = 'jobbkk') {
  const mode = normalizePlatformMode(platformMode || envFallback);
  if (mode === 'both') return [...PLATFORM_IDS];
  return [mode];
}

export function platformLabel(id) {
  if (id === 'jobthai') return 'JobThai';
  if (id === 'jobbkk') return 'JobBKK';
  return id;
}
