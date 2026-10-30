import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyScrapeTaskResult, requireSuccessfulScrapeTaskResult } from '../src/core/scrape-task-result.js';

test('queue accepts a completed or partial scrape task result', () => {
  const done = { status: 'done', matchedTotal: 15, target: 15 };
  const partial = { status: 'partial', matchedTotal: 7, target: 15 };
  assert.equal(requireSuccessfulScrapeTaskResult(done), done);
  assert.equal(requireSuccessfulScrapeTaskResult(partial), partial);
});

test('แยกตลาดมีคนไม่พอออกจากระบบขัดข้อง', () => {
  assert.equal(classifyScrapeTaskResult({ status: 'done', matchedTotal: 15, target: 15 }), 'completed');
  assert.equal(classifyScrapeTaskResult({ status: 'partial', matchedTotal: 7, target: 15 }), 'market_insufficient');
  assert.equal(classifyScrapeTaskResult({ status: 'error', error: 'login failed' }), 'infrastructure_error');
});

test('queue rejects a scrape task that failed internally', () => {
  assert.throws(
    () => requireSuccessfulScrapeTaskResult({ status: 'error', error: 'search timeout' }),
    /search timeout/,
  );
});

test('คิวซ้ำของงานที่อีกช่องรันอยู่แล้ว: ปิดเงียบ ไม่ลองใหม่', () => {
  const dup = { skipped: true, reason: 'task_already_running' };
  assert.equal(requireSuccessfulScrapeTaskResult(dup), dup);
  assert.equal(classifyScrapeTaskResult(dup), 'already_running');
});

test('งานที่ข้ามด้วยเหตุอื่นยังนับว่าล้ม', () => {
  assert.throws(() => requireSuccessfulScrapeTaskResult({ skipped: true, reason: 'something_else' }), /something_else/);
});

test('บัญชีถูกพัก: คิวรอจนพ้นเวลาพัก ไม่ลองใหม่ทันที', () => {
  const until = '2026-10-29T10:00:00.000Z';
  try {
    requireSuccessfulScrapeTaskResult({ status: 'error', runStatus: 'cooldown', cooldownUntil: until, error: 'บัญชีถูกพัก' });
    assert.fail('ต้อง throw');
  } catch (e) {
    assert.equal(e.retryAt.toISOString(), until);
  }
});

test('คนกดปิดงานระหว่างรัน = หยุด ไม่ใช่ระบบขัดข้อง', () => {
  const stopped = { status: 'stopped', matchedTotal: 3 };
  assert.equal(requireSuccessfulScrapeTaskResult(stopped), stopped);
  assert.equal(classifyScrapeTaskResult(stopped), 'stopped');
});
