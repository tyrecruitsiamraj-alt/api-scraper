/* eslint-disable no-console */
/**
 * POC — จำลองการโพสต์ Auto-Post N งาน โดยใช้ "ตรรกะจริง" ของระบบ:
 *   1) ดึงงาน (caption จริง) + กลุ่มของบัญชี จาก DB
 *   2) เลือกคู่ (งาน×กลุ่ม) แบบเดียวกับ buildDailyPostPlan: เรียงตาม yield (เบอร์*3+คอมเมนต์),
 *      ข้ามคู่ที่เพิ่งโพสต์ใน 2 วัน (cooldown)  ← READ-ONLY ไม่จอง/ไม่แตะสถานะจริง
 *   3) เปิด Chrome จริง พิมพ์ caption จริงลง "หน้าสร้างโพสต์จำลอง" (data: URL) พร้อม human delay
 *      *** ไม่ล็อกอิน / ไม่แตะ Facebook จริง / ไม่เผยแพร่ / ไม่เสีย credit ***
 *   4) หน่วงระหว่างโพสต์ถูกย่อ (จริง 60-150s → ~4s) เพื่อให้ดูจบไว
 *
 *   node scripts/poc-autopost-flow.js ["ชื่อบัญชี"] [จำนวนงาน]
 */
require('dotenv').config();
const { Pool } = require('pg');
const { chromium } = require('@playwright/test');

