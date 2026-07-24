// บันทึกกลุ่ม FB ที่ใช้เป็นแหล่งสำรวจเทรนด์ (content_group_sources, schema-017)
// รันครั้งเดียว:  node scripts/seed-research-groups.mjs
// ต้องมีใน .env: DB (DATABASE_URL หรือ PG*) + DB_SCHEMA  (รัน `npm run migrate` มาก่อน)
import 'dotenv/config';
import pg from 'pg';

// รายการกลุ่มจากผู้ใช้ (มีซ้ำ/มี slug — สคริปต์ dedupe ให้)
const URLS = [
  'https://www.facebook.com/groups/247383669264410',
  'https://www.facebook.com/groups/1317036272233873',
  'https://www.facebook.com/groups/297603253907313',
  'https://www.facebook.com/groups/448099235530340',
  'https://www.facebook.com/groups/752727929851289',
  'https://www.facebook.com/groups/353962228301485',
  'https://www.facebook.com/groups/2230121597199356',
  'https://www.facebook.com/groups/299450851856799',
  'https://www.facebook.com/groups/1398230516956714',
  'https://www.facebook.com/groups/873884635154852',
  'https://www.facebook.com/groups/1133600676708896',
  'https://www.facebook.com/groups/527191124628457',
  'https://www.facebook.com/groups/485394817457847',
  'https://www.facebook.com/groups/238958263454972',
  'https://www.facebook.com/groups/2856298791061952',
  'https://www.facebook.com/groups/3651703055105104',
  'https://www.facebook.com/groups/2488002158201060',
  'https://www.facebook.com/groups/460239827738024',
  'https://www.facebook.com/groups/719446002711613',
  'https://www.facebook.com/groups/433203029287064',
  'https://www.facebook.com/groups/1671676653270065',
  'https://www.facebook.com/groups/2168728903310453',
  'https://www.facebook.com/groups/583362260400984',
  'https://www.facebook.com/groups/275382586611711',
  'https://www.facebook.com/groups/1761357180763205',
  'https://www.facebook.com/groups/628472380983502',
  'https://www.facebook.com/groups/884533619479424',
  'https://www.facebook.com/groups/550295531832556',
  'https://www.facebook.com/groups/790225611674090',
  'https://www.facebook.com/groups/konkubrod',
  'https://www.facebook.com/groups/102927176763949',
  'https://www.facebook.com/groups/851390394955768',
  'https://www.facebook.com/groups/1486494998623206',
  'https://www.facebook.com/groups/226719385068994',
  'https://www.facebook.com/groups/514944699203781',
  'https://www.facebook.com/groups/423954682082863',
];

/** ดึง group id/slug จาก URL */
function parseGroup(url) {
  const m = String(url).match(/groups\/([^/?#]+)/i);
  return m ? m[1].trim() : null;
}

const seen = new Set();
const groups = [];
for (const url of URLS) {
  const id = parseGroup(url);
  if (!id || seen.has(id)) continue;
  seen.add(id);
  groups.push({ id, url });
}

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const sc = process.env.DB_SCHEMA || 'public';
await c.query(`SET search_path TO "${sc}"`);

let added = 0;
for (const g of groups) {
  const r = await c.query(
    `INSERT INTO content_group_sources (fb_group_id, url)
     VALUES ($1, $2) ON CONFLICT (fb_group_id) DO NOTHING`,
    [g.id, g.url],
  );
  added += r.rowCount;
}
console.log(`บันทึกกลุ่มสำรวจเทรนด์: ${groups.length} กลุ่ม (ไม่ซ้ำ) · เพิ่มใหม่ ${added} · มีอยู่แล้ว ${groups.length - added}`);
await c.end();
