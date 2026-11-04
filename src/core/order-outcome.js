/**
 * ผลของคำสั่งหนึ่งใบจาก Jarvis (โพสต์ หรือ Scrap) — นิยามเดียว ใช้หน้า "คำสั่งงาน"
 * ทุกใบตกถังเดียวใน 6 ถัง: ยังไม่เริ่ม · กำลังทำ · สำเร็จ · ได้บางส่วน · ไม่สำเร็จ · ยกเลิก
 * ถังรวมกันต้องเท่ากับจำนวนใบทั้งหมดเสมอ
 */

export const OUTCOMES = [
  { key: 'waiting', label: 'ยังไม่เริ่ม' },
  { key: 'working', label: 'กำลังทำ' },
  { key: 'done', label: 'สำเร็จ' },
  { key: 'partial', label: 'ได้บางส่วน' },
  { key: 'failed', label: 'ไม่สำเร็จ' },
  { key: 'cancelled', label: 'ยกเลิก' },
];

/**
 * @param {{
 *   type: 'content' | 'scraping',
 *   jarvis_status: string,
 *   run_status?: string | null,     // โพสต์: รอบล่าสุดของใบนี้ (queued/running/completed/failed/cancelled)
 *   posted_groups?: number,         // โพสต์: กลุ่มที่ได้ลิงก์โพสต์
 *   task_status?: string | null,    // Scrap: สถานะงานค้นหา (idle/queued/running/done/partial/error)
 *   got?: number | null,            // Scrap: ได้คนกี่คน
 * }} o
 * @returns {{ outcome: 'waiting'|'working'|'done'|'partial'|'failed'|'cancelled', stage: string }}
 */
export function orderOutcome(o) {
  const js = String(o.jarvis_status || '');
  // คนสั่งยกเลิกใน Jarvis (ใบค้างแล้วสั่งใหม่) — ไม่นับเป็นไม่สำเร็จ
  if (js === 'cancelled') return { outcome: 'cancelled', stage: 'คนสั่งยกเลิกใน Jarvis' };
  if (o.type === 'scraping') return scrapeOutcome(js, o.task_status ?? null, Number(o.got ?? 0));
  return postOutcome(js, o.run_status ?? null, Number(o.posted_groups ?? 0));
}

function postOutcome(js, run, posted) {
  if (js === 'posted') return { outcome: 'done', stage: run === 'running' ? 'โพสต์ได้แล้ว กำลังโพสต์กลุ่มที่เหลือ' : 'โพสต์เสร็จ' };
  if (js === 'rejected') return { outcome: 'failed', stage: run ? 'โพสต์ไม่ได้สักกลุ่ม ตีกลับให้แก้' : 'ตีกลับให้แก้' };
  if (js === 'pending') return { outcome: 'waiting', stage: 'ยังไม่เข้าคิว' };
  // in_progress: ดูรอบโพสต์
  if (!run) return { outcome: 'working', stage: 'รับคำสั่งแล้ว รอสร้างรอบโพสต์' };
  if (run === 'queued') return { outcome: 'working', stage: 'รอเครื่องรับงาน' };
  if (run === 'running') return { outcome: 'working', stage: posted ? 'กำลังโพสต์' : 'เริ่มโพสต์แล้ว' };
  if (posted > 0) return { outcome: 'done', stage: 'โพสต์เสร็จ' };
  return { outcome: 'working', stage: 'รอบโพสต์จบแล้ว กำลังสรุปผล' };
}

function scrapeOutcome(js, task, got) {
  if (js === 'rejected') return { outcome: 'failed', stage: 'ตีกลับให้แก้' };
  if (!task) return js === 'pending'
    ? { outcome: 'waiting', stage: 'ยังไม่เริ่มค้นหา' }
    : { outcome: 'waiting', stage: 'รับคำสั่งแล้ว ยังไม่สร้างงานค้นหา' };
  if (task === 'queued') return { outcome: 'working', stage: 'รอเครื่องค้นหา' };
  if (task === 'running') return { outcome: 'working', stage: 'กำลังค้นหา' };
  if (task === 'idle') return { outcome: 'waiting', stage: 'ยังไม่เริ่มค้นหา' };
  if (task === 'done' || task === 'completed') return { outcome: 'done', stage: 'ค้นหาเสร็จ ได้ครบ' };
  if (task === 'partial') return got > 0
    ? { outcome: 'partial', stage: 'ค้นหาเสร็จ ได้ไม่ครบ' }
    : { outcome: 'failed', stage: 'ค้นหาเสร็จ ไม่เจอคนเข้าเกณฑ์' };
  if (task === 'error') return got > 0
    ? { outcome: 'partial', stage: 'ค้นหาหยุดกลางทาง ได้บางส่วน' }
    : { outcome: 'failed', stage: 'ค้นหาไม่สำเร็จ' };
  return { outcome: 'working', stage: task };
}
