import { query, closePool } from '../db/pool.js';

const { rows } = await query(
  `UPDATE scrape_runs
      SET status='failed',
          error='worker interrupted — cleaned up orphan run',
          finished_at=now()
    WHERE status='running'
      AND finished_at IS NULL
  RETURNING id, started_at`,
);
console.log(`Cleaned ${rows.length} orphan run(s)`);
for (const r of rows) console.log(`  ${r.id} (started ${r.started_at})`);
await closePool();
