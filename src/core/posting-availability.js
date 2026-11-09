/**
 * ตอนนี้สั่งโพสต์ได้ไหม และถ้าไม่ได้ เพราะอะไร — สรุปจากสถานะทุกบัญชี (นิยามเดียว ส่งให้ Jarvis ใน /options)
 * เจ้าของ 9 พ.ย. 2569: ใบไม่สำเร็จแล้วจะสั่งใหม่ แต่ Jarvis ขึ้นแค่ "ไม่มีบัญชีที่พร้อมโพสต์" — "ก็ต้องบอกสิว่าสั่งไม่ได้ เพราะอะไร"
 *
 * สั่งได้ = มีบัญชี ready หรือ busy (กำลังโพสต์งานอื่น งานใหม่ต่อคิว) ที่ยังเหลือโควต้าวันนี้
 */

const thaiDateTime = (iso) =>
  new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * @param {{ status: string, remaining_today: number, paused_until: string|null }[]} accounts
 * @param {number} [now]
 */
export function postingAvailability(accounts, now = Date.now()) {
  const counts = { ready: 0, busy: 0, full: 0, paused: 0, needs_verification: 0, worker_offline: 0, no_worker: 0 };
  let room = 0;
  let orderable = 0;
  let nextAt = null;
  for (const a of accounts) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
    const left = Math.max(0, Number(a.remaining_today) || 0);
    if ((a.status === 'ready' || a.status === 'busy') && left > 0) {
      orderable += 1;
      room += left;
    }
    if (a.status === 'paused' && a.paused_until) {
      const t = new Date(a.paused_until).getTime();
      if (t > now && (nextAt == null || t < nextAt)) nextAt = t;
    }
  }
  const next_available_at = nextAt == null ? null : new Date(nextAt).toISOString();

  const why = [];
  if (counts.paused) why.push(`Facebook จำกัดแล้วระบบพักไว้ ${counts.paused} บัญชี${next_available_at ? ` (บัญชีแรกกลับมา ${thaiDateTime(next_available_at)})` : ''}`);
  if (counts.needs_verification) why.push(`รอยืนยันตัวตนที่เครื่อง ${counts.needs_verification} บัญชี`);
  if (counts.full) why.push(`โพสต์ครบโควต้าวันนี้แล้ว ${counts.full} บัญชี`);
  const busyFull = accounts.filter((a) => a.status === 'busy' && !(Number(a.remaining_today) > 0)).length;
  if (busyFull) why.push(`กำลังโพสต์งานอื่นและโควต้าวันนี้เต็มแล้ว ${busyFull} บัญชี`);
  if (counts.worker_offline) why.push(`เครื่องที่ผูกไว้ออฟไลน์ ${counts.worker_offline} บัญชี`);
  if (counts.no_worker) why.push(`ยังไม่ได้ผูกเครื่อง ${counts.no_worker} บัญชี`);

  return {
    can_order: orderable > 0,
    /** บัญชีที่สั่งได้ (ว่าง + กำลังโพสต์แต่ยังเหลือโควต้า) และโควต้าที่เหลือรวมวันนี้ */
    orderable_accounts: orderable,
    room_today: room,
    counts,
    next_available_at,
    /** ข้อความสำหรับคนสั่ง — null เมื่อสั่งได้ */
    message: orderable > 0
      ? null
      : `สั่งโพสต์ไม่ได้ตอนนี้ เพราะไม่มีบัญชีที่โพสต์ได้${why.length ? `: ${why.join(' · ')}` : ''}`,
  };
}
