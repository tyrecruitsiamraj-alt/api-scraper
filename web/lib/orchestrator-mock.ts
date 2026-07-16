/**
 * Mockup ใบงาน Content Orchestrator — ครบทุกสถานะ pipeline
 * ใช้โชว์การไหลก่อนต่อข้อมูลจริง (เปิดที่ /orchestrator/flow)
 */

export type FlowStage =
  | 'new'
  | 'researching'
  | 'drafting'
  | 'pending_approval'
  | 'approved'
  | 'posting'
  | 'measuring'
  | 'low_engagement'
  | 'done';

export type MockFlowItem = {
  id: string;
  request_no: string;
  title: string;
  province: string;
  remaining_qty: number;
  status: FlowStage;
  /** กำลังทำอะไรตอนนี้ */
  doing: string;
  /** ติดอะไร — null = ไม่ติด */
  blocked: string | null;
  /** ใคร/ระบบที่ถืองาน */
  owner: string;
  updated_ago: string;
};

/** คอลัมน์ pipeline ตามลำดับไหล (+ สาขาวนกลับ) */
export const FLOW_COLUMNS: { key: FlowStage; label: string; hint: string }[] = [
  { key: 'new', label: '① งานใหม่', hint: 'รับใบขอจาก ERP / กดเริ่มทำ content' },
  { key: 'researching', label: '② เช็ค Data เก่า', hint: 'ดูแนวที่เคยเวิร์ค / winning patterns ก่อนคิดใหม่' },
  { key: 'drafting', label: '③ คิด content', hint: 'AI เขียนแคปชัน + สร้างรูป' },
  { key: 'pending_approval', label: '④ รออนุมัติ', hint: 'คนต้องกดอนุมัติหรือตีกลับ' },
  { key: 'approved', label: '⑤ อนุมัติแล้ว', hint: 'พร้อมเข้าคิวโพสต์' },
  { key: 'posting', label: '⑥ Post งาน', hint: 'ลงกลุ่ม Facebook ผ่าน Autopost' },
  { key: 'measuring', label: '⑦ วัดผล', hint: 'ดู comment / คนทัก / leads' },
  { key: 'low_engagement', label: '↩ คนสนใจน้อย', hint: 'วนกลับไปเช็ค Data เก่า แล้วคิด content ใหม่' },
  { key: 'done', label: '⑧ เสร็จ', hint: 'ปิดงาน + เก็บแนวที่เวิร์ค' },
];

