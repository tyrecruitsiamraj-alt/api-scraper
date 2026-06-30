import pg from 'pg';
import { envString } from '../config.js';

export const DB_SCHEMA = envString('DB_SCHEMA', 'so-candidate-data');

function buildConfig() {
  // Scope every connection to our schema at connect time (no race, no extra
  // round-trip). Hyphenated schema → double-quoted inside the search_path GUC.
  const options = `-c search_path="${DB_SCHEMA}",public`;
  const url = envString('DATABASE_URL');
  if (url) return { connectionString: url, options };
  return {
    host: envString('PGHOST', '94.74.115.204'),
    port: Number.parseInt(envString('PGPORT', '5432'), 10),
    user: envString('PGUSER', 'root'),
    password: envString('PGPASSWORD'),
    database: envString('PGDATABASE', 'ocr_service'),
    options,
  };
}

let pool = null;

export function getPool() {
  if (pool) return pool;
  pool = new pg.Pool({ ...buildConfig(), max: 5, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('pg pool error:', err.message));
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

/** Run fn inside a transaction with a scoped client. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query(`SET search_path TO "${DB_SCHEMA}"`);
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
}
