import { envString } from '../config.js';

/**
 * แจ้งเตือนไป webhook (Teams Incoming Webhook / อะไรก็ได้ที่รับ POST {text}) เมื่องานพัง.
 * fail-soft ทั้งตัว: ไม่ตั้ง ALERT_WEBHOOK_URL = เงียบ, ยิงไม่ผ่าน = log อย่างเดียว
 * (ระบบแจ้งเตือนห้ามทำให้งานหลักพังซ้ำ).
 */
export async function sendAlert(text) {
  const url = envString('ALERT_WEBHOOK_URL');
  if (!url || !text) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ text: String(text).slice(0, 2000) }),
    });
    if (!res.ok) console.warn(`  [alert] webhook HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`  [alert] ส่งแจ้งเตือนไม่ได้: ${e.message}`);
    return false;
  }
}
