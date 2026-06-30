/**
 * Placeholder provider — implement login/search/parse per platform later.
 */
export function createStubProvider(id, label) {
  const notReady = (step) => {
    throw new Error(`[${id}] ${step} ยังไม่ implement — รอเพิ่ม provider สำหรับ ${label}`);
  };

  return {
    id,
    label,
    source: id,
    loadConfig() {
      return { platform: id };
    },
    preflight() {
      return {
        warnings: [`${label} ยังเป็น stub — ยัง scrape ไม่ได้`],
        errors: [],
      };
    },
    collectCriteria: () => notReady('collectCriteria'),
    prepareSession: () => notReady('prepareSession'),
    applyFilters: () => notReady('applyFilters'),
    runSearch: () => notReady('runSearch'),
    collectResumeLinks: () => notReady('collectResumeLinks'),
    parseResumeDetailPage: () => notReady('parseResumeDetailPage'),
    downloadAssets: () => notReady('downloadAssets'),
  };
}
