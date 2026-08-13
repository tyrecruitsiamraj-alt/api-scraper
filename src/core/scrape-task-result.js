/**
 * Convert a scrape-task result into a queue-safe terminal result.
 * The work queue may only report `done` after the inner scrape task actually ran
 * and reached a non-error terminal state.
 */
export function requireSuccessfulScrapeTaskResult(result) {
  if (result?.skipped) {
    throw new Error(`scrape task was not executed: ${result.reason || 'already running'}`);
  }
  if (!result || result.status === 'error') {
    throw new Error(result?.error || 'scrape task failed without a terminal result');
  }
  return result;
}

/**
 * Definition of Done ฝั่งธุรกิจ:
 * - completed = ได้ Resume ผ่านเกณฑ์ครบจำนวน
 * - market_insufficient = connector ทำงานจบ แต่ค้นใน Job Family แล้วได้ไม่ครบ
 * - infrastructure_error = login/browser/connector/ฐานข้อมูลล้มเหลว
 */
export function classifyScrapeTaskResult(result) {
  if (!result || result?.skipped || result.status === 'error') return 'infrastructure_error';
  if (result.status === 'partial') return 'market_insufficient';
  return 'completed';
}
