import 'server-only';
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import { repairIncompleteCandidates } from '../../src/core/repair-incomplete-candidates.js';

type RepairOpts = {
  dryRun?: boolean;
  limit?: number;
};

/** Run incomplete-candidate repair against the live Postgres schema. */
export async function runIncompleteCandidateRepair(opts: RepairOpts = {}) {
  const db = {
    async query(text: string, params?: unknown[]) {
      return pool().query(text, params);
    },
    async withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
      const client = await pool().connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return repairIncompleteCandidates(db, opts);
}
