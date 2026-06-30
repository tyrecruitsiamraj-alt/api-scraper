import { jobbkkProvider } from './jobbkk/index.js';
import { jobdbProvider } from './jobdb/index.js';
import { facebookProvider } from './facebook/index.js';
import { jobthaiProvider } from './jobthai/index.js';

const PROVIDERS = {
  jobbkk: jobbkkProvider,
  jobthai: jobthaiProvider,
  jobdb: jobdbProvider,
  facebook: facebookProvider,
};

export const PLATFORM_IDS = Object.keys(PROVIDERS);

export function listPlatforms() {
  return PLATFORM_IDS.map((id) => ({ id, label: PROVIDERS[id].label }));
}

export function resolveProvider(platformId) {
  const id = String(platformId || 'jobbkk').trim().toLowerCase();
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown platform "${platformId}". Available: ${PLATFORM_IDS.join(', ')}`);
  }
  return provider;
}

export { PROVIDERS };