export const MOCK_FLOW: MockFlowItem[] = [
  {
    id: 'm-new-1',
    request_no: 'RQ-250715-001',
    title: 'พนักงานขับรถส่งของ',
    province: 'สมุทรปราการ',
    remaining_qty: 3,
    status: 'new',
    doing: 'รับใบขอจาก ERP แล้ว — รอเริ่มคิด content',
    blocked: null,
    owner: 'ระบบ',
    updated_ago: '5 นาทีที่แล้ว',
  },
  {
    id: 'm-new-2',
    request_no: 'RQ-250715-008',
    title: 'แม่บ้านประจำอาคาร',
    province: 'กรุงเทพมหานคร',
    remaining_qty: 5,
    status: 'new',
    doing: 'รอคนกด “เริ่มทำ content” จากหน้านำเข้า',
    blocked: 'ยังไม่มีคนสั่งเริ่ม (ค้างที่ใบขอ ERP)',
    owner: 'ทีม HR',
    updated_ago: '42 นาทีที่แล้ว',
  },
  {
    id: 'm-res-1',
    request_no: 'RQ-250714-044',
    title: 'ช่างซ่อมบำรุง',
    province: 'ชลบุรี',
    remaining_qty: 2,
    status: 'researching',
    doing: 'กำลังเช็ค Data เก่า — หาโพสต์/แนวที่เคยได้ leads ใน Job Family เดียวกัน',
    blocked: null,
    owner: 'AI Research',
    updated_ago: '2 นาทีที่แล้ว',
  },
  {
    id: 'm-res-2',
    request_no: 'RQ-250714-050',
    title: 'พนักงานธุรการ',
    province: 'นนทบุรี',
    remaining_qty: 2,
    status: 'researching',
    doing: 'เช็ค winning patterns เก่าก่อนส่งต่อไปคิด content',
    blocked: 'คลังแนวเก่ายังว่าง — รอบแรกจะคิดใหม่ทั้งหมด',
    owner: 'AI Research',
    updated_ago: '8 นาทีที่แล้ว',
  },
  {
    id: 'm-drf-1',
    request_no: 'RQ-250714-031',
    title: 'พนักงานจัดซื้อ',
    province: 'กรุงเทพมหานคร',
    remaining_qty: 1,
    status: 'drafting',
    doing: 'Claude กำลังเขียนแคปชัน + brief รูป (รอบที่ 1)',
    blocked: null,
    owner: 'Worker · draft',
    updated_ago: '1 นาทีที่แล้ว',
  },
  {
    id: 'm-drf-2',
    request_no: 'RQ-250713-019',
    title: 'พนักงานขับรถโฟล์คลิฟท์',
    province: 'ระยอง',
    remaining_qty: 4,
    status: 'drafting',
    doing: 'รอสร้างรูป AI หลังได้ caption แล้ว',
    blocked: 'ไม่มี OPENAI_API_KEY — สร้างรูปไม่ได้ (แคปชันอย่างเดียว)',
    owner: 'Worker · draft',
    updated_ago: '18 นาทีที่แล้ว',
  },
  {
    id: 'm-pa-1',
    request_no: 'RQ-250712-007',
    title: 'พยาบาลวิชาชีพ',
    province: 'นนทบุรี',
    remaining_qty: 2,
    status: 'pending_approval',
    doing: 'มี draft v2 พร้อมรูป — รอคนกดอนุมัติ',
    blocked: 'รอคนอนุมัติเกิน 1 วัน',
    owner: 'ทีม Content',
    updated_ago: '1 วันที่แล้ว',
  },
  {
    id: 'm-pa-2',
    request_no: 'RQ-250711-055',
    title: 'เจ้าหน้าที่ประสานงาน',
    province: 'ปทุมธานี',
    remaining_qty: 3,
    status: 'pending_approval',
    doing: 'draft v1 ถูกตีกลับแล้ว AI ทำ v2 เสร็จ — รออนุมัติอีกครั้ง',
    blocked: null,
    owner: 'ทีม Content',
    updated_ago: '3 ชั่วโมงที่แล้ว',
  },
  {
    id: 'm-ap-1',
    request_no: 'RQ-250710-022',
    title: 'ช่างแอร์',
    province: 'อยุธยา',
    remaining_qty: 2,
    status: 'approved',
    doing: 'อนุมัติแล้ว — รอเลือกบัญชี FB / เข้าคิวโพสต์',
    blocked: 'ยังไม่ได้เลือกบัญชี Facebook ตอนอนุมัติ',
    owner: 'ทีม Content',
    updated_ago: '40 นาทีที่แล้ว',
  },
  {
    id: 'm-po-1',
    request_no: 'RQ-250709-011',
    title: 'พนักงานคลังสินค้า',
    province: 'สมุทรสาคร',
    remaining_qty: 6,
    status: 'posting',
    doing: 'Autopost กำลังลงกลุ่ม (4/12 กลุ่ม) บนเครื่อง HR-PC-01',
    blocked: null,
    owner: 'Worker · HR-PC-01',
    updated_ago: 'เมื่อสักครู่',
  },
  {
    id: 'm-po-2',
    request_no: 'RQ-250708-003',
    title: 'พนักงานขับรถส่วนตัว',
    province: 'กรุงเทพมหานคร',
    remaining_qty: 1,
    status: 'posting',
    doing: 'งานอยู่ในคิว — รอเครื่องที่ผูกบัญชี',
    blocked: 'บัญชี FB ผูกกับเครื่อง “SO-BKK-02” แต่เครื่องออฟไลน์',
    owner: 'คิวโพสต์',
    updated_ago: '25 นาทีที่แล้ว',
  },
  {
    id: 'm-me-1',
    request_no: 'RQ-250706-018',
    title: 'พนักงานรักษาความปลอดภัย',
    province: 'นครปฐม',
    remaining_qty: 4,
    status: 'measuring',
    doing: 'โพสต์ครบ 10 กลุ่มแล้ว — รอรวม comment + leads',
    blocked: null,
    owner: 'Worker · measure',
    updated_ago: '6 ชั่วโมงที่แล้ว',
  },
  {
    id: 'm-me-2',
    request_no: 'RQ-250705-009',
    title: 'พ่อครัวประจำครัวกลาง',
    province: 'กรุงเทพมหานคร',
    remaining_qty: 2,
    status: 'measuring',
    doing: 'รอข้อมูลจากหน้า Collect (ยังมีโพสต์ที่ comment_count = 0)',
    blocked: 'Collect ยังไม่ดึง reactions/คนทักครบทุกโพสต์',
    owner: 'ระบบวัดผล',
    updated_ago: '12 ชั่วโมงที่แล้ว',
  },
  {
    id: 'm-lo-1',
    request_no: 'RQ-250701-027',
    title: 'พนักงานเสิร์ฟ',
    province: 'เชียงใหม่',
    remaining_qty: 5,
    status: 'low_engagement',
    doing: 'วัดผลแล้วคะแนนต่ำ — วนกลับไปเช็ค Data เก่า แล้วคิด content ใหม่ (v3)',
    blocked: 'รอบก่อนแคปชัน generic เกินไป (บันทึกเป็นแนวที่ต้องหลีกเลี่ยง)',
    owner: 'ระบบ (regen)',
    updated_ago: '2 ชั่วโมงที่แล้ว',
  },
  {
    id: 'm-lo-2',
    request_no: 'RQ-250628-041',
    title: 'พนักงานแคชเชียร์',
    province: 'ขอนแก่น',
    remaining_qty: 3,
    status: 'low_engagement',
    doing: 'หลังคนสนใจน้อย — ต้องกลับไปเช็ค Data เก่าก่อนคิว draft ใหม่',
    blocked: 'ไม่มี ANTHROPIC_API_KEY บน worker — คิวเช็ค Data / draft ค้าง',
    owner: 'Worker · draft',
    updated_ago: '4 ชั่วโมงที่แล้ว',
  },
  {
    id: 'm-dn-1',
    request_no: 'RQ-250620-002',
    title: 'พนักงานทำความสะอาด',
    province: 'กรุงเทพมหานคร',
    remaining_qty: 0,
    status: 'done',
    doing: 'ปิดงานแล้ว — บันทึกแนวที่เวิร์คไว้ใน winning patterns',
    blocked: null,
    owner: 'ระบบ',
    updated_ago: '3 วันที่แล้ว',
  },
  {
    id: 'm-dn-2',
    request_no: 'RQ-250615-016',
    title: 'ช่างไฟฟ้า',
    province: 'ระยอง',
    remaining_qty: 0,
    status: 'done',
    doing: 'ได้ leads ครบตามเป้าจากโพสต์รอบที่ 2',
    blocked: null,
    owner: 'ระบบ',
    updated_ago: '5 วันที่แล้ว',
  },
];
