import { getJobbkkSession } from './session.js';
import { fetchResumeHtml, isResumeAuthBlocked, resumeDetailUrl, searchResumeIds } from './client.js';
import { parseResumeHtml } from './parser.js';
import { collectAssetsForDb } from './assets.js';

export const jobbkkProvider = {
  id: 'jobbkk',
  label: 'JobBKK',

  getSession: getJobbkkSession,
  isResumeAuthBlocked,
  searchResumeIds,
  fetchResumeHtml,
  resumeDetailUrl,
  parseResumeHtml,
  collectAssetsForDb,

  /** Stable external id for this platform = the resume data-id. */
  externalId(url) {
    return (String(url ?? '').match(/\/preview(?:_new)?\/(\d+)/i) || [])[1] || '';
  },
};
