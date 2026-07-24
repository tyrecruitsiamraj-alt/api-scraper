// Trend Discovery — ระบบ "ไปสำรวจกลุ่ม FB เอง" แล้วเสนอเทรนด์ที่กำลังมา (ไม่ต้องให้คนพิมพ์)
//
// ทำงาน: อ่านโพสต์ล่าสุดในกลุ่ม (content_group_sources) ผ่าน mbasic + cookie session เดิมของ
// autopost (เบา ไม่เปิด browser เต็ม) → ให้ Ollama สรุปเป็น "เทรนด์/มุม/สไตล์รูป" ที่กำลังมา →
// upsert content_trends เป็น source='discovered' active=false (รอคนกดอนุมัติที่ /settings/trends)
//
// รันเอง:      node scripts/trend-discover.mjs
// รันอัตโนมัติ: cron รายสัปดาห์ (ดู setup-seo-cron.command) — หมุนทีละไม่กี่กลุ่มต่อรอบ (footprint ต่ำ)
//
// ⚠️ ต้องรันบน Mac ที่มี session FB (autopost/.auth) + headful เคยล็อกอินแล้ว
//    ToS: อ่านอย่างเดียว, สัปดาห์ละครั้ง, ไม่กี่กลุ่ม/รอบ, หน่วงเวลาแบบคน — เสี่ยงต่ำ
//    mbasic อาจเปลี่ยน/เด้ง checkpoint → ต่อกลุ่มไหนอ่านไม่ได้ก็ข้าม (fail-soft)
//
// ต้องมีใน .env: OLLAMA_BASE_URL + DB (DATABASE_URL/PG*) + DB_SCHEMA
//   optional: FB_SESSION_PATH (ไฟล์ storageState), TREND_MAX_GROUPS (default 6)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import * as cheerio from 'cheerio';

const MAX_GROUPS = Math.max(1, Math.min(20, Number(process.env.TREND_MAX_GROUPS) || 6));
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const RECRUIT_HINT = /(รับสมัคร|หางาน|สมัครงาน|เงินเดือน|รายได้|ด่วน|พนักงาน|ตำแหน่ง|จ้าง|part.?time|full.?time)/i;

/** หา storageState ของ FB จาก autopost/.auth (ไฟล์ล่าสุด) หรือ FB_SESSION_PATH */
function findSessionFile() {
  if (process.env.FB_SESSION_PATH && fs.existsSync(process.env.FB_SESSION_PATH)) return process.env.FB_SESSION_PATH;
  const dir = path.join(process.cwd(), 'autopost', '.auth');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /^facebook-.*\.json$/i.test(f))
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  return files[0] ? path.join(dir, files[0].f) : null;
}

/** สร้าง Cookie header สำหรับ facebook.com จาก storageState */
function cookieHeader(sessionFile) {
  const state = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const cookies = (state.cookies || []).filter((c) => /facebook\.com$/.test((c.domain || '').replace(/^\./, '')));
  if (!cookies.some((c) => c.name === 'c_user')) return null; // ไม่มี login cookie = ใช้ไม่ได้
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** อ่าน snippet โพสต์รับสมัครในกลุ่มผ่าน mbasic (fail-soft: [] ถ้าอ่านไม่ได้) */
async function readGroupSnippets(groupId, cookie) {
  try {
    const res = await fetch(`https://mbasic.facebook.com/groups/${groupId}`, {
      headers: { 'User-Agent': UA, Cookie: cookie, 'Accept-Language': 'th-TH,th;q=0.9' },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, snippets: [], reason: `HTTP ${res.status}` };
    const html = await res.text();
    if (/checkpoint|login\.php|เข้าสู่ระบบ/i.test(html) && !/groups/i.test(html.slice(0, 500))) {
      return { ok: false, snippets: [], reason: 'session เด้ง login/checkpoint' };
    }
    const $ = cheerio.load(html);
    const seen = new Set();
    const snippets = [];
    // mbasic วางเนื้อโพสต์ในหลาย container — กวาดข้อความยาว ๆ ที่มีสัญญาณรับสมัคร
    $('div,p,span').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length < 25 || t.length > 600) return;
      if (!RECRUIT_HINT.test(t)) return;
      const key = t.slice(0, 60);
      if (seen.has(key)) return;
      seen.add(key);
      snippets.push(t);
    });
    return { ok: true, snippets: snippets.slice(0, 15), reason: '' };
  } catch (e) {
    return { ok: false, snippets: [], reason: e.message };
  }
}

const TREND_SCHEMA = {
  type: 'object',
  properties: {
    trends: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'ชื่อเทรนด์/มุม/มีมสั้น ๆ ที่กำลังเห็นบ่อยในโพสต์รับสมัคร' },
          note: { type: 'string', description: 'วิธีเอาไปใช้กับคอนเทนต์รับสมัคร สั้น 1 ประโยค' },
          for_image: { type: 'boolean', description: 'เหมาะเอาไปใช้กับรูปด้วยไหม' },
        },
        required: ['label', 'note', 'for_image'],
      },
    },
  },
  required: ['trends'],
};

function parseLoose(raw) {
  const s = String(raw ?? '').trim();
  try { return JSON.parse(s); } catch { /* ต่อ */ }
  const cleaned = s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const i = cleaned.indexOf('{'); const j = cleaned.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(cleaned.slice(i, j + 1)); } catch { /* ต่อ */ } }
  return null;
}

