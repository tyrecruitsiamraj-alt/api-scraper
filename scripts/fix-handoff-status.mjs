// รอบที่ถูก "สลับบัญชี" ไปแล้ว เคยบันทึกเป็น failed ทำให้ขึ้นในแท็บ "ติดปัญหา" ทั้งที่งานไม่ได้ล้ม
// รันครั้งเดียวเพื่อแก้ของเก่าให้เป็น handed_off:  node scripts/fix-handoff-status.mjs
import 'dotenv/config';
import pg from 'pg';

const AP = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
const client = new pg.Client(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);
await client.connect();
await client.query(`SET search_path TO "${AP}"`);

const { rows } = await client.query(
  `UPDATE post_run_queue
      SET status = 'handed_off', updated_at = NOW()
    WHERE status = 'failed'
      AND error LIKE '%ย้ายงานให้บัญชีที่ว่างแล้ว'
  RETURNING id, message`,
);

console.log(`แก้สถานะแล้ว ${rows.length} รอบ`);
for (const r of rows) console.log(`  ${r.message}`);
await client.end();
