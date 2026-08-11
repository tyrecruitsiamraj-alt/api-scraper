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
