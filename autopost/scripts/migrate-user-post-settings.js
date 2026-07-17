/**
 * ตั้ง post_settings เดียวกันให้ทุก User — ลดโอกาสโดน FB จำกัดโพสต์
 */
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = process.env.DB_SCHEMA || 'so_autopost_apiscraper';

const POST_SETTINGS = {
  delay_between_posts_min: 60,
  delay_between_posts_max: 150,
  batch_size: 5,
  break_time_min: 300,
  break_time_max: 900,
};

async function run() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL ไม่ได้ตั้งค่า');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  const schemaName = SCHEMA.includes('-') ? `"${SCHEMA}"` : SCHEMA;

  try {
    const res = await pool.query(
      `UPDATE ${schemaName}.users SET post_settings = $1::jsonb RETURNING id, name, env_key`,
      [JSON.stringify(POST_SETTINGS)]
    );
    console.log(`✅ อัปเดต post_settings ให้ ${res.rowCount} user(s):`);
    for (const row of res.rows) {
      console.log(`   - ${row.name || row.id} (${row.env_key || row.id})`);
    }
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
