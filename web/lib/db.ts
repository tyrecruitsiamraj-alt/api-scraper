import 'server-only';
import { Pool } from 'pg';

const DB_SCHEMA = process.env.DB_SCHEMA ?? 'so-candidate-data';

// Reuse a single pool across hot-reloads in dev.
const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export function pool(): Pool {
  if (!globalForPg._pgPool) {
    globalForPg._pgPool = new Pool({
      host: process.env.PGHOST,
      port: Number.parseInt(process.env.PGPORT ?? '5432', 10),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 5,
      idleTimeoutMillis: 30_000,
      options: `-c search_path="${DB_SCHEMA}",public`,
    });
  }
  return globalForPg._pgPool;
}

export async function q<T = any>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}
