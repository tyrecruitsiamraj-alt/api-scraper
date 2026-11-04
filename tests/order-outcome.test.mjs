import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTCOMES, orderOutcome } from '../src/core/order-outcome.js';

const post = (jarvis_status, run_status = null, posted_groups = 0) => orderOutcome({ type: 'content', jarvis_status, run_status, posted_groups }).outcome;
const scrap = (jarvis_status, task_status = null, got = 0) => orderOutcome({ type: 'scraping', jarvis_status, task_status, got }).outcome;

test('ใบโพสต์: สถานะ Jarvis ที่จบแล้วตัดสินก่อน', () => {
  assert.equal(post('posted', 'running', 5), 'done');
  assert.equal(post('rejected', 'completed', 0), 'failed');
  assert.equal(post('pending'), 'waiting');
});

test('ใบโพสต์ที่กำลังดำเนินการ ดูจากรอบโพสต์', () => {
  assert.equal(post('in_progress', 'queued'), 'working');
  assert.equal(post('in_progress', 'running', 3), 'working');
  assert.equal(post('in_progress', 'completed', 4), 'done');
  assert.equal(post('in_progress', 'completed', 0), 'working');
  assert.equal(post('in_progress', null), 'working');
});

test('ใบ Scrap: ได้คนบางส่วนไม่นับว่าไม่สำเร็จ', () => {
  assert.equal(scrap('in_progress', 'partial', 3), 'partial');
  assert.equal(scrap('in_progress', 'partial', 0), 'failed');
  assert.equal(scrap('in_progress', 'error', 2), 'partial');
  assert.equal(scrap('in_progress', 'error', 0), 'failed');
  assert.equal(scrap('in_progress', 'done', 20), 'done');
  assert.equal(scrap('in_progress', 'running'), 'working');
  assert.equal(scrap('in_progress', 'idle'), 'waiting');
  assert.equal(scrap('in_progress', null), 'waiting');
  assert.equal(scrap('rejected', 'error'), 'failed');
});

test('ทุกผลมีคำไทยบอก ไม่ใช้สีอย่างเดียว', () => {
  assert.deepEqual(OUTCOMES.map((o) => o.key), ['waiting', 'working', 'done', 'partial', 'failed']);
  assert.ok(OUTCOMES.every((o) => o.label));
  assert.ok(orderOutcome({ type: 'content', jarvis_status: 'pending' }).stage);
});
