import { jobbkkPreflight, loadJobbkkConfig } from './scrape-impl.js';
import * as impl from './scrape-impl.js';

export const jobbkkProvider = {
  id: 'jobbkk',
  label: 'JobBKK Resume Search Talent',
  source: 'resume_search_talent',

  loadConfig: loadJobbkkConfig,
  preflight: jobbkkPreflight,
  collectCriteria: impl.collectCriteria,
  prepareSession: impl.prepareSession,
  applyFilters: impl.applyFilters,
  runSearch: impl.runSearch,
  collectResumeLinks: impl.collectResumeLinks,
  parseResumeDetailPage: impl.parseResumeDetailPage,
  downloadAssets: impl.downloadAssets,
  dedupeKey: impl.dedupeKey,

  saveDebugPage: impl.saveDebugPage,
  saveResultLinks: impl.saveResultLinks,
  inspectPage: impl.inspectPage,
  logStep: impl.logStep,
  logCandidateSummary: impl.logCandidateSummary,
  formatEducationMarkdown: impl.formatEducationMarkdown,
  formatWorkExperienceMarkdown: impl.formatWorkExperienceMarkdown,
};
