/**
 * Convert a scrape-task result into a queue-safe terminal result.
 * The work queue may only report `done` after the inner scrape task actually ran
 * and reached a non-error terminal state.
 */
export function requireSuccessfulScrapeTaskResult(result) {
  // คิวซ้ำของงานที่อีกช่องรันอยู่แล้ว: ปิดคิวนี้เงียบ ๆ ไม่ลองใหม่ (ลองใหม่มีแต่แจ้งเตือนหลอก)
  if (result?.skipped && result.reason === 'task_already_running') return result;
  if (result?.skipped) {
    throw new Error(`scrape task was not executed: ${result.reason || 'already running'}`);
  }
  if (result?.runStatus === 'cooldown' && result.cooldownUntil) {
    throw cooldownError(result.error || 'connector cooling down', result.cooldownUntil, { waiting: result.waitReason === 'daily_cap' });
  }
  if (!result || result.status === 'error') {
    throw new Error(result?.error || 'scrape task failed without a terminal result');
  }
  return result;
}

/**
 * บัญชีถูกพัก: คิวต้องรอจนพ้นเวลาพัก (retryAt) ไม่ลองใหม่ใน 30 วินาที
 * waiting = รอโควต้าวันถัดไป ไม่ใช่งานล้ม — คิวไม่นับเป็นรอบลองใหม่ และไม่ตีกลับใบใน Jarvis
 */
export function cooldownError(message, cooldownUntil, { waiting = false } = {}) {
  const err = new Error(message);
  err.retryAt = new Date(cooldownUntil);
  err.waiting = waiting;
  return err;
}

/**
 * เวลาที่โควต้าค้นหาต่อวันนับใหม่: เที่ยงคืนถัดไปตามเวลาไทย + 5 นาที (ตัวนับ countScrapedToday ตัดวันตามเวลาไทย)
 * 20 พ.ย. 2569: โควต้า JobThai เต็มตั้งแต่ 08:55 คำสั่ง 229 รายการถูกตีกลับ คนสั่งต้องกดสั่งใหม่เองทุกใบ
 * เจ้าของเคาะ: โควต้าเต็ม = รอคิว ทำต่อวันถัดไปเอง
 */
export function nextQuotaReset(now = Date.now()) {
  const BKK_MS = 7 * 60 * 60 * 1000;
  const local = new Date(now + BKK_MS);
  const nextMidnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - BKK_MS;
  return new Date(nextMidnightUtc + 5 * 60 * 1000);
}

/**
 * Definition of Done ฝั่งธุรกิจ:
 * - completed = ได้ Resume ผ่านเกณฑ์ครบจำนวน
 * - market_insufficient = connector ทำงานจบ แต่ค้นใน Job Family แล้วได้ไม่ครบ
 * - infrastructure_error = login/browser/connector/ฐานข้อมูลล้มเหลว
 */
export function classifyScrapeTaskResult(result) {
  if (result?.skipped && result.reason === 'task_already_running') return 'already_running';
  if (!result || result?.skipped || result.status === 'error') return 'infrastructure_error';
  if (result.status === 'stopped') return 'stopped';
  if (result.status === 'partial') return 'market_insufficient';
  return 'completed';
}

/**
 * วันนี้เปิดดูโปรไฟล์ได้อีกกี่คน
 * เพดานของเว็บ (แท็บ "โควต้าการใช้งาน" รวมทุกบัญชีของเว็บนั้น) คือเพดานจริงเมื่อตั้งไว้ · เพดานของบัญชีใช้เฉพาะเว็บที่ยังไม่ได้ตั้ง
 * 23 พ.ย. 2569: เจ้าของตั้ง JobThai 1,000 แต่บัญชี JobThai-Main มีเพดาน 200 ซ่อนอยู่ ระบบหยุดที่ 200 ขณะที่ Jarvis บอกเหลือ 964
 */
export function dailyRemaining({ connectorCap, connectorToday, providerCap, platformToday }) {
  if (providerCap != null) return { remaining: Math.max(0, providerCap - platformToday), cap: providerCap, used: platformToday, by: 'provider' };
  return { remaining: Math.max(0, connectorCap - connectorToday), cap: connectorCap, used: connectorToday, by: 'connector' };
}
