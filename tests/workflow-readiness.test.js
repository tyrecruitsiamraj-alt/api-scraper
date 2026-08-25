import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowReadiness } from '../src/core/workflow-readiness.js';

const readyInput = {
  workers: [
    { kind: 'scraper', online: true, meta: { types: ['draft', 'measure'], image_generation: { configured: true, model: 'gpt-image-2' } } },
    { kind: 'autopost', online: true, meta: { capabilities: ['post', 'preflight'] } },
  ],
  facebookAccounts: [{ group_count: 3, preflight_verified: true }],
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

test('Facebook preflight ที่ Worker รองรับแต่ Session หรือกลุ่มยังไม่ผ่าน ต้องบล็อก Readiness', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    facebookAccounts: [{ group_count: 1, preflight_verified: false }],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'facebook_preflight')?.status, 'fail');
  assert.match(result.checks.find((x) => x.code === 'facebook_preflight')?.message ?? '', /Session และกลุ่ม/);
});

test('Facebook Worker ที่รับได้เฉพาะ preflight ห้ามถูกนับว่าเผยแพร่จริงได้', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    workers: [
      readyInput.workers[0],
      { kind: 'autopost', online: true, meta: { capabilities: ['preflight'] } },
    ],
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'post_worker')?.status, 'fail');
  assert.match(result.checks.find((x) => x.code === 'post_worker')?.message ?? '', /capability post/);
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

test('worker คนละ commit กับ Production ถูกบล็อกแม้ capability ครบ', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    requiredBuildSha: 'new-build',
    workers: readyInput.workers.map((worker) => ({ ...worker, meta: { ...worker.meta, build_sha: 'old-build' } })),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'content_worker')?.status, 'fail');
  assert.equal(result.checks.find((x) => x.code === 'post_worker')?.status, 'fail');
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

test('ตลาดผู้สมัครไม่พอไม่ลดความพร้อมของระบบเมื่อไม่มี system error', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    scrapeOutput: { completed: 1, partial: 5, error: 0 },
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.score, 100);
  assert.match(result.checks.find((x) => x.code === 'scrape_output')?.message ?? '', /ตลาดยังไม่ครบ 5 งาน/);
});

test('system error ของการค้นหาผู้สมัครต้องบล็อก Production Readiness', () => {
  const result = evaluateWorkflowReadiness({
    ...readyInput,
    scrapeOutput: { completed: 1, partial: 0, error: 1 },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((x) => x.code === 'scrape_output')?.status, 'fail');
});
