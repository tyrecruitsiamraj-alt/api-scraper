/**
 * ผลรายกลุ่มของใบสั่งโพสต์หนึ่งใบ — นิยามเดียว ใช้ทั้งตารางหน้า "คำสั่งงาน" (ตัวเลข) และหน้ารายละเอียดของใบ (ทีละกลุ่ม)
 * เจ้าของ 9 พ.ย. 2569: ทุกใบต้องบอกว่าสั่งกี่กลุ่ม ขึ้นแล้วเท่าไร รออนุมัติเท่าไร ไม่สำเร็จเท่าไร และ "สำเร็จ" ต้องมีลิงก์ให้กดดูโพสต์ได้
 *
 * ใช้ run_logs / post_logs ของ job ใบนี้ (jv-<เลขใบ>) ในช่วงเวลาของใบ — รวมรอบที่สลับบัญชีมาโพสต์แทนด้วย
 * (รอบสลับบัญชีสร้าง assignment เลขใหม่ ไม่ขึ้นต้นด้วย jv- จึงต้องดูจาก job ไม่ใช่จาก assignment)
 */
import { postedOutcome } from './post-task-state.js';

export const GROUP_STATUSES = [
  { key: 'posted', label: 'ขึ้นแล้ว' },
  { key: 'pending_approval', label: 'รอแอดมินอนุมัติ' },
  { key: 'unconfirmed', label: 'กดโพสต์แล้ว หาโพสต์ไม่เจอ' },
  { key: 'failed', label: 'ไม่สำเร็จ' },
  // รอบจบแล้วแต่ไม่ถึงกลุ่มนี้ — แยกจาก "ไม่สำเร็จ" (เจ้าของสั่ง 11 พ.ย. 2569: ไม่สำเร็จ 1,146 กลุ่ม เป็นไม่ได้ลอง 982)
  { key: 'not_tried', label: 'ยังไม่ได้ลองโพสต์' },
  { key: 'waiting', label: 'รอคิว' },
];

const ts = (v) => (v ? new Date(v).getTime() : 0);

/**
 * @param {{
 *   planned: string[],                 // เลขกลุ่ม Facebook ที่ใบนี้สั่ง (ตามลำดับใน Jarvis)
 *   attempts: { group_id: string|null, level: string, message: string|null, at: string, account?: string|null }[],
 *   postLogs: { group_id: string|null, post_link: string|null, post_status: string|null, at: string, account?: string|null }[],
 *   active: boolean,                   // ใบนี้ยังมีรอบรอคิว/กำลังทำ
 *   stopReason?: string|null,          // เหตุที่รอบล่าสุดหยุด (error ของรอบ) — ใช้บอกกลุ่มที่ไม่ได้ลองโพสต์เลย
 *   groupName?: (fb: string) => string,
 * }} input
 */
