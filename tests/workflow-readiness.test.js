import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowReadiness } from '../src/core/workflow-readiness.js';

const readyInput = {
  workers: [
    { kind: 'scraper', online: true, meta: { types: ['draft', 'measure'] } },
    { kind: 'autopost', online: true, meta: {} },
  ],
  facebookAccounts: [{ group_count: 3 }],
  queue: { queued: 0, stale_running: 0, errors_24h: 0 },
  postQueue: { queued: 0, running: 0, failed_24h: 0 },
  inconsistentCampaigns: 0,
  lastSelftest: { status: 'done', finished_at: '2026-08-04T08:00:00.000Z' },
};

test('พร้อมครบทุก dependency ได้สถานะ ready', () => {
  const result = evaluateWorkflowReadiness(readyInput);
  assert.equal(result.status, 'ready');
  assert.equal(result.score, 100);
});

test('worker สร้างประกาศออฟไลน์ถูกบล็อก', () => {
  const result = evaluateWorkflowReadiness({ ...readyInput, workers: readyInput.workers.slice(1) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'content_worker')?.status, 'fail');
});

test('คิวเกิน 10 นาทีถูกมองว่าเป็นงานค้าง', () => {
  const result = evaluateWorkflowReadiness({ ...readyInput, queue: { queued: 2, oldest_queued_minutes: 45 } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'work_queue')?.status, 'fail');
});

test('สถานะไม่ตรงกับระบบต้นทางถูกบล็อก', () => {
  const result = evaluateWorkflowReadiness({ ...readyInput, inconsistentCampaigns: 1 });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'source_alignment')?.status, 'fail');
});
