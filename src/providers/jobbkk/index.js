import { getJobbkkSession, logoutJobbkk } from './session.js';
import { fetchResumeHtml, isResumeAuthBlocked, resumeDetailUrl } from './client.js';
import { browserSearchResumeIds } from './browser-search.js';
import { parseResumeHtml } from './parser.js';
import { collectAssetsForDb } from './assets.js';

export const jobbkkProvider = {
  id: 'jobbkk',
  label: 'JobBKK',

  // JobBKK only returns UNMASKED contact from a headful browser doing a real filtered
  // search (see browser-search.js). Headless login is bot-blocked, so force headful.
  headful: true,

  getSession: getJobbkkSession,
  logout: logoutJobbkk,
  isResumeAuthBlocked,
  // Browser-driven search — runs on the session's logged-in page (see browser-search.js).
  searchResumeIds: (session, criteria, runtime) => browserSearchResumeIds(session, criteria, runtime),
  fetchResumeHtml,
  resumeDetailUrl,
  parseResumeHtml,
  collectAssetsForDb,

  /** Stable external id for this platform = the resume data-id. */
  externalId(url) {
    return (String(url ?? '').match(/\/preview(?:_new)?\/(\d+)/i) || [])[1] || '';
  },
};
