import * as impl from './scrape-impl.js';

export const jobthaiProvider = {
  id: 'jobthai',
  label: 'JobThai Resume Search',
  source: 'jobthai_resume_search',

  loadConfig: impl.loadJobThaiConfig,
  preflight: impl.jobthaiPreflight,
  collectCriteria: impl.collectCriteria,
  prepareSession: impl.prepareSession,
  applyFilters: impl.applyFilters,
  runSearch: impl.runSearch,
  collectResumeLinks: impl.collectResumeLinks,
  parseResumeDetailPage: impl.parseResumeDetailPage,
  downloadAssets: impl.downloadAssets,
  dedupeKey: impl.jobthaiDedupeKey,

  saveDebugPage: impl.saveDebugPage,
  saveResultLinks: impl.saveResultLinks,
  logStep: impl.logStep,
  logCandidateSummary: impl.logCandidateSummary,
  formatEducationMarkdown: impl.formatEducationMarkdown,
  formatWorkExperienceMarkdown: impl.formatWorkExperienceMarkdown,
};
