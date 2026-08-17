import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowReadiness } from '../src/core/workflow-readiness.js';

const readyInput = {
  workers: [
    { kind: 'scraper', online: true, meta: { types: ['draft', 'measure'], image_generation: { configured: true, model: 'gpt-image-2' } } },
    { kind: 'autopost', online: true, meta: { capabilities: ['post', 'preflight'] } },
  ],
  facebookAccounts: [{ group_count: 3 }],
  queue: { queued: 0, stale_running: 0, errors_24h: 0 },
  postQueue: { queued: 0, running: 0, failed_24h: 0 },
  contentOutput: { passing_with_image: 1, verified_generation: 1, failed_quality: 0 },
  scrapeOutput: { completed: 1, partial: 0, error: 0 },
  recentPostRuns: [{ status: 'completed' }],
  inconsistentCampaigns: 0,
  lastSelftest: { status: 'done', finished_at: '2026-08-04T08:00:00.000Z' },
};

test('พร้อมครบทุก dependency ได้สถานะ ready', () => {
  const result = evaluateWorkflowReadiness(readyInput);
  assert.equal(result.status, 'ready');
  assert.equal(result.score, 100);
});

test('Facebook ล้มเหลวติดต่อกันถูกบล็อกแม้ worker online', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    recentPostRuns: [{ status: 'failed' }, { status: 'failed' }, { status: 'failed' }],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'recent_errors')?.status, 'fail');
});

test('preflight ที่ผ่านห้ามล้างสถิติโพสต์จริงที่ล้มเหลวติดต่อกัน', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    recentPostRuns: [
      { status: 'completed', mode: 'preflight' },
      { status: 'failed', mode: 'post' },
      { status: 'failed', mode: 'post' },
      { status: 'failed', mode: 'post' },
    ],
  });
  assert.equal(result.status, 'blocked');
  assert.match(result.checks.find((x) => x.code === 'recent_errors')?.message ?? '', /3 ครั้ง/);
});

test('worker สร้างประกาศออฟไลน์ถูกบล็อก', () => {
  const result = evaluateWorkflowReadiness({ ...readyInput, workers: readyInput.workers.slice(1) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'content_worker')?.status, 'fail');
});

test('worker รุ่นเก่าที่ไม่มี Golden Flow capability ถูกบล็อก ไม่ใช่เพียง warning', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    workers: [
      { kind: 'scraper', online: true, meta: { types: ['scrape', 'draft', 'measure', 'selftest'] } },
      readyInput.workers[1],
    ],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'image_provider')?.status, 'fail');
});

test('คิวเกิน 10 นาทีถูกมองว่าเป็นงานค้าง', () => {
  const result = evaluateWorkflowReadiness({ ...readyInput, queue: { queued: 2, oldest_queued_minutes: 45 } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'work_queue')?.status, 'fail');
});

test('heartbeat ที่เดินแต่ไม่มีผลค้นหาใหม่ถูกมองว่าเป็นงานค้าง', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    queue: { queued: 0, stale_running: 0, stalled_progress: 1, errors_24h: 0 },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'work_queue')?.status, 'fail');
  assert.match(result.checks.find((x) => x.code === 'work_queue')?.message ?? '', /heartbeat/);
});

test('สถานะไม่ตรงกับระบบต้นทางถูกบล็อก', () => {
  const result = evaluateWorkflowReadiness({ ...readyInput, inconsistentCampaigns: 1 });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'source_alignment')?.status, 'fail');
});
