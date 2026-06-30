/**
 * @typedef {Object} TalentScrapeProvider
 * @property {string} id
 * @property {string} label
 * @property {string} source - value stored in candidate.source field
 * @property {() => object} loadConfig - read platform config from env
 * @property {(config: object) => {warnings: string[], errors: string[]}} preflight
 * @property {(context: import('playwright').BrowserContext, defaultMax: number) => Promise<object>} collectCriteria
 * @property {(page: import('playwright').Page, config: object, debugMode?: boolean) => Promise<void>} prepareSession
 * @property {(page: import('playwright').Page, criteria: object, config: object) => Promise<object|null>} applyFilters
 * @property {(page: import('playwright').Page) => Promise<void>} runSearch
 * @property {(page: import('playwright').Page, debugMode?: boolean) => Promise<Array<{url: string, text?: string}>>} collectResumeLinks
 * @property {(page: import('playwright').Page, meta: object) => Promise<object>} parseResumeDetailPage
 * @property {(context: import('playwright').BrowserContext, parsed: object, candidateNo: string, outputDir: string, page: import('playwright').Page) => Promise<object>} downloadAssets
 * @property {(candidate: object) => string} [dedupeKey]
 */

export {};
