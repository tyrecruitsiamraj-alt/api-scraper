import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STUCK_JARVIS_SCRAPES_SQL, STUCK_REQUEUE_NOTE, stuckScrapeAction } from '../src/core/jarvis-scrape-status.js';

// 26 พ.ย. 2569: LAO6909004 สั่งตอนไม่มีเครื่องเปิด ค้าง "กำลังทำ" 6 วัน · LAO6910025/OPL6910026 งานหลุดตอนเครื่องค้าง
const row = {
  request_no: 'LAO6909004',
  task_id: '1435a0c2-2ad4-4c64-b028-0a93ff18deae',
  connector_id: '8e1c7893-89a5-4adc-869a-2592776bf3ad',
  platform: 'jobthai',
  enabled: true,
  already_requeued: false,
  owner_user: 'jarvis:requester',
  criteria: { position: 'แม่บ้าน', preferred_worker: 'SONB-RM009' },
};

test('a stuck Jarvis scrape is queued again once, on the machine the order chose', () => {
  const plan = stuckScrapeAction(row);
  assert.equal(plan.action, 'requeue');
  assert.equal(plan.notes, STUCK_REQUEUE_NOTE);
  assert.match(plan.notes, /^รอคิว: /);
  const [key, taskId, payload, owner, worker] = plan.params;
  assert.equal(key, 'jobthai:8e1c7893-89a5-4adc-869a-2592776bf3ad');
  assert.equal(taskId, row.task_id);
  assert.equal(JSON.parse(payload).auto_requeue, true);
  assert.equal(JSON.parse(payload).position, 'แม่บ้าน');
  assert.equal(owner, row.owner_user);
  assert.equal(worker, 'SONB-RM009');
  assert.equal(stuckScrapeAction({ ...row, criteria: {} }).params[4], null);
});

test('stuck again after the automatic requeue, or switched off, is rejected with a reason to order again', () => {
  const again = stuckScrapeAction({ ...row, already_requeued: true });
  assert.equal(again.action, 'reject');
  assert.match(again.notes, /^ตีกลับ: .*กรุณาสั่งใหม่$/);
  const off = stuckScrapeAction({ ...row, enabled: false });
  assert.equal(off.action, 'reject');
  assert.match(off.notes, /^ตีกลับ: /);
});

test('only orders with no queued or running scrape job, not running or finished, idle for 15 minutes are picked', () => {
  assert.match(STUCK_JARVIS_SCRAPES_SQL, /l\.status = 'in_progress'/);
  assert.match(STUCK_JARVIS_SCRAPES_SQL, /l\.updated_at < now\(\) - interval '15 minutes'/);
  assert.match(STUCK_JARVIS_SCRAPES_SQL, /t\.status NOT IN \('running', 'done', 'partial'\)/);
  assert.match(STUCK_JARVIS_SCRAPES_SQL, /NOT EXISTS \(SELECT 1 FROM work_queue w WHERE w\.ref_id = t\.id::text AND w\.type = 'scrape' AND w\.status IN \('queued', 'running'\)\)/);
  assert.match(STUCK_JARVIS_SCRAPES_SQL, /w\.created_at >= l\.created_at AND w\.payload->>'auto_requeue' = 'true'/);
});

test('the runner checks for stuck orders on every Jarvis sync, under one lock', () => {
  const src = fs.readFileSync(new URL('../workers/runner.js', import.meta.url), 'utf8');
  assert.match(src, /await completeJarvisScrapes\(\);\s*await recoverStuckJarvisScrapes\(\);/);
  assert.match(src, /pg_try_advisory_xact_lock\(hashtext\('jarvis-stuck-scrapes'\)\)/);
  assert.match(src, /await client\.query\(WAIT_JARVIS_SCRAPE_SQL, \[row\.task_id, plan\.notes\]\);/);
  assert.match(src, /await client\.query\(REJECT_JARVIS_SCRAPE_SQL, \[row\.task_id, plan\.notes\]\);/);
});
