import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { fetchOpenRequests } from './mssql.js';
import { query, closePool } from '../db/pool.js';

/**
 * Sync open manpower requests from the ERP (SQL Server) into the Postgres staging
 * table `erp_open_requests`, so the Vercel web console can read them without
 * touching the internal SQL Server. Run on the worker machine (network access).
 */
export async function syncOpenRequests() {
  const rows = await fetchOpenRequests();
  if (rows === null) {
    console.log('[erp] intake disabled or SQL Server unreachable — nothing synced');
    return { synced: 0, off: true };
  }

  let n = 0;
  for (const r of rows) {
    const requestNo = String(r.request_no ?? '').trim();
    if (!requestNo) continue;
    await query(
      `INSERT INTO erp_open_requests
         (request_no, snapshot, title, province, qty, remaining_qty, request_date, want_date_from, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (request_no) DO UPDATE SET
         snapshot=EXCLUDED.snapshot, title=EXCLUDED.title, province=EXCLUDED.province,
         qty=EXCLUDED.qty, remaining_qty=EXCLUDED.remaining_qty,
         request_date=EXCLUDED.request_date, want_date_from=EXCLUDED.want_date_from, synced_at=now()`,
      [
        requestNo,
        JSON.stringify(r),
        (r.request_name || '').toString().trim() || null,
        (r.site_name || '').toString().trim() || null,
        r.request_qty ?? null,
        r.remaining_qty ?? null,
        r.request_date ?? null,
        r.want_date_from ?? null,
      ],
    );
    n += 1;
  }

  // ล้างใบขอที่ไม่อยู่ในผลล่าสุดแล้ว (เต็ม/ปิดใน ERP) เฉพาะที่ยังไม่ถูกสร้าง campaign
  const keep = rows.map((r) => String(r.request_no ?? '').trim()).filter(Boolean);
  if (keep.length) {
    await query(`DELETE FROM erp_open_requests WHERE campaign_id IS NULL AND request_no <> ALL($1::text[])`, [keep]);
  }

  console.log(`[erp] synced ${n} open request(s) into staging`);
  return { synced: n };
}

function isCliMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isCliMain()) {
  syncOpenRequests()
    .catch((e) => {
      console.error('[erp] sync failed:', e.message);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
