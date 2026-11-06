// ตรวจความพร้อมของบัญชี Facebook ที่ใช้โพสต์ — บัญชีที่ใช้ได้ขึ้นบน
// รัน:  node scripts/check-post-accounts.mjs
// ต้องมีใน .env: DATABASE_URL หรือ PG* (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
import 'dotenv/config';
import pg from 'pg';

const AP = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';

/** เหตุผลเดียวที่ทำให้บัญชีโพสต์ไม่ได้ตอนนี้ — null = พร้อม */
function blocker(r) {
  if (r.needs_verify) return 'รอยืนยันตัวตน';
  if (r.paused) return `ถูกพัก${r.pause_reason ? ` (${r.pause_reason})` : ''}`;
  if (r.used_today >= r.cap) return `เต็มโควต้าวันนี้ ${r.used_today}/${r.cap}`;
  if (!r.preferred_worker) return 'ยังไม่ได้ผูกเครื่อง';
  if (!r.worker_online) return `เครื่อง ${r.preferred_worker} ออฟไลน์`;
  return null;
}

/** คลังกลุ่มของบัญชีเอง — ว่างได้ ใบสั่งจาก Jarvis พกกลุ่มมาเอง แค่ระบบเลือกบัญชีให้อัตโนมัติไม่ได้ */
function note(r) {
  return r.groups === 0 ? 'ไม่มีคลังกลุ่มของตัวเอง (รับงานที่ระบุบัญชี/รับแทนบัญชีอื่นได้)' : null;
}

const client = new pg.Client(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {},
);
await client.connect();
await client.query(`SET search_path TO "${AP}"`);

const { rows } = await client.query(`
  SELECT u.id,
         COALESCE(NULLIF(TRIM(u.name), ''), u.env_key, u.id) AS label,
         u.preferred_worker,
         (u.paused_until IS NOT NULL AND u.paused_until > now()) AS paused,
         u.pause_reason,
         (u.needs_verification_since IS NOT NULL) AS needs_verify,
         COALESCE(u.daily_cap, 15)::int AS cap,
         COALESCE((SELECT count(*)::int FROM post_logs pl
                    WHERE pl.user_id = u.id
                      AND (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date
                        = (now() AT TIME ZONE 'Asia/Bangkok')::date), 0) AS used_today,
         EXISTS (SELECT 1 FROM workers w
                  WHERE w.name = u.preferred_worker
                    AND w.last_seen > now() - interval '2 minutes') AS worker_online,
         COALESCE(jsonb_array_length(
           CASE WHEN jsonb_typeof(u.group_ids::jsonb) = 'array' THEN u.group_ids::jsonb ELSE '[]'::jsonb END
         ), 0) AS groups,
         COALESCE((SELECT count(*)::int FROM post_run_queue q
                    WHERE q.user_id = u.id AND q.status IN ('queued', 'running')), 0) AS waiting
    FROM users u`);

const accounts = rows.map((r) => ({ ...r, blocker: blocker(r), note: note(r) }));
const ready = accounts.filter((a) => !a.blocker).sort((a, b) => a.used_today / a.cap - b.used_today / b.cap);
const blocked = accounts.filter((a) => a.blocker).sort((a, b) => a.blocker.localeCompare(b.blocker, 'th'));

const room = ready.reduce((n, a) => n + (a.cap - a.used_today), 0);
console.log(`\nพร้อมโพสต์ ${ready.length} จาก ${accounts.length} บัญชี · โพสต์ได้อีกวันนี้ ${room} โพสต์\n`);

console.log('— บัญชีที่ใช้ได้ (เรียงตามเหลือโควต้ามากสุด) —');
for (const a of ready) {
  console.log(
    `  ${a.label}  ·  ${a.preferred_worker}  ·  วันนี้ ${a.used_today}/${a.cap}  ·  ${a.groups} กลุ่ม` +
      (a.waiting ? `  ·  มีงานค้าง ${a.waiting}` : '') +
      (a.note ? `  ·  ${a.note}` : ''),
  );
}
if (!ready.length) console.log('  (ไม่มี)');

console.log('\n— บัญชีที่ยังใช้ไม่ได้ —');
for (const a of blocked) {
  console.log(`  ${a.label}  ·  ${a.blocker}` + (a.waiting ? `  ·  มีงานค้าง ${a.waiting}` : ''));
}
if (!blocked.length) console.log('  (ไม่มี)');

const stuck = blocked.filter((a) => a.waiting > 0);
if (stuck.length) {
  console.log(
    `\n⚠ มีงานค้างอยู่กับบัญชีที่ใช้ไม่ได้ ${stuck.reduce((n, a) => n + a.waiting, 0)} งาน ` +
      `(${stuck.length} บัญชี) — คิวจะหยิบงานของบัญชีที่พร้อมก่อน`,
  );
}

await client.end();
