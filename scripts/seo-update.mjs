// SEO Trend Updater — หา "คำค้นตำแหน่งมาแรง" ต่อ Job Family ด้วย Ollama (ฟรี)
// แล้ว upsert ลงตาราง job_trends (schema-012) ให้ jd-analyzer/content-orchestrator ใช้
//
// รันเอง:      node scripts/seo-update.mjs
// รันอัตโนมัติ: ติดตั้ง cron บน Mac ด้วย scripts/setup-seo-cron.command (ทุกจันทร์ 08:30)
//
// ต้องมีใน .env: OLLAMA_BASE_URL + DB (DATABASE_URL หรือ PG*) + DB_SCHEMA
import 'dotenv/config';
import pg from 'pg';

const FAMILIES = [
  ['A', '🎭 Presentation-Forward', 'PR, พนักงานต้อนรับ, GRO, MC, Ground Staff, งานขาย/บริการลูกค้า'],
  ['B', '🔧 Technical-Skilled', 'ช่างไฟฟ้า, ช่างซ่อมบำรุง, ช่างอาคาร, โปรแกรมเมอร์, ไอทีซัพพอร์ต'],
  ['C', '🚗 Transport/Driver', 'พนักงานขับรถผู้บริหาร, พนักงานขับรถส่วนกลาง, วาเลต์'],
  ['D', '📋 Service-Operational', 'ธุรการ, แคชเชียร์, พนักงานคลังสินค้า, แม่บ้าน'],
  ['E', '🛡️ Security/Control', 'รปภ., เจ้าหน้าที่รักษาความปลอดภัย'],
  ['F', '🌳 Field/Outdoor Labor', 'คนสวน, รุกขกร, พนักงานดูแลพื้นที่สีเขียว'],
];

const SCHEMA_JSON = {
  type: 'object',
  properties: {
    keywords: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'คำค้นตำแหน่งภาษาไทยสั้น 1-3 คำ ที่คนใช้จริงในเรซูเม่' },
          volume: { type: 'integer', description: 'ความต้องการในตลาด 1-100 (มาก=มาแรง)' },
          competition: { type: 'string', enum: ['low', 'medium', 'high'], description: 'การแข่งขันแย่งผู้สมัคร' },
          note: { type: 'string', description: 'insight สั้น 1 ประโยค' },
        },
        required: ['keyword', 'volume', 'competition', 'note'],
      },
    },
  },
  required: ['keywords'],
};

function parseJsonLoose(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* ต่อ */ }
  const cleaned = s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* ต่อ */ }
  // ลอง extract ทั้ง object {…} และ array […] (โมเดลตอบไม่นิ่ง)
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const i = cleaned.indexOf(open);
    const j = cleaned.lastIndexOf(close);
    if (i >= 0 && j > i) { try { return JSON.parse(cleaned.slice(i, j + 1)); } catch { /* ต่อ */ } }
  }
  return null;
}

async function trendsForFamily(base, model, [code, label, examples]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: { temperature: 0.5, num_predict: 2048 },
        format: SCHEMA_JSON,
        messages: [
          {
            role: 'system',
            content:
              'คุณคือผู้เชี่ยวชาญตลาดแรงงานไทยของบริษัท Outsource. ตอบเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น. ' +
              'คำค้นต้องเป็นภาษาไทยล้วน สั้น 1-3 คำ (เช่น "พนักงานขาย", "ช่างไฟฟ้า") ห้ามวลียาว ห้ามอังกฤษ.',
          },
          {
            role: 'user',
            content:
              `Job Family ${code} ${label} (ตัวอย่างตำแหน่ง: ${examples})\n` +
              'ขอ "คำค้นตำแหน่งมาแรง" 5-8 คำของ Family นี้ในตลาดแรงงานไทยตอนนี้ ' +
              'พร้อม volume (1-100), competition (low/medium/high), และ insight สั้น ๆ ต่อคำ',
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const json = await res.json();
    const content = String(json?.message?.content ?? '');
    const out = parseJsonLoose(content);
    // โมเดลตอบไม่นิ่ง: array ตรง ๆ / {keywords:[…]} / ห่อด้วย key มั่ว (market_trends_thailand ฯลฯ)
    // → สแกนหา array ของ object ที่มี field 'keyword' ในทุก key
    const pickList = (o) => {
      if (Array.isArray(o)) return o;
      if (o && typeof o === 'object') {
        for (const v of Object.values(o)) {
          if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'keyword' in x)) return v;
        }
      }
      return [];
    };
    const list = pickList(out);
    if (list.length === 0 && process.env.SEO_DEBUG === '1') {
      console.log(`    [debug] done=${json?.done_reason} len=${content.length} head=${content.slice(0, 160).replace(/\n/g, ' ')}`);
    }
    // กันคำเพี้ยน: ไทยล้วน + ไม่ยาวเกิน
    return list
      .map((k) => ({
        keyword: String(k.keyword ?? '').trim(),
        volume: Math.max(1, Math.min(100, Number(k.volume) || 50)),
        competition: ['low', 'medium', 'high'].includes(String(k.competition ?? '').toLowerCase())
          ? String(k.competition).toLowerCase()
          : 'medium',
        note: String(k.note ?? k.insight ?? '').trim().slice(0, 300),
      }))
      .filter((k) => k.keyword && !/[A-Za-z]/.test(k.keyword) && k.keyword.length <= 22);
  } finally {
    clearTimeout(timer);
  }
}

const base = process.env.OLLAMA_BASE_URL;
if (!base) { console.error('ไม่มี OLLAMA_BASE_URL ใน .env — รันไม่ได้'); process.exit(1); }
const model = process.env.OLLAMA_MODEL || 'qwen3.5:9b';

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const sc = process.env.DB_SCHEMA || 'public';

console.log(`SEO Trend Update — ${new Date().toLocaleString('th-TH')} (model ${model})`);
let total = 0;
for (const fam of FAMILIES) {
  const [code, label] = fam;
  try {
    // โมเดลตอบไม่นิ่ง — ว่างให้ลองซ้ำสูงสุด 3 รอบ
    let keywords = [];
    for (let attempt = 1; attempt <= 3 && keywords.length === 0; attempt += 1) {
      if (attempt > 1) console.log(`[${code}] รอบ ${attempt}/3 (รอบก่อนว่าง)`);
      keywords = await trendsForFamily(base, model, fam);
    }
    for (const k of keywords) {
      await c.query(
        `INSERT INTO "${sc}".job_trends (family, keyword, volume, competition, note, source)
         VALUES ($1,$2,$3,$4,$5,'seo-update')
         ON CONFLICT (family, keyword)
         DO UPDATE SET volume=EXCLUDED.volume, competition=EXCLUDED.competition,
                       note=EXCLUDED.note, source=EXCLUDED.source, captured_at=now()`,
        [code, k.keyword, k.volume, k.competition, k.note],
      );
    }
    total += keywords.length;
    console.log(`[${code} ${label}] ${keywords.length} คำ: ${keywords.map((k) => `${k.keyword}(${k.volume}/${k.competition})`).join(', ')}`);
  } catch (e) {
    console.warn(`[${code}] ข้าม — ${e.message}`);
  }
}
console.log(`\nเสร็จ ✓ อัปเดต ${total} คำเข้า job_trends`);
await c.end();
