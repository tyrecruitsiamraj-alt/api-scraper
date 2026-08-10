// เติมคำค้นสรรหาที่ Google Trends "แนะนำข้อความค้นหา" ให้ Trend Agent
// ไม่อ้างว่าเป็น volume: แหล่งนี้ยืนยันได้เพียงว่า Google แนะนำคำดังกล่าว
// รันเอง: node scripts/google-trends-suggest.mjs
import 'dotenv/config';
import pg from 'pg';
import { fetchGoogleTrendsSuggestions, pickRelevantSuggestions } from '../src/core/google-trends-suggest.js';

const FAMILIES = [
  { family: 'A', seeds: ['พนักงานต้อนรับ', 'พนักงานขาย'], include: ['พนักงานต้อนรับ', 'พนักงานขาย', 'เจ้าหน้าที่ประชาสัมพันธ์'], exclude: ['เกม', 'เพลง', 'โรงเรียน', 'ของเก่า'] },
  { family: 'B', seeds: ['ช่างไฟฟ้า', 'ช่างซ่อมบำรุง'], include: ['ช่างไฟฟ้า', 'ช่างซ่อมบำรุง', 'ช่างอาคาร', 'ไอทีซัพพอร์ต'], exclude: ['เกม', 'เรียน', 'นิยาย', 'ค้อน', 'เครื่องมือ', 'ชุด', 'คู่มือ'] },
  { family: 'C', seeds: ['พนักงานขับรถ', 'คนขับรถผู้บริหาร'], include: ['พนักงานขับรถ', 'คนขับรถ', 'วาเลต์'], exclude: ['เกม', 'ออฟโร้ด', 'โรงพยาบาล', 'พยาบาล', 'แท็กซี่', 'ลอนดอน', 'สโตนเฮนจ์', 'บาธ', 'เที่ยว', 'ทัวร์', 'ต่างประเทศ'] },
  { family: 'D', seeds: ['พนักงานธุรการ', 'พนักงานคลังสินค้า'], include: ['พนักงานธุรการ', 'พนักงานคลังสินค้า', 'แคชเชียร์', 'แม่บ้าน'], exclude: ['เกม', 'เรียน', 'นิยาย'] },
  { family: 'E', seeds: ['พนักงานรักษาความปลอดภัย'], include: ['รปภ', 'รักษาความปลอดภัย', 'security guard'], exclude: ['เกม', 'ตำรวจ', 'ทหาร'] },
  { family: 'F', seeds: ['คนสวน', 'พนักงานดูแลสวน'], include: ['คนสวน', 'คนทำสวน', 'พนักงานดูแลสวน', 'ภูมิทัศน์'], exclude: ['เกม', 'ต้นไม้เกม', 'นิยาย', 'สวนสัตว์', 'พระราชวัง'] },
];

const MAX_PER_FAMILY = Math.max(1, Math.min(12, Number(process.env.GOOGLE_TRENDS_MAX_PER_FAMILY) || 6));
const SOURCE_URL = 'https://trends.google.co.th/trends/explore?hl=th&geo=TH';

function dbConfig() {
  return process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE };
}

const client = new pg.Client(dbConfig());
const schema = process.env.DB_SCHEMA || 'public';
await client.connect();
await client.query(`SET search_path TO "${schema.replace(/"/g, '""')}"`);

let saved = 0;
for (const config of FAMILIES) {
  const collected = new Map();
  for (const seed of config.seeds) {
    try {
      const suggestions = await fetchGoogleTrendsSuggestions(seed);
      // Include the seed because it is a verified position term; related terms
      // must satisfy the family guard to prevent noisy autocomplete results.
      const relevant = pickRelevantSuggestions([{ keyword: seed, type: 'ข้อความค้นหา', rank: 0 }, ...suggestions], {
        include: config.include,
        exclude: config.exclude,
        limit: MAX_PER_FAMILY,
      });
      for (const item of relevant) if (!collected.has(item.keyword)) collected.set(item.keyword, { ...item, seed });
    } catch (error) {
      console.warn(`[${config.family}] ข้าม ${seed}: ${error.message}`);
    }
  }

  const selected = [...collected.values()].slice(0, MAX_PER_FAMILY);
  // Replace only evidence this connector owns. Never delete manual or AI data;
  // if Google is unavailable, retain the last successful observed suggestions.
  if (selected.length) {
    await client.query(`DELETE FROM job_trends WHERE family = $1 AND source = 'google-trends-suggest'`, [config.family]);
  }
  for (const item of selected) {
    await client.query(
      `INSERT INTO job_trends
         (family, keyword, volume, competition, note, source, score_type, observed_volume, confidence, sample_size, source_url, captured_at)
       VALUES ($1,$2,NULL,'medium',$3,'google-trends-suggest','observed',NULL,0.70,1,$4,now())
       ON CONFLICT (family, keyword) DO UPDATE SET
         volume=NULL, competition='medium', note=EXCLUDED.note, source=EXCLUDED.source,
         score_type='observed', observed_volume=NULL, confidence=EXCLUDED.confidence,
         sample_size=EXCLUDED.sample_size, source_url=EXCLUDED.source_url, captured_at=now()`,
      [config.family, item.keyword, `Google Trends แนะนำจากคำค้น “${item.seed}” (ลำดับ ${item.rank || 0}; ${item.type}) — เป็นคำแนะนำ ไม่ใช่ปริมาณการค้นหา`, SOURCE_URL],
    );
    saved += 1;
  }
  console.log(`[${config.family}] เก็บ ${selected.length} คำ: ${selected.map((x) => x.keyword).join(', ') || '-'}`);
}
console.log(`เสร็จ ✓ บันทึก keyword evidence จาก Google Trends ${saved} รายการ`);
await client.end();
