// Trend Discovery — ระบบ "ไปสำรวจกลุ่ม FB เอง" แล้วเสนอเทรนด์ที่กำลังมา (ไม่ต้องให้คนพิมพ์)
//
// ทำงาน: เปิดกลุ่ม (content_group_sources) ด้วย Playwright + session เดิมของ autopost (headful)
// อ่านโพสต์รับสมัครล่าสุด → ให้ Ollama สรุปเป็น "เทรนด์/มุม/สไตล์รูป" ที่กำลังมา →
// upsert content_trends เป็น source='discovered' active=false (รอคนกดอนุมัติที่ /settings/trends)
//
// รันเอง:      node scripts/trend-discover.mjs
// รันอัตโนมัติ: cron รายสัปดาห์ — หมุนทีละไม่กี่กลุ่มต่อรอบ (footprint ต่ำ)
//
// ⚠️ ต้องรันบน Mac ที่มี session FB (autopost/.auth) ล็อกอินแล้ว + มีจอ (headful กัน bot-detect)
//    ToS: อ่านอย่างเดียว, สัปดาห์ละครั้ง, ไม่กี่กลุ่ม/รอบ, หน่วงแบบคน — เสี่ยงต่ำ
//    ต่อกลุ่มไหนเปิด/อ่านไม่ได้ก็ข้าม (fail-soft)
//
// ต้องมีใน .env: OLLAMA_BASE_URL + DB (DATABASE_URL/PG*) + DB_SCHEMA
//   optional: FB_SESSION_PATH (storageState), TREND_MAX_GROUPS (default 6), TREND_HEADLESS=1 (บังคับ headless)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';

const MAX_GROUPS = Math.max(1, Math.min(20, Number(process.env.TREND_MAX_GROUPS) || 6));
const HEADLESS = process.env.TREND_HEADLESS === '1'; // default headful (FB จับ headless ง่าย)
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const RECRUIT_HINT = /(รับสมัคร|หางาน|สมัครงาน|เงินเดือน|รายได้|ด่วน|พนักงาน|ตำแหน่ง|จ้าง|part.?time|full.?time)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** หา storageState ของ FB จาก autopost/.auth (ไฟล์ล่าสุด) หรือ FB_SESSION_PATH */
function findSessionFile() {
  if (process.env.FB_SESSION_PATH && fs.existsSync(process.env.FB_SESSION_PATH)) return process.env.FB_SESSION_PATH;
  const dir = path.join(process.cwd(), 'autopost', '.auth');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /^facebook-.*\.json$/i.test(f))
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
  return files[0] ? path.join(dir, files[0].f) : null;
}

/** อ่าน snippet โพสต์รับสมัครในกลุ่มด้วยหน้าที่เปิดอยู่ (fail-soft) */
async function readGroupSnippets(page, groupId) {
  try {
    await page.goto(`https://www.facebook.com/groups/${groupId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await sleep(4000);
    const url = page.url();
    if (/login|checkpoint|\/login\.php/i.test(url)) return { ok: false, snippets: [], reason: 'session เด้ง login/checkpoint' };
    // เลื่อนฟีดโหลดโพสต์เพิ่ม (แบบคน)
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await sleep(2500 + Math.floor(Math.random() * 1500));
    }
    const texts = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div[role="article"]').forEach((el) => {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      });
      return out;
    });
    const seen = new Set();
    const snippets = [];
    for (const raw of texts) {
      const t = String(raw).slice(0, 800).trim();
      if (t.length < 20 || !RECRUIT_HINT.test(t)) continue;
      const key = t.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      snippets.push(t);
    }
    return { ok: true, snippets: snippets.slice(0, 15), reason: '' };
  } catch (e) {
    return { ok: false, snippets: [], reason: e.message.split('\n')[0].slice(0, 80) };
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

const c = new pg.Client(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : { host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });
await c.connect();
const sc = process.env.DB_SCHEMA || 'public';
await c.query(`SET search_path TO "${sc}"`);

const { rows: groups } = await c.query(
  `SELECT id, fb_group_id FROM content_group_sources WHERE active = true
    ORDER BY last_scanned_at NULLS FIRST, created_at LIMIT $1`, [MAX_GROUPS]);
if (groups.length === 0) { console.log('ไม่มีกลุ่มให้สำรวจ (รัน seed-research-groups.mjs ก่อน)'); await c.end(); process.exit(0); }

console.log(`Trend Discovery — ${new Date().toLocaleString('th-TH')} · สำรวจ ${groups.length} กลุ่ม (session ${path.basename(sessionFile)}, headful=${!HEADLESS})`);

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({ storageState: sessionFile, userAgent: DESKTOP_UA, viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
const page = await context.newPage();

const allSnippets = [];
try {
  for (const g of groups) {
    const { ok, snippets, reason } = await readGroupSnippets(page, g.fb_group_id);
    console.log(`  [${g.fb_group_id}] ${ok ? `${snippets.length} snippet` : `ข้าม (${reason})`}`);
    allSnippets.push(...snippets);
    await c.query(`UPDATE content_group_sources SET last_scanned_at = now() WHERE id = $1`, [g.id]);
    await sleep(3000 + Math.floor(Math.random() * 3000));
  }
} finally {
  await browser.close();
}

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
