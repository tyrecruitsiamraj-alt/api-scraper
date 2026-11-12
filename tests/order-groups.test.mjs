import test from 'node:test';
import assert from 'node:assert/strict';
import { orderGroupResults, countGroupStatuses, linkedCount, shortFailReason } from '../src/core/order-groups.js';

const at = (m) => `2026-11-09T02:${String(m).padStart(2, '0')}:00Z`;

test('ใบ 5 กลุ่ม: เผยแพร่แล้ว · รอดำเนินการ · กดแล้วไม่ขึ้น = ไม่สำเร็จ · ไม่สำเร็จ · รอคิว — นับรวมเท่าจำนวนกลุ่ม', () => {
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
  assert.deepEqual(groups.map((g) => g.status), ['posted', 'pending_approval', 'failed', 'failed', 'waiting']);
  assert.equal(groups[2].error, 'กดโพสต์แล้ว แต่โพสต์ไม่ขึ้นในกลุ่ม');
  assert.equal(groups[3].error, 'Facebook ไม่รับโพสต์');
  assert.equal(groups[0].account, 'Thom Blake');
  assert.deepEqual(countGroupStatuses(groups), { total: 5, posted: 1, pending_approval: 1, declined: 0, removed: 0, failed: 2, not_tried: 0, waiting: 1 });
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

test('รอบจบแล้วแต่ไม่ถึงกลุ่มนี้ = ไม่ได้โพสต์ ไม่นับเป็นไม่สำเร็จ และไม่ค้างเป็นรอคิว', () => {
  const [g] = orderGroupResults({ planned: ['884533619479424'], active: false });
  assert.equal(g.status, 'not_tried');
  assert.equal(g.error, null);
  assert.deepEqual(countGroupStatuses([g]), { total: 1, posted: 0, pending_approval: 0, declined: 0, removed: 0, failed: 0, not_tried: 1, waiting: 0 });
});

test('กลุ่มที่ไม่ได้ลองโพสต์ บอกเหตุที่รอบหยุด', () => {
  const [g] = orderGroupResults({
    planned: ['884533619479424'],
    stopReason: 'บัญชี Camy Rizk ถูกพัก — ย้ายงานให้บัญชีที่ว่างแล้ว\nรายละเอียด',
  });
  assert.equal(g.status, 'not_tried');
  assert.equal(g.error, 'บัญชี Camy Rizk ถูกพัก — ย้ายงานให้บัญชีที่ว่างแล้ว');
});

test('เหตุไม่สำเร็จย่อเหลือบรรทัดเดียว — ข้อความจริงจาก run_logs', () => {
  const cases = [
    ['Facebook ไม่รับโพสต์: พนักงานขับรถ นาย · OPL6910055 → กลุ่ม 1398230516956714 — สร้างโพสต์Bennie Bobbeกลุ่มส่วนตัวเพิ่มลงในโพสต์ของคุณโพสต์เราได้จำกัดจำนวนการโพสต์ แสดงความเห็น หรือทำสิ่งอื่นๆ ของคุณเป็นระยะเวลานึงเพื่อป้องกันการสแปมในชุมชน', 'Facebook จำกัดการโพสต์ของบัญชีนี้ชั่วคราว'],
    ['Facebook ไม่รับโพสต์: พนักงานขับรถ · OPL6910016 → กลุ่ม 1398230516956714 — เกิดข้อผิดพลาดขึ้น ซึ่งอาจเกิดจากข้อผิดพลาดทางเทคนิคที่เรากำลังแก้ไขอยู่', 'Facebook ขัดข้องตอนกดโพสต์'],
    ['Facebook ไม่รับโพสต์: ทดแทนงาน · LBM6903002 → กลุ่ม 873884635154852 — หน้าต่างโพสต์ไม่ปิดหลังกดโพสต์ 31 วินาที หน้าจอเขียนว่า: สร้างโพสต์Rand Mizeกลุ่มสาธารณะโพสต์Network request encountered error HTTP HTTP_TRANSPORT_ERROR: แสดงความเห็น', 'เน็ตหลุดตอนกดโพสต์'],
    ['Facebook ไม่รับโพสต์: ทดแทนงาน · LBM6903002 → กลุ่ม 873884635154852 — หน้าต่างโพสต์ไม่ปิดหลังกดโพสต์ 30 วินาที หน้าจอเขียนว่า: สร้างโพสต์Clarissa Gladyกลุ่มสาธารณะ', 'กดโพสต์แล้วหน้าต่างไม่ปิด Facebook ไม่รับโพสต์'],
    ['ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: ผู้ดูแลพักกลุ่มนี้ชั่วคราวเมื่อ 17 สิงหาคม 2026 (กลุ่ม 226719385068994)', 'แอดมินพักกลุ่มนี้ชั่วคราว'],
    ['ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: โพสต์ของคุณอยู่ระหว่างรอการอนุมัติ (กลุ่ม 226719385068994)', 'มีโพสต์ของบัญชีนี้รออนุมัติในกลุ่มอยู่แล้ว'],
    ['ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: เนื้อหานี้ไม่พร้อมใช้งานในขณะนี้ (กลุ่ม 226719385068994)', 'เปิดกลุ่มไม่ได้ กลุ่มอาจถูกลบหรือซ่อน'],
    ['ไม่เจอช่องเขียนโพสต์และปุ่มเข้าร่วมกลุ่ม หน้ากลุ่มเขียนว่า: English [UK] / ภาษาไทย (กลุ่ม 226719385068994)', 'ไม่เจอช่องเขียนโพสต์ในกลุ่ม'],
    ['ยังไม่ได้เป็นสมาชิก ส่งคำขอเข้ากลุ่มแล้ว รอแอดมินอนุมัติ (กลุ่ม 226719385068994)', 'ยังไม่เป็นสมาชิก ส่งคำขอเข้ากลุ่มแล้ว รอแอดมินอนุมัติ'],
    ['โพสต์ไม่สำเร็จ: ทดแทนงาน · LBM6903002 → กลุ่ม 873884635154852 (ถ้ามีจะบันทึก screenshot/HTML ไว้ที่โฟลเดอร์ artifacts/)', 'โพสต์ไม่สำเร็จ'],
    [null, 'โพสต์ไม่สำเร็จ'],
  ];
  for (const [input, want] of cases) assert.equal(shortFailReason(input), want);
  const [g] = orderGroupResults({
    planned: ['1398230516956714'],
    attempts: [{ group_id: '1398230516956714', level: 'warn', message: cases[0][0], at: at(1) }],
  });
  assert.equal(g.error, 'Facebook จำกัดการโพสต์ของบัญชีนี้ชั่วคราว');
});

test('แอดมินปฏิเสธ/ลบโพสต์ (เช็กจากแท็บเนื้อหาของคุณ) แยกสถานะ ไม่นับเป็นเผยแพร่ และไม่โชว์ลิงก์ที่เปิดไม่ได้', () => {
  const groups = orderGroupResults({
    planned: ['1481054599057270', '433203029287064'],
    attempts: [
      { group_id: '1481054599057270', level: 'success', message: null, at: at(1) },
      { group_id: '433203029287064', level: 'success', message: null, at: at(2) },
    ],
    postLogs: [
      { group_id: '1481054599057270', post_link: 'https://www.facebook.com/groups/1481054599057270/posts/1234567890123403/', post_status: 'ถูกปฏิเสธ', at: at(1) },
      { group_id: '433203029287064', post_link: 'https://www.facebook.com/groups/433203029287064/posts/1234567890123404/', post_status: 'ถูกลบ', at: at(2) },
    ],
  });
  assert.deepEqual(groups.map((g) => [g.status, g.post_link, g.error]), [
    ['declined', null, 'แอดมินกลุ่มปฏิเสธโพสต์'],
    ['removed', null, 'โพสต์ถูกลบออกจากกลุ่ม'],
  ]);
  assert.equal(linkedCount(groups), 0);
  const c = countGroupStatuses(groups);
  assert.equal(c.declined, 1);
  assert.equal(c.removed, 1);
});
