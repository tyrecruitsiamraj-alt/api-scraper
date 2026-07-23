// วิเคราะห์ "ช่วงเวลาโพสต์ที่ได้ผล" จาก post_logs ของ autopost (เวลาโพสต์ × คอมเมนต์/lead)
// → upsert ลง post_time_insights (schema-013) ให้เว็บ/คนวางแผนใช้
// รันเอง: node scripts/best-time-update.mjs — หรือ cron จันทร์ 08:45 (setup-seo-cron.command ติดตั้งให้)
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const sc = process.env.DB_SCHEMA || 'public';
const ap = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';

// เวลาไทย (DB อาจเก็บ UTC) — แปลงก่อนแตก dow/hour
const rows = (await c.query(`
  SELECT EXTRACT(dow  FROM created_at AT TIME ZONE 'Asia/Bangkok')::int AS dow,
         EXTRACT(hour FROM created_at AT TIME ZONE 'Asia/Bangkok')::int AS hour,
         count(*)::int AS posts,
         COALESCE(SUM(comment_count), 0)::int AS comments,
         count(*) FILTER (WHERE NULLIF(TRIM(COALESCE(customer_phone, '')), '') IS NOT NULL)::int AS leads
    FROM "${ap}".post_logs
   GROUP BY 1, 2
`)).rows;

let n = 0;
for (const r of rows) {
  const score = r.posts > 0 ? (r.comments + r.leads * 5) / r.posts : 0;
  await c.query(
    `INSERT INTO "${sc}".post_time_insights (dow, hour, posts, comments, leads, score, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (dow, hour) DO UPDATE SET posts=EXCLUDED.posts, comments=EXCLUDED.comments,
       leads=EXCLUDED.leads, score=EXCLUDED.score, updated_at=now()`,
    [r.dow, r.hour, r.posts, r.comments, r.leads, score.toFixed(3)],
  );
  n += 1;
}
console.log(`Best-time update ✓ ${n} ช่วงเวลา (จาก post_logs ${rows.reduce((a, r) => a + r.posts, 0)} โพสต์)`);
if (n === 0) console.log('ยังไม่มีข้อมูลโพสต์พอ — เว็บจะโชว์คำแนะนำทั่วไปแทน (เช้า 7-9 / เที่ยง 12-13 / เย็น 18-20)');
await c.end();