export function orderGroupResults({ planned = [], attempts = [], postLogs = [], active = false, stopReason = null, groupName = (id) => id }) {
  const stopped = stopReasonText(stopReason);
  const order = [];
  const seen = new Set();
  const add = (id) => {
    const key = String(id ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    order.push(key);
  };
  for (const id of planned) add(id);
  // กลุ่มที่ไม่ได้อยู่ในรายการสั่ง แต่มีรอบไปโพสต์ (เช่น สั่งซ้ำ) ก็แสดงด้วย
  for (const a of [...attempts].sort((x, y) => ts(x.at) - ts(y.at))) add(a.group_id);
  for (const p of postLogs) add(p.group_id);

  return order.map((fb) => {
    const latest = attempts
      .filter((a) => String(a.group_id ?? '') === fb)
      .sort((x, y) => ts(y.at) - ts(x.at))[0] ?? null;
    const log = postLogs
      .filter((p) => String(p.group_id ?? '') === fb)
      .sort((x, y) => ts(y.at) - ts(x.at))[0] ?? null;
    let status;
    if (log && String(log.post_link ?? '').trim()) status = postedOutcome(log.post_status, log.post_link);
    else if (latest?.level === 'success' || log) status = postedOutcome(log?.post_status, null);
    else if (latest) status = 'failed';
    else status = active ? 'waiting' : 'not_tried';
    return {
      fb_group_id: fb,
      name: groupName(fb),
      status,
      at: log?.at ?? latest?.at ?? null,
      account: log?.account ?? latest?.account ?? null,
      error: status === 'failed'
        ? shortFailReason(latest?.message)
        : status === 'not_tried' ? stopped || null : null,
      post_link: String(log?.post_link ?? '').trim() || null,
    };
  });
}

/**
 * เหตุที่โพสต์กลุ่มไม่สำเร็จ ย่อให้คนอ่านจบในบรรทัดเดียว (เจ้าของสั่ง 11 พ.ย. 2569)
 * ข้อความเต็มจาก worker มีชื่องาน เลขใบ เลขกลุ่ม และข้อความทั้งหน้า Facebook ติดมา — งาน/กลุ่มมีคอลัมน์ของตัวเองแล้ว
 * แบบที่เจอจริงตั้งแต่ 1 ต.ค. 2569 ไล่จาก run_logs ทุกแบบ
 */
export function shortFailReason(message) {
  const m = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (!m) return 'โพสต์ไม่สำเร็จ';
  if (/เราได้จำกัดจำนวนการโพสต์|ป้องกันการสแปม|จำกัดการโพสต์ของบัญชี/.test(m)) return 'Facebook จำกัดการโพสต์ของบัญชีนี้ชั่วคราว';
  if (/ข้อผิดพลาดทางเทคนิค/.test(m)) return 'Facebook ขัดข้องตอนกดโพสต์';
  if (/HTTP_TRANSPORT_ERROR|Network request/i.test(m)) return 'เน็ตหลุดตอนกดโพสต์';
  if (/หน้าต่างโพสต์ไม่ปิดหลังกดโพสต์/.test(m)) return 'กดโพสต์แล้วหน้าต่างไม่ปิด Facebook ไม่รับโพสต์';
  if (/ผู้ดูแลพักกลุ่มนี้ชั่วคราว/.test(m)) return 'แอดมินพักกลุ่มนี้ชั่วคราว';
  if (/โพสต์ของคุณอยู่ระหว่างรอการอนุมัติ/.test(m)) return 'มีโพสต์ของบัญชีนี้รออนุมัติในกลุ่มอยู่แล้ว';
  if (/เนื้อหานี้ไม่พร้อมใช้งาน/.test(m)) return 'เปิดกลุ่มไม่ได้ กลุ่มอาจถูกลบหรือซ่อน';
  if (/ส่งคำขอเข้ากลุ่มแล้ว/.test(m)) return 'ยังไม่เป็นสมาชิก ส่งคำขอเข้ากลุ่มแล้ว รอแอดมินอนุมัติ';
  if (/ไม่เจอช่องเขียนโพสต์/.test(m)) return 'ไม่เจอช่องเขียนโพสต์ในกลุ่ม';
  if (/^Facebook ไม่รับโพสต์/.test(m)) return 'Facebook ไม่รับโพสต์';
  if (/^โพสต์ไม่สำเร็จ/.test(m)) return 'โพสต์ไม่สำเร็จ';
  // แบบอื่น: ตัด "(กลุ่ม …)" ท้ายข้อความ และไม่ยาวเกิน 1 บรรทัด
  const cut = m.replace(/\s*\((?:กลุ่ม|ถ้ามี)[^)]*\)\s*$/, '');
  return cut.length > 120 ? `${cut.slice(0, 119)}…` : cut;
}

/** บรรทัดแรกของ error รอบ เป็นภาษาคน */
function stopReasonText(err) {
  const line = String(err ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  if (!line) return '';
  if (/WORKER_POST_JOB_MAX_MS|stale_running/i.test(line)) return 'รอบโพสต์ใช้เวลานานเกินกำหนด เครื่องหยุดงาน';
  return line.slice(0, 160);
}

/** นับตามสถานะ — ทุกกลุ่มลงถังเดียว ผลรวม = จำนวนกลุ่ม */
export function countGroupStatuses(groups) {
  const counts = Object.fromEntries(GROUP_STATUSES.map((s) => [s.key, 0]));
  for (const g of groups) counts[g.status] = (counts[g.status] ?? 0) + 1;
  return { total: groups.length, ...counts };
}

/** สำเร็จ = มีลิงก์ให้กดดูโพสต์ได้ (ขึ้นแล้ว หรือรออนุมัติที่ได้ลิงก์แล้ว) */
export function linkedCount(groups) {
  return groups.filter((g) => g.post_link).length;
}
