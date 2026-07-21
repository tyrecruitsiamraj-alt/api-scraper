/**
 * แจ้งเตือนไป webhook (Teams Incoming Webhook / อะไรก็ได้ที่รับ POST {text}) เมื่อโพสต์พัง.
 * ตัวเดียวกับ src/core/alert.js ฝั่ง scraper แต่เป็น CommonJS (autopost ทั้งโปรเจกต์เป็น CJS).
 * fail-soft: ไม่ตั้ง ALERT_WEBHOOK_URL = เงียบ, ยิงไม่ผ่าน = log อย่างเดียว.
 */
async function sendAlert(text) {
  const url = String(process.env.ALERT_WEBHOOK_URL || '').trim();
  if (!url || !text) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ text: String(text).slice(0, 2000) }),
    });
    if (!res.ok) console.warn(`[alert] webhook HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`[alert] ส่งแจ้งเตือนไม่ได้: ${e.message}`);
    return false;
  }
}

module.exports = { sendAlert };
