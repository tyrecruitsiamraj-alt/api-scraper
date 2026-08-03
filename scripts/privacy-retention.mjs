import 'dotenv/config';
import pg from 'pg';

const schema = process.env.DB_SCHEMA || 'so-candidate-data';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(schema)) {
  throw new Error(`DB_SCHEMA ไม่ถูกต้อง: ${schema}`);
}

const retentionDays = Math.max(30, Number(process.env.PII_RETENTION_DAYS) || 730);
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm='))?.split('=')[1];
if (apply && confirmation !== 'DELETE_EXPIRED_PII') {
  throw new Error('โหมดลบต้องระบุ --apply --confirm=DELETE_EXPIRED_PII');
}

const client = new pg.Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      },
);

await client.connect();
try {
  await client.query(`SET search_path TO "${schema}"`);
  const { rows } = await client.query(
    `SELECT count(*)::int AS candidates,
            COALESCE(sum((SELECT count(*) FROM candidate_assets a WHERE a.candidate_id=c.id)),0)::int AS assets
       FROM candidates c
      WHERE c.last_updated_at < now() - ($1 || ' days')::interval`,
    [retentionDays],
  );
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        retention_days: retentionDays,
        expired_candidates: rows[0]?.candidates ?? 0,
        linked_assets: rows[0]?.assets ?? 0,
      },
      null,
      2,
    ),
  );
  if (apply) {
    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM candidates
        WHERE last_updated_at < now() - ($1 || ' days')::interval`,
      [retentionDays],
    );
    await client.query('COMMIT');
    console.log(`Deleted ${result.rowCount ?? 0} expired candidate record(s).`);
  }
} catch (error) {
  if (apply) await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
