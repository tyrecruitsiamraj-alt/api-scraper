// ล้างข้อมูลทดสอบเพื่อเริ่มรันจริงใหม่ — รันบนเครื่องที่มี .env (DB):
//   node scripts/reset-test-data.mjs
//
// ลบ: งาน Content (campaigns/contents/posts), งาน Autopost (jobs/assignments/คิว/log),
//     scrape task ทั้งหมด, คิว work_queue
// เก็บ: คลังผู้สมัคร (candidates/sources/assets), บัญชี FB (users), กลุ่ม (groups),
//       connector scraper, ประวัติ scrape_runs
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const sc = process.env.DB_SCHEMA || 'public';
const ap = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';

async function wipe(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log(`  ✓ ${label}: ลบ ${r.rowCount} แถว`);
  } catch (e) {
    console.log(`  – ${label}: ข้าม (${e.message})`);
  }
}

console.log('== ฝั่ง Content (orchestrator) ==');
await wipe('campaign_posts', `DELETE FROM "${sc}".campaign_posts`);
await wipe('campaign_contents', `DELETE FROM "${sc}".campaign_contents`);
await wipe('recruit_campaigns', `DELETE FROM "${sc}".recruit_campaigns`);

console.log('== คิวงาน ==');
await wipe('work_queue', `DELETE FROM "${sc}".work_queue`);

console.log('== scrape task (เก็บ candidates + scrape_runs) ==');
await wipe('scrape_tasks', `DELETE FROM "${sc}".scrape_tasks`);

console.log('== ฝั่ง Autopost (เก็บ users + groups) ==');
await wipe('post_logs', `DELETE FROM "${ap}".post_logs`);
await wipe('run_logs', `DELETE FROM "${ap}".run_logs`);
await wipe('post_run_queue', `DELETE FROM "${ap}".post_run_queue`);
await wipe('assignments', `DELETE FROM "${ap}".assignments`);
await wipe('jobs', `DELETE FROM "${ap}".jobs`);

console.log('\nเสร็จ ✓ ศูนย์งานจะว่าง พร้อมรันจริงใหม่ (คลังผู้สมัคร/บัญชี/กลุ่ม/connector ยังอยู่ครบ)');
await c.end();
