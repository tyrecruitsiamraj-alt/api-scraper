import { jobbkkProvider } from '../providers/jobbkk/index.js';
import { jobthaiProvider } from '../providers/jobthai/index.js';

/**
 * Platform → provider implementation. Add new platforms here.
 * Connectors (DB rows) reference a platform; many connectors can share one
 * provider (e.g. several JobBKK accounts).
 */
const PROVIDERS = {
  jobbkk: jobbkkProvider,
  jobthai: jobthaiProvider,
};

export function resolveProvider(platform) {
  const p = PROVIDERS[String(platform || '').toLowerCase()];
  if (!p) throw new Error(`No provider for platform "${platform}" (available: ${Object.keys(PROVIDERS).join(', ')})`);
  return p;
}

export function listProviderPlatforms() {
  return Object.keys(PROVIDERS);
}
