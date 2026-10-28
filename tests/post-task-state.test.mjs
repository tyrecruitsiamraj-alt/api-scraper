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
  // g1 กดโพสต์ได้ แต่ในกลุ่มยังรออนุมัติ → ไม่นับเป็นสำเร็จ
  assert.deepEqual(groups.map((g) => g.status), ['pending_approval', 'failed', 'posting', 'waiting']);
  assert.deepEqual(counts, { planned: 4, posted: 0, pending_approval: 1, unconfirmed: 0, failed: 1, posting: 1, not_member: 0, waiting: 1, skipped: 0 });
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
  // กดโพสต์ได้แต่ยังไม่มี post_log (ไม่มีลิงก์) = ยังไม่เจอในกลุ่ม ไม่นับเป็นสำเร็จ
  assert.deepEqual(groups.map((g) => g.status), ['unconfirmed', 'failed', 'skipped', 'skipped']);
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
  assert.equal(groups[0].status, 'unconfirmed');
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

test('posted outcome follows the real state in the group', async () => {
  const { postedOutcome } = await import('../src/core/post-task-state.js');
  assert.equal(postedOutcome('อนุมัติเเล้ว', 'https://www.facebook.com/groups/1/posts/2/'), 'posted');
  assert.equal(postedOutcome('รออนุมัติ', 'https://www.facebook.com/groups/1/posts/2/'), 'pending_approval');
  assert.equal(postedOutcome('ไม่พบลิงก์หลังโพสต์', ''), 'unconfirmed');
  assert.equal(postedOutcome(null, null), 'unconfirmed');
});

test('a finished run reports approval and unconfirmed groups, not just success', () => {
  const { counts } = buildPostTaskGroups({
    plan: [{ group_id: 'a' }, { group_id: 'b' }, { group_id: 'c' }],
    runStatus: 'completed',
    attempts: [
      { group_id: 'a', level: 'success', at: at(1) },
      { group_id: 'b', level: 'success', at: at(2) },
      { group_id: 'c', level: 'success', at: at(3) },
    ],
    postLogs: [
      { group_id: 'a', post_link: 'https://www.facebook.com/groups/a/posts/1/', post_status: 'อนุมัติเเล้ว', created_at: at(1) },
      { group_id: 'b', post_link: '', post_status: 'รออนุมัติ', created_at: at(2) },
      { group_id: 'c', post_link: '', post_status: 'ไม่พบลิงก์หลังโพสต์', created_at: at(3) },
    ],
  });
  assert.equal(counts.posted, 1);
  assert.equal(counts.pending_approval, 1);
  assert.equal(counts.unconfirmed, 1);
  assert.equal(postTaskStage('completed', counts).label, 'เสร็จ · รออนุมัติ 1 · ยังไม่เจอในกลุ่ม 1');
});
