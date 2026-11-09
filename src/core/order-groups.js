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
    else status = active ? 'waiting' : 'failed';
    return {
      fb_group_id: fb,
      name: groupName(fb),
      status,
      at: log?.at ?? latest?.at ?? null,
      account: log?.account ?? latest?.account ?? null,
      error: status === 'failed'
        ? (latest ? String(latest.message ?? 'โพสต์ไม่สำเร็จ') : `ยังไม่ได้ลองโพสต์กลุ่มนี้${stopped ? ` — ${stopped}` : ''}`)
        : null,
      post_link: String(log?.post_link ?? '').trim() || null,
    };
  });
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
