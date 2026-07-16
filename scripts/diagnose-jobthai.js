import { getJobthaiSession } from '../src/providers/jobthai/session.js';
import { searchResumeIds, buildSearchUrl } from '../src/providers/jobthai/client.js';
import { loadRuntime } from '../src/config.js';
import { getConnector } from '../src/db/repositories.js';
import { closePool } from '../src/db/pool.js';

// connector jobthai ที่ตั้งไว้ในระบบ (label "JobThai-Main") — ดึง user/pass เข้ารหัสจาก DB
const JOBTHAI_CONNECTOR_ID = '8e1c7893-89a5-4adc-869a-2592776bf3ad';

/**
 * วินิจฉัย "สั่ง N ได้แค่ 1-3 ตลอด" — ค้นหาแบบไม่ใส่ฟิลเตอร์อื่นเลย (ตำแหน่งอย่างเดียว)
 * เป้าสูง ๆ แล้วดูว่าเจอกี่ ID จริง. อ่านอย่างเดียว (แค่ list id) ไม่ดึงรายละเอียด/PII,
 * ไม่แตะ DB กลาง — ใช้ session ที่มีอยู่แล้วใน .auth/jobthai.json
 *
 *   node scripts/diagnose-jobthai.js "ขาย" 500
 */
const position = process.argv[2] || 'ขาย';
const maxCandidates = Number.parseInt(process.argv[3] || '500', 10);

const runtime = loadRuntime();
const criteria = { position, maxCandidates };

console.log(`[diagnose-jobthai] ค้นหา position="${position}" เป้า ${maxCandidates} (ไม่ใส่ฟิลเตอร์อื่น)`);
console.log(`[diagnose-jobthai] URL หน้าแรก: ${buildSearchUrl(criteria)}`);

let sess;
try {
  const connector = await getConnector(JOBTHAI_CONNECTOR_ID);
  if (!connector) throw new Error(`ไม่พบ connector ${JOBTHAI_CONNECTOR_ID} ใน DB`);
  sess = await getJobthaiSession({
    headless: true,
    debug: runtime.debug,
    username: connector.username,
    password: connector.password(),
  });
  console.log(`[diagnose-jobthai] session: ${sess.reused ? 'reuse เดิม ✓' : 'login ใหม่'}`);

  const result = await searchResumeIds(sess.request, criteria, runtime);
  console.log(`\n===== ผล =====`);
  console.log(`พบ ID: ${result.ids.length} / เป้า ${maxCandidates}`);
  console.log(`สแกนไป: ${result.pagesScanned} หน้า`);
  console.log(`ตัวอย่าง ID แรก ๆ: ${result.ids.slice(0, 5).join(', ') || '(ไม่มี)'}`);

  if (result.ids.length >= maxCandidates * 0.5) {
    console.log('\n✅ สรุป: ได้เยอะเมื่อไม่ใส่ฟิลเตอร์ → เดิมที่ "สั่ง 15 ได้ 1-3" คือฟิลเตอร์แคบเกินไป (ปกติ ไม่ใช่บั๊ก)');
  } else if (result.pagesScanned <= 1 && result.ids.length < 5) {
    console.log('\n⚠️ สรุป: สแกนแค่ 1 หน้าแล้วหยุด ได้น้อยมาก แม้ไม่มีฟิลเตอร์ → น่าจะเป็นบั๊ก (markup เปลี่ยน / ปุ่มหน้าถัดไปหาไม่เจอ) ต้องแก้โค้ด');
  } else {
    console.log('\n❓ สรุป: ผลกำกวม — ได้บ้างแต่ไม่เยอะ ต้องดู pagesScanned เทียบจำนวนที่เว็บมีจริง');
  }
} catch (e) {
  console.error(`\n❌ เทสล้มเหลว: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (sess?.browser) await sess.browser.close().catch(() => {});
  await closePool();
}