const ACCOUNT = process.argv[2] || 'User 4';
const N = Math.max(1, Math.min(8, Number(process.argv[3]) || 4));
const REPOST_GAP_DAYS = 2;
const t0 = Date.now();
const clk = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function composerHtml(account, group, title, caption) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
  <body style="font-family:system-ui;background:#f0f2f5;margin:0;padding:24px;display:flex;justify-content:center">
  <div style="width:560px;background:#fff;border-radius:12px;box-shadow:0 2px 14px #0002;padding:16px">
    <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee;padding-bottom:12px">
      <div style="width:40px;height:40px;border-radius:50%;background:#1877F2;color:#fff;display:grid;place-items:center;font-weight:700">${esc(account).slice(-1)}</div>
      <div><b>${esc(account)}</b><div style="font-size:12px;color:#65676b">โพสต์ไปยัง <b>${esc(group)}</b> · POC (ไม่ใช่ Facebook จริง)</div></div>
    </div>
    <div id="composer" contenteditable="true" role="textbox"
      style="min-height:150px;font-size:16px;padding:12px 4px;outline:none;white-space:pre-wrap"
      data-placeholder="เขียนอะไรสักหน่อย..."></div>
    <button style="width:100%;background:#1877F2;color:#fff;border:0;border-radius:8px;padding:10px;font-size:15px;font-weight:600;margin-top:8px">โพสต์</button>
  </div></body>`;
}

async function humanType(page, text) {
  for (let i = 0; i < text.length; i += 6) {
    await page.keyboard.insertText(text.slice(i, i + 6));
    await sleep(30 + Math.random() * 70);
  }
}

async function pickPlan(pool, account) {
  const Q = (s, a) => pool.query(s, a).then((r) => r.rows);
  await pool.query('SET search_path TO so_autopost_jobs');
  const u = (await Q(`SELECT id, name FROM users WHERE name = $1 OR poster_name = $1 LIMIT 1`, [account]))[0];
  if (!u) throw new Error(`ไม่พบบัญชี "${account}"`);

  // คู่ (งาน×กลุ่ม) จาก assignments — เหมือน buildDailyPostPlan จริง (group_ids ของ assignment
  // map เข้า groups.id ได้ถูกต้อง ต่างจาก users.group_ids ที่บางบัญชีเป็น id เก่า)
  const raw = await Q(
    `SELECT DISTINCT j.id AS job_id, j.title, j.caption, g.fb_group_id, g.name AS group_name
       FROM assignments a
       CROSS JOIN LATERAL jsonb_array_elements_text(a.job_ids) jid
       CROSS JOIN LATERAL jsonb_array_elements_text(a.group_ids) gid
       JOIN jobs j ON j.id = jid
       JOIN groups g ON g.id = gid
      WHERE a.user_id = $1`,
    [u.id]
  );
  if (raw.length === 0) throw new Error('บัญชีนี้ไม่มีคู่ (งาน×กลุ่ม) ใน assignments');

  const jobIds = [...new Set(raw.map((r) => r.job_id))];
  const stats = await Q(
    `SELECT job_id, group_id,
            count(*) FILTER (WHERE customer_phone IS NOT NULL AND customer_phone<>'')::int AS phones,
            COALESCE(sum(comment_count),0)::int AS comments,
            max(created_at) AS last_posted
       FROM post_logs WHERE job_id = ANY($1) GROUP BY job_id, group_id`,
    [jobIds]
  );
  const stat = new Map(stats.map((s) => [`${s.job_id}::${s.group_id}`, s]));
  const now = Date.now();
  const gapMs = REPOST_GAP_DAYS * 86400 * 1000;

  const pairs = [];
  for (const r of raw) {
    const s = stat.get(`${r.job_id}::${r.fb_group_id}`);
    if (s && s.last_posted && now - new Date(s.last_posted).getTime() < gapMs) continue; // cooldown
    const score = s ? Number(s.phones) * 3 + Number(s.comments) : 0;
    pairs.push({
      job_id: r.job_id,
      title: r.title,
      caption: r.caption || r.title,
      fb_group_id: r.fb_group_id,
      group_name: r.group_name || r.fb_group_id,
      score,
    });
  }
  pairs.sort((a, b) => b.score - a.score);
  return { user: u, items: pairs.slice(0, N), totalPairs: pairs.length };
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log(`\n=== POC Auto-Post: บัญชี "${ACCOUNT}" โพสต์ ${N} งาน (จำลอง ไม่แตะ FB จริง) ===`);
  const plan = await pickPlan(pool, ACCOUNT);
  await pool.end();

  console.log(`เลือก ${plan.items.length}/${plan.totalPairs} คู่ (งาน×กลุ่ม) ที่ yield สูงสุด + ผ่าน cooldown ${REPOST_GAP_DAYS} วัน:\n`);
  plan.items.forEach((it, i) =>
    console.log(`  ${i + 1}. [${it.score > 0 ? 'เคยได้เบอร์ score=' + it.score : 'กลุ่มใหม่'}] "${it.title}" → ${it.group_name}`)
  );
  console.log('');

  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 640, height: 720 });

  for (let i = 0; i < plan.items.length; i++) {
    const it = plan.items[i];
    console.log(`[${clk()}] 🚀 งานที่ ${i + 1}/${plan.items.length}: "${it.title}" → กลุ่ม ${it.group_name}`);
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(composerHtml(plan.user.name, it.group_name, it.title, it.caption)));
    await page.locator('#composer').click();
    console.log(`[${clk()}] ✍️  พิมพ์ caption (${it.caption.length} ตัวอักษร) แบบมนุษย์...`);
    await humanType(page, it.caption.slice(0, 400));
    await sleep(800 + Math.random() * 1200); // human review ก่อนกดโพสต์
    console.log(`[${clk()}] ✅ โพสต์งานที่ ${i + 1} เสร็จ`);
    if (i < plan.items.length - 1) {
      const d = 3 + Math.floor(Math.random() * 3);
      console.log(`[${clk()}] ⏳ หน่วงก่อนงานถัดไป ~${d}s (จริง 60-150s ย่อลงเพื่อ demo)\n`);
      await sleep(d * 1000);
    }
  }
  console.log(`\n=== เสร็จ: จำลองโพสต์ ${plan.items.length} งาน ใน ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  console.log('ของจริง: worker บนเครื่องคุณจะทำแบบนี้ (แต่ล็อกอิน FB จริง + โพสต์ลงกลุ่มจริง + หน่วงเต็ม) — cap/cooldown/ขนานบัญชี ทำงานเหมือนที่เห็น');
  await sleep(1500);
  await browser.close();
})().catch((e) => {
  console.error('POC error:', e.message || e);
  process.exit(1);
});
