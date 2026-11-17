/**
 * ตรวจลิงก์ "เปิดดูโพสต์" ย้อนหลังของใบสั่งจาก Jarvis (17 พ.ย. 2569)
 *
 * ก่อน 17 พ.ย. ตอนโพสต์หาโพสต์ใหม่ไม่เจอ ระบบหยิบโพสต์บนสุดของบัญชีในกลุ่มนั้นมาเป็นลิงก์ ⇒ อาจได้โพสต์ของงานอื่น
 * ลิงก์ผิดเกิดได้เฉพาะแถวที่บัญชีเดียวกันเคยโพสต์ในกลุ่มเดียวกันมาก่อน — สคริปต์นี้ส่งแถวพวกนั้นเข้าคิวเก็บคอมเมนต์
 * worker เปิดโพสต์แล้วเทียบลิงก์สมัคร (collectComments.spec.ts) · ของงานอื่น = ล้างลิงก์ แล้วหาโพสต์ที่ถูกใหม่
 *
 * ต้องอัปเดตโค้ดบนเครื่อง worker ก่อน (ตัวตรวจอยู่ใน worker)
 *
 *   node autopost/scripts/recheck-jarvis-post-links.js           # ดูว่าจะส่งกี่แถว ไม่เขียนอะไร
 *   node autopost/scripts/recheck-jarvis-post-links.js --apply   # ส่งเข้าคิวจริง (บัญชีละ 1 รอบ · ข้ามบัญชีที่มีรอบค้าง)
 */
require('dotenv').config();
const db = require('../server/db');

async function main() {
  const apply = process.argv.includes('--apply');
  const { rows } = await db.query(
    `SELECT p.id, p.user_id
       FROM post_logs p
      WHERE p.job_id LIKE 'jv-%'
        AND p.post_link IS NOT NULL AND TRIM(p.post_link) <> ''
        AND p.user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM post_logs e
                     WHERE e.group_id = p.group_id AND e.poster_name = p.poster_name AND e.created_at < p.created_at)
      ORDER BY p.user_id, p.created_at`,
  );
  const byUser = new Map();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), String(r.id)]);
  console.log(`แถวที่ต้องตรวจ ${rows.length} แถว · ${byUser.size} บัญชี`);
  if (!apply) {
    console.log('ยังไม่ได้ส่ง — ใส่ --apply เพื่อส่งเข้าคิว');
    return;
  }
  const { rows: busy } = await db.query(`SELECT DISTINCT user_id FROM collect_run_queue WHERE status IN ('queued', 'running')`);
  const busySet = new Set(busy.map((r) => String(r.user_id)));
  let queued = 0;
  for (const [userId, ids] of byUser) {
    if (busySet.has(String(userId))) {
      console.log(`ข้าม ${userId}: มีรอบค้างอยู่ — รันสคริปต์ซ้ำทีหลัง`);
      continue;
    }
    await db.enqueueCollectRunJob({
      user_id: userId,
      post_log_ids: ids,
      requested_by: 'jarvis-link-recheck',
      message: `ตรวจลิงก์โพสต์ย้อนหลัง ${ids.length} โพสต์`,
    });
    queued += ids.length;
  }
  console.log(`ส่งเข้าคิวแล้ว ${queued} แถว`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
