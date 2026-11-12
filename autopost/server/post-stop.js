/**
 * เหตุที่รอบโพสต์หยุดก่อนโพสต์ครบทุกกลุ่ม — นิยามเดียว (เจ้าของสั่ง 12 พ.ย. 2569)
 * ตัดสินตอนบันทึกเหตุ (post_run_queue.stop_code) ไม่ใช่เดาจากข้อความทีหลัง
 * ข้อมูลเก่าก่อนมีคอลัมน์นี้ ใช้ stopCodeForText ตัวเดียวกันอ่านจากข้อความเหตุที่บันทึกไว้
 *
 * machine    เครื่องมีปัญหา (เริ่มใหม่กลางงาน · ใช้เวลานานเกินกำหนด · เน็ต/ฐานข้อมูลหลุด · Chrome ปิด)
 * account    บัญชี Facebook มีปัญหา (ถูกพัก · โดนจำกัด · ยืนยันตัวตน/ล็อกอิน/session)
 * daily_cap  บัญชีครบโควต้าโพสต์วันนี้แล้ว
 * group_wait กลุ่มยังไม่ครบเวลาเว้นโพสต์ซ้ำ หรือบัญชีอื่นจองกลุ่มไปแล้ววันนี้
 * no_run     ระบบไม่ได้เริ่มรอบโพสต์ให้ใบนี้
 * unknown    ไม่ทราบสาเหตุ
 */

const STOP_CODES = ['machine', 'account', 'daily_cap', 'group_wait', 'no_run', 'unknown'];

const MACHINE = /เครื่องเริ่มใหม่|เครื่องหยุดทำงาน|WORKER_POST_JOB_MAX_MS|stale_running|Connection terminated|ERR_CERT|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|browser has been closed|Browser\/context|Target page, context|exit code|spawn \S+ ENOENT|Test timeout|Timeout \d+ms exceeded/i;
const ACCOUNT = /ถูกพัก|ยืนยันตัวตน|verify|checkpoint|ล็อกอิน|login|session หมดอายุ|Facebook จำกัด|circuit breaker|Email\/Password|ยังไม่ได้เลือกกลุ่ม/i;
const DAILY_CAP = /ครบโควต้า|เกินโควต้า/;
const GROUP_WAIT = /cooldown|ถูกบัญชีอื่นจอง/i;

/** ข้อความเหตุ → รหัส · ไม่เข้าแบบไหน = unknown */
function stopCodeForText(text) {
  const s = String(text ?? '');
  if (!s.trim()) return 'unknown';
  if (MACHINE.test(s)) return 'machine';
  if (ACCOUNT.test(s)) return 'account';
  if (DAILY_CAP.test(s)) return 'daily_cap';
  if (GROUP_WAIT.test(s)) return 'group_wait';
  return 'unknown';
}

/** บรรทัดแรกของเหตุ เป็นภาษาคน (ไม่เกิน 160 ตัว) */
function stopReasonLine(text) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  if (!line) return '';
  if (/WORKER_POST_JOB_MAX_MS|stale_running/i.test(line)) return 'รอบโพสต์ใช้เวลานานเกินกำหนด เครื่องหยุดงาน';
  return line.slice(0, 160);
}

module.exports = { STOP_CODES, stopCodeForText, stopReasonLine };
