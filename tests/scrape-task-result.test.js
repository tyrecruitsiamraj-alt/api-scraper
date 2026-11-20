import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyScrapeTaskResult, nextQuotaReset, requireSuccessfulScrapeTaskResult } from '../src/core/scrape-task-result.js';

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

// 20 พ.ย. 2569: โควต้า JobThai เต็ม 08:55 แล้วคำสั่ง 229 รายการถูกตีกลับ ลองซ้ำ 3 รอบทุกใบ — เจ้าของเคาะ: รอคิว ทำต่อวันถัดไปเอง
test('โควต้านับใหม่หลังเที่ยงคืนเวลาไทย 5 นาที', () => {
  assert.equal(nextQuotaReset(Date.parse('2026-11-20T08:55:00+07:00')).toISOString(), new Date('2026-11-21T00:05:00+07:00').toISOString());
  assert.equal(nextQuotaReset(Date.parse('2026-11-20T23:59:30+07:00')).toISOString(), new Date('2026-11-21T00:05:00+07:00').toISOString());
  assert.equal(nextQuotaReset(Date.parse('2026-11-21T00:01:00+07:00')).toISOString(), new Date('2026-11-22T00:05:00+07:00').toISOString());
});

test('โควต้าเต็ม = รอคิว ไม่นับเป็นรอบลองใหม่ · บัญชีถูกพัก = รอแบบเดิม', () => {
  const until = '2026-11-21T00:05:00+07:00';
  const wait = (waitReason) => {
    try {
      requireSuccessfulScrapeTaskResult({ status: 'error', runStatus: 'cooldown', cooldownUntil: until, waitReason, error: 'x' });
    } catch (e) {
      return e;
    }
    return null;
  };
  assert.equal(wait('daily_cap').waiting, true);
  assert.equal(wait('daily_cap').retryAt.toISOString(), new Date(until).toISOString());
  assert.equal(wait(null).waiting, false);
  const runner = fs.readFileSync(new URL('../workers/runner.js', import.meta.url), 'utf8');
  assert.match(runner, /if \(waiting && retryAt\) \{[\s\S]*?SET status='queued', worker_id=NULL, locked_at=NULL,\s+available_at=now\(\)/, 'รอคิวไม่แตะ attempts');
  assert.match(runner, /WAIT_JARVIS_SCRAPE_SQL/);
  const pipeline = fs.readFileSync(new URL('../src/pipeline.js', import.meta.url), 'utf8');
  assert.match(pipeline, /cooldownUntil = nextQuotaReset\(\)\.toISOString\(\);\s+waitReason = 'daily_cap';/);
  const worker = fs.readFileSync(new URL('../src/tasks-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /await finishTask\(t\.id, \{ status: 'queued', phase: 'idle', runId: r\.runId, error \}\);/);
});
