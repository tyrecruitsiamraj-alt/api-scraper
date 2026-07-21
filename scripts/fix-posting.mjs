// แก้ปัญหาโพสต์ค้างแบบครบจบในคำสั่งเดียว — รันบนเครื่อง worker (Mac):
//   node scripts/fix-posting.mjs
//
// ทำ 2 อย่าง:
//   1) ปลด lock: งานโพสต์ที่ค้าง 'running' เกิน 15 นาที (Chrome ถูกปิด/worker ตาย) → 'failed'
//      เพื่อให้บัญชีรับงานใหม่ได้ (ไม่งั้นค้างได้ถึง 8 ชม.)
//   2) ผูกกลุ่ม: เอากลุ่มทั้งหมดในตาราง groups ไปใส่ให้ทุกบัญชี FB ที่ยังไม่มีกลุ่ม
//      (บัญชีที่ group_ids ว่าง = โพสต์ไม่ได้ เพราะไม่มีปลายทาง)
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const ap = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';

// 1) ปลด lock งานค้าง
const freed = await c.query(
  `UPDATE "${ap}".post_run_queue
      SET status='failed', finished_at=now(),
          error=COALESCE(NULLIF(error,''), 'reset: ค้างเกิน 15 นาที (Chrome ปิด/worker หยุด) — ปลด lock ให้บัญชีรับงานใหม่'),
          message='reset by fix-posting.mjs'
    WHERE status='running' AND started_at < now() - interval '15 minutes'
    RETURNING id, user_id`,
);
console.log(`[1] ปลด lock งานค้าง: ${freed.rowCount} งาน`);
for (const r of freed.rows) console.log(`    - ${r.id} (บัญชี ${r.user_id})`);

// 2) ผูกกลุ่มทั้งหมดเข้าบัญชีที่ยังไม่มีกลุ่ม
const groups = await c.query(`SELECT id, name, fb_group_id FROM "${ap}".groups ORDER BY created_at`);
const groupIds = groups.rows.map((g) => g.id);
if (groupIds.length === 0) {
  console.log('[2] ไม่มีกลุ่มในระบบ — ข้าม (ต้องเพิ่มกลุ่มก่อน)');
} else {
  console.log(`[2] กลุ่มในระบบ ${groupIds.length} กลุ่ม: ${groups.rows.map((g) => `${g.name}(${g.fb_group_id})`).join(', ')}`);
  const linked = await c.query(
    `UPDATE "${ap}".users
        SET group_ids = $1::jsonb, updated_at = now()
      WHERE group_ids IS NULL
         OR jsonb_typeof(group_ids) <> 'array'
         OR jsonb_array_length(group_ids) = 0
      RETURNING id, name`,
    [JSON.stringify(groupIds)],
  );
  console.log(`    ผูกกลุ่มให้บัญชีที่ยังว่าง: ${linked.rowCount} บัญชี`);
  for (const r of linked.rows) console.log(`    - ${r.name} (${r.id})`);
}

console.log('\nเสร็จ ✓ ไปที่เว็บ → ศูนย์งาน → กด "ลองโพสต์ใหม่" แล้วนั่งดูจอ Chrome บน Mac ว่า login ผ่านไหม');
await c.end();
