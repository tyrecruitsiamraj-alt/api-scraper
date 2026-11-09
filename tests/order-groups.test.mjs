import test from 'node:test';
import assert from 'node:assert/strict';
import { orderGroupResults, countGroupStatuses, linkedCount } from '../src/core/order-groups.js';

const at = (m) => `2026-11-09T02:${String(m).padStart(2, '0')}:00Z`;

test('ใบ 5 กลุ่ม: ขึ้นแล้ว · รออนุมัติ · หาโพสต์ไม่เจอ · ไม่สำเร็จ · รอคิว — นับรวมเท่าจำนวนกลุ่ม', () => {
  const groups = orderGroupResults({
    planned: ['1481054599057270', '433203029287064', '448099235530340', '1398230516956714', '884533619479424'],
    attempts: [
      { group_id: '1481054599057270', level: 'success', message: null, at: at(1), account: 'Thom Blake' },
      { group_id: '433203029287064', level: 'success', message: null, at: at(2) },
      { group_id: '448099235530340', level: 'success', message: null, at: at(3) },
      { group_id: '1398230516956714', level: 'warn', message: 'Facebook ไม่รับโพสต์', at: at(4) },
    ],
    postLogs: [
      { group_id: '1481054599057270', post_link: 'https://facebook.com/groups/1481054599057270/posts/1', post_status: 'อนุมัติเเล้ว', at: at(1) },
      { group_id: '433203029287064', post_link: 'https://facebook.com/groups/433203029287064/posts/2', post_status: 'รออนุมัติ', at: at(2) },
      { group_id: '448099235530340', post_link: null, post_status: 'ไม่พบลิงก์หลังโพสต์', at: at(3) },
    ],
    active: true,
  });
  assert.deepEqual(groups.map((g) => g.status), ['posted', 'pending_approval', 'unconfirmed', 'failed', 'waiting']);
  assert.equal(groups[3].error, 'Facebook ไม่รับโพสต์');
  assert.equal(groups[0].account, 'Thom Blake');
  assert.deepEqual(countGroupStatuses(groups), { total: 5, posted: 1, pending_approval: 1, unconfirmed: 1, failed: 1, waiting: 1 });
  assert.equal(linkedCount(groups), 2, 'สำเร็จนับเฉพาะที่มีลิงก์');
});

test('ลองโพสต์ไม่ได้ก่อน แล้วบัญชีที่สลับมาโพสต์ได้ทีหลัง = ใช้ผลล่าสุด', () => {
  const [g] = orderGroupResults({
    planned: ['1481054599057270'],
    attempts: [
      { group_id: '1481054599057270', level: 'error', message: 'Facebook จำกัดการโพสต์ของบัญชีนี้', at: at(1), account: 'Camy Rizk' },
      { group_id: '1481054599057270', level: 'success', message: null, at: at(5), account: 'Clarissa Glady' },
    ],
    postLogs: [{ group_id: '1481054599057270', post_link: 'https://facebook.com/groups/1481054599057270/posts/9', post_status: 'อนุมัติเเล้ว', at: at(5), account: 'Clarissa Glady' }],
  });
  assert.equal(g.status, 'posted');
  assert.equal(g.account, 'Clarissa Glady');
  assert.equal(g.error, null);
});

test('รอบจบแล้วแต่ไม่ถึงกลุ่มนี้ = ไม่สำเร็จ ไม่ค้างเป็นรอคิว', () => {
  const [g] = orderGroupResults({ planned: ['884533619479424'], active: false });
  assert.equal(g.status, 'failed');
  assert.equal(g.error, 'ยังไม่ได้ลองโพสต์กลุ่มนี้');
});

test('กลุ่มที่ไม่ได้ลองโพสต์ บอกเหตุที่รอบหยุด', () => {
  const [g] = orderGroupResults({
    planned: ['884533619479424'],
    stopReason: 'บัญชี Camy Rizk ถูกพัก — ย้ายงานให้บัญชีที่ว่างแล้ว\nรายละเอียด',
  });
  assert.equal(g.error, 'ยังไม่ได้ลองโพสต์กลุ่มนี้ — บัญชี Camy Rizk ถูกพัก — ย้ายงานให้บัญชีที่ว่างแล้ว');
});
