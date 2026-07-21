// ล้างแถว work_queue สถานะ error ที่อ้าง scrape_task ซึ่งถูกลบไปแล้ว (ขยะ — ไม่มีทางรันสำเร็จ)
// ใช้: node scripts/cleanup-stale-queue.js
import 'dotenv/config';
import { query, closePool } from '../src/db/pool.js';

const { rows } = await query(
  `DELETE FROM work_queue w
    WHERE w.status = 'error' AND w.type = 'scrape' AND w.ref_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM scrape_tasks t WHERE t.id = w.ref_id)
    RETURNING w.id, w.connector_key`,
);
for (const r of rows) console.log(`ลบ: ${r.id} (${r.connector_key})`);
console.log(`รวมลบขยะ ${rows.length} แถว`);
await closePool();
