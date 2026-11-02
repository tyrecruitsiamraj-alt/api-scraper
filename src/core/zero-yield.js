/**
 * รอบค้นที่ "เปิดเรซูเม่เยอะแล้วแต่ไม่มีใครผ่านเกณฑ์เลย" — เงื่อนไขของใบขอผิดแน่ ๆ
 * ไม่ใช่คำค้น การวนตำแหน่งถัดไปด้วยเงื่อนไขเดิมมีแต่เผาโควตา
 * (LAM6909001 2 พ.ย. 2569: อายุ 20–20 วน 4 ตำแหน่ง เปิด 240 ใบ ผ่าน 0 จนชนเพดานวัน)
 */

/** เปิดอย่างน้อยเท่านี้ถึงจะเชื่อว่าเงื่อนไขผิด ไม่ใช่แค่หน้าแรกบังเอิญไม่มี */
export const ZERO_YIELD_MIN_OPENED = 10;

/**
 * @param {{ opened?: number, qualified?: number, needsReview?: number, status?: string }} round ผลจาก runConnector
 * @param {number} target จำนวนที่ต้องการในรอบนั้น
 */
export function isZeroYieldRound(round, target = 0) {
  if (!round || round.status === 'cooldown' || round.status === 'stopped' || round.status === 'failed') return false;
  const opened = Number(round.opened || 0);
  const qualified = Number(round.qualified || 0);
  const needsReview = Number(round.needsReview || 0);
  return opened >= Math.max(ZERO_YIELD_MIN_OPENED, Number(target) || 0) && qualified === 0 && needsReview === 0;
}

/** ข้อความบนจอใบงาน — บอกว่าหยุดเพราะอะไร และให้ทำอะไรต่อ */
export function zeroYieldNote(round) {
  const opened = Number(round?.opened || 0);
  const why = String(round?.error || '').trim();
  const head = why || `เปิด Resume ${opened} ใบ แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไข`;
  return `${head} · ระบบหยุดค้นตำแหน่งอื่นแล้ว เพราะเงื่อนไขเดิมจะคัดออกเหมือนเดิม — รอแก้เงื่อนไข (อายุ เพศ เงินเดือน จังหวัด) แล้วกดรันตอนนี้`;
}
