import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSuccessfulScrapeTaskResult } from '../src/core/scrape-task-result.js';

test('queue accepts a completed or partial scrape task result', () => {
  const done = { status: 'done', matchedTotal: 15, target: 15 };
  const partial = { status: 'partial', matchedTotal: 7, target: 15 };
  assert.equal(requireSuccessfulScrapeTaskResult(done), done);
  assert.equal(requireSuccessfulScrapeTaskResult(partial), partial);
});

test('queue rejects a scrape task that failed internally', () => {
  assert.throws(
    () => requireSuccessfulScrapeTaskResult({ status: 'error', error: 'search timeout' }),
    /search timeout/,
  );
});

test('queue rejects a scrape task that never acquired execution ownership', () => {
  assert.throws(
    () => requireSuccessfulScrapeTaskResult({ skipped: true, reason: 'task_already_running' }),
    /task_already_running/,
  );
});