/** ให้ Ollama สรุป snippet ทั้งหมด → เทรนด์ที่กำลังมา */
async function summarizeTrends(base, model, snippets) {
  if (snippets.length === 0) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model, stream: false, think: false,
        options: { temperature: 0.4, num_predict: 2048 },
        format: TREND_SCHEMA,
        messages: [
          { role: 'system', content: 'คุณคือนักวิเคราะห์คอนเทนต์สรรหาบน Facebook ไทย ดูโพสต์รับสมัครจริงในกลุ่มแล้วสรุป "เทรนด์/มุม/คำพูด/มีมที่กำลังมา" ที่คนใช้แล้วได้ผล ตอบ JSON ตามโครงสร้างเท่านั้น ภาษาไทย สั้น' },
          { role: 'user', content: `นี่คือข้อความโพสต์รับสมัครล่าสุดจากหลายกลุ่ม:\n\n${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nสรุป 4-8 เทรนด์/มุม/คำพูดที่เห็นบ่อยและน่าเอามาใช้กับโพสต์รับสมัครของเราตอนนี้` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const json = await res.json();
    const out = parseLoose(json?.message?.content);
    const list = Array.isArray(out?.trends) ? out.trends : [];
    return list
      .map((t) => ({ label: String(t.label ?? '').trim(), note: String(t.note ?? '').trim().slice(0, 300), forImage: t.for_image !== false }))
      .filter((t) => t.label && t.label.length <= 60);
  } finally {
    clearTimeout(timer);
  }
}

// ---- main ----
const base = process.env.OLLAMA_BASE_URL;
if (!base) { console.error('ไม่มี OLLAMA_BASE_URL ใน .env'); process.exit(1); }
const model = process.env.OLLAMA_MODEL || 'qwen3.5:9b';

const sessionFile = findSessionFile();
if (!sessionFile) { console.error('ไม่พบ session FB (autopost/.auth/facebook-*.json หรือ FB_SESSION_PATH) — ต้องล็อกอิน autopost ก่อน'); process.exit(1); }
const cookie = cookieHeader(sessionFile);
if (!cookie) { console.error(`session ${path.basename(sessionFile)} ไม่มี cookie login (c_user) — ล็อกอินใหม่`); process.exit(1); }

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const sc = process.env.DB_SCHEMA || 'public';
await c.query(`SET search_path TO "${sc}"`);

// หมุนทีละไม่กี่กลุ่ม (เก่าสุดก่อน) — วนครบทุกกลุ่มข้ามสัปดาห์ footprint ต่ำ
const { rows: groups } = await c.query(
  `SELECT id, fb_group_id FROM content_group_sources WHERE active = true
    ORDER BY last_scanned_at NULLS FIRST, created_at LIMIT $1`, [MAX_GROUPS]);
if (groups.length === 0) { console.log('ไม่มีกลุ่มให้สำรวจ (รัน seed-research-groups.mjs ก่อน)'); await c.end(); process.exit(0); }

console.log(`Trend Discovery — ${new Date().toLocaleString('th-TH')} · สำรวจ ${groups.length} กลุ่ม (session ${path.basename(sessionFile)})`);
const allSnippets = [];
for (const g of groups) {
  const { ok, snippets, reason } = await readGroupSnippets(g.fb_group_id, cookie);
  console.log(`  [${g.fb_group_id}] ${ok ? `${snippets.length} snippet` : `ข้าม (${reason})`}`);
  allSnippets.push(...snippets);
  await c.query(`UPDATE content_group_sources SET last_scanned_at = now() WHERE id = $1`, [g.id]);
  await sleep(3000 + Math.floor(Math.random() * 3000)); // หน่วงแบบคน
}

// dedupe snippet ข้ามกลุ่ม แล้วให้ Ollama สรุป
const uniq = [...new Map(allSnippets.map((s) => [s.slice(0, 60), s])).values()].slice(0, 60);
console.log(`\nรวม ${uniq.length} snippet (ไม่ซ้ำ) → ให้ Ollama สรุปเทรนด์...`);
let trends = [];
if (uniq.length > 0) {
  for (let attempt = 1; attempt <= 3 && trends.length === 0; attempt += 1) {
    if (attempt > 1) console.log(`  สรุปรอบ ${attempt}/3`);
    try { trends = await summarizeTrends(base, model, uniq); } catch (e) { console.warn(`  สรุปล้ม: ${e.message}`); }
  }
}

let added = 0;
for (const t of trends) {
  // เสนอเป็น discovered + active=false (รอคนอนุมัติ); label ซ้ำ (manual/discovered เดิม) = ข้าม
  const r = await c.query(
    `INSERT INTO content_trends (label, note, for_caption, for_image, active, source, discovered_at)
     VALUES ($1, $2, true, $3, false, 'discovered', now())
     ON CONFLICT (lower(label)) DO NOTHING`,
    [t.label, t.note || null, t.forImage],
  );
  added += r.rowCount;
}
console.log(`\nเสร็จ ✓ ระบบเสนอเทรนด์ใหม่ ${added} รายการ (จากที่สรุปได้ ${trends.length}) — รออนุมัติที่ /settings/trends`);
if (trends.length) console.log(`เทรนด์ที่เสนอ: ${trends.map((t) => t.label).join(', ')}`);
await c.end();
