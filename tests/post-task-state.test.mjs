import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPostTaskGroups, postTaskStage } from '../src/core/post-task-state.js';

const plan = ['g1', 'g2', 'g3', 'g4'].map((group_id) => ({ group_id }));
const at = (min) => new Date(Date.UTC(2026, 9, 21, 1, min)).toISOString();

test('running run: posted, failed, posting and waiting groups in plan order', () => {
  const { groups, counts, current } = buildPostTaskGroups({
    plan,
    runStatus: 'running',
    attempts: [
      { group_id: 'g1', level: 'info', kind: 'group_start', at: at(1) },
      { group_id: 'g1', level: 'success', at: at(2) },
      { group_id: 'g2', level: 'info', kind: 'group_start', at: at(3) },
      { group_id: 'g2', level: 'warn', message: 'โพสต์ไม่สำเร็จ', at: at(4) },
      { group_id: 'g3', level: 'info', kind: 'group_start', at: at(5) },
    ],
    postLogs: [{ group_id: 'g1', post_link: 'https://fb/p/1', post_status: 'รออนุมัติ', comment_count: 3, reactions: 7, shares: 1, created_at: at(2) }],
  });
  assert.deepEqual(groups.map((g) => g.status), ['posted', 'failed', 'posting', 'waiting']);
  assert.deepEqual(counts, { planned: 4, posted: 1, failed: 1, posting: 1, not_member: 0, waiting: 1, skipped: 0 });
  assert.equal(current.order, 3);
  assert.equal(groups[0].post_link, 'https://fb/p/1');
  assert.equal(groups[0].reactions, 7);
  assert.equal(groups[1].error, 'โพสต์ไม่สำเร็จ');
  assert.equal(groups[3].comments, null);
  assert.equal(postTaskStage('running', counts, current).label, 'กำลังโพสต์กลุ่มที่ 3/4');
});

test('finished run: started-without-result counts as failed, untouched groups as skipped', () => {
  const { groups, counts } = buildPostTaskGroups({
    plan,
    runStatus: 'completed',
    attempts: [
      { group_id: 'g1', level: 'success', at: at(2) },
      { group_id: 'g2', level: 'info', kind: 'group_start', at: at(3) },
    ],
  });
  assert.deepEqual(groups.map((g) => g.status), ['posted', 'failed', 'skipped', 'skipped']);
  assert.equal(counts.skipped, 2);
  assert.equal(postTaskStage('completed', counts).state, 'done');
});

test('old run without a plan log uses the groups it attempted', () => {
  const { groups } = buildPostTaskGroups({
    runStatus: 'completed',
    attempts: [{ group_id: '873884635154852', level: 'success', at: at(1) }],
    groupName: (id) => `Group ${id}`,
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Group 873884635154852');
  assert.equal(groups[0].status, 'posted');
});

test('a retry after a failure shows the latest result', () => {
  const { groups } = buildPostTaskGroups({
    plan: [{ group_id: 'g1' }],
    runStatus: 'running',
    attempts: [
      { group_id: 'g1', level: 'warn', at: at(1) },
      { group_id: 'g1', level: 'info', kind: 'group_start', at: at(2) },
    ],
  });
  assert.equal(groups[0].status, 'posting');
});

test('completed run where every group failed is a failed stage', () => {
  assert.equal(postTaskStage('completed', { planned: 2, posted: 0, failed: 2 }).state, 'failed');
  assert.equal(postTaskStage('queued').label, 'รอเครื่องรับงาน');
});

test('a group skipped for membership is not_member, not failed', () => {
  const { groups, counts } = buildPostTaskGroups({
    plan: [{ group_id: 'g1' }, { group_id: 'g2' }],
    runStatus: 'completed',
    attempts: [
      { group_id: 'g1', level: 'info', kind: 'group_start', at: at(1) },
      { group_id: 'g1', level: 'warn', kind: 'join', message: 'ยังไม่ได้เป็นสมาชิก ส่งคำขอเข้ากลุ่มแล้ว รอแอดมินอนุมัติ (กลุ่ม g1)', at: at(2) },
      { group_id: 'g2', level: 'success', at: at(3) },
    ],
  });
  assert.equal(groups[0].status, 'not_member');
  assert.match(groups[0].error, /รอแอดมินอนุมัติ/);
  assert.equal(counts.failed, 0);
  assert.equal(counts.not_member, 1);
  assert.equal(postTaskStage('completed', counts).state, 'done');
});

test('a join warn without "ยังไม่ได้เป็นสมาชิก" is failed with its reason', () => {
  const { groups, counts } = buildPostTaskGroups({
    plan: [{ group_id: 'g1' }],
    runStatus: 'completed',
    attempts: [
      { group_id: 'g1', level: 'info', kind: 'group_start', at: at(1) },
      { group_id: 'g1', level: 'warn', kind: 'join', message: 'ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม (กลุ่ม g1)', at: at(2) },
    ],
  });
  assert.equal(groups[0].status, 'failed');
  assert.match(groups[0].error, /ไม่เจอช่องเขียนโพสต์/);
  assert.equal(counts.not_member, 0);
  assert.equal(counts.failed, 1);
});
