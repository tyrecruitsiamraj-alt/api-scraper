/**
 * เรียกจาก Admin: POST /api/users/:id/check-session
 * ตั้งค่า CHECK_SESSION_EMAIL, CHECK_SESSION_PASSWORD, CHECK_SESSION_KEY, CHECK_SESSION_LABEL ผ่าน env
 */
import { test } from './humanBrowser.fixture';
import { facebookLogin } from '../src/helpers';
import { getPlaywrightTestTimeoutMs } from '../playwright-test-timeout';

test('Check Facebook session (บันทึก .auth)', async ({ page }) => {
  /** ยืนยันตัวตนอาจนาน — ใช้ timeout เดียวกับโหมดโพสต์ (ค่า default ~6 ชม. จาก PLAYWRIGHT_GLOBAL_TIMEOUT_MS) */
  test.setTimeout(getPlaywrightTestTimeoutMs());

  const email = String(process.env.CHECK_SESSION_EMAIL || '').trim();
  const password = String(process.env.CHECK_SESSION_PASSWORD || '').trim();
  const sessionKey = String(process.env.CHECK_SESSION_KEY || 'default').trim();
  const userLabel = String(process.env.CHECK_SESSION_LABEL || 'Session check').trim();

  if (!email || !password) {
    test.skip(true, 'ไม่มี CHECK_SESSION_EMAIL/PASSWORD — ใช้เฉพาะเมื่อสั่งจาก Admin (ปุ่มเช็ค Session)');
    return;
  }

  await facebookLogin(page, email, password, {
    userLabel,
    sessionKey,
    interactiveCheckpoint: true,
    /** รอให้ผู้ใช้ปิดแท็บเองหลังเห็นฟีด — กัน Chrome ถูกปิดทันทีระหว่าง/หลังยืนยันตัวตน */
    manualCloseAfterSuccess: true,
  });
  console.log(`✅ [${userLabel}] จบการเช็ค session (key: ${sessionKey})`);
});
