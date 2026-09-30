/**
 * Repair incomplete candidate rows from stored source raw_text.
 * Never invents values — only fills blank fields that the text already contains.
 *
 * Usage (on the Windows worker with .env):
 *   node scripts/repair-incomplete-candidates.mjs
 *   node scripts/repair-incomplete-candidates.mjs --dry-run
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function say(message) {
  process.stdout.write(`${message}\r\n`);
  try {
    if (typeof process.stdout._handle?.setBlocking === 'function') {
      process.stdout._handle.setBlocking(true);
    }
  } catch {
    // ignore
  }
}

say('[repair] start');
say('[repair] script loaded — preparing...');

const dryRun = process.argv.includes('--dry-run');
if (dryRun) say('[repair] dry-run mode (no DB writes)');

async function main() {
  say('[repair] loading dotenv / repair / db ...');
  const heartbeat = setInterval(() => {
    say('[repair] still loading modules (cheerio/pg) ...');
  }, 2000);

  let dotenv;
  let repairIncompleteCandidates;
  let getPool;
  let closePool;
  let withTransaction;
  try {
    const mods = await Promise.all([
      import('dotenv'),
      import('../src/core/repair-incomplete-candidates.js'),
      import('../src/db/pool.js'),
    ]);
    dotenv = mods[0].default;
    repairIncompleteCandidates = mods[1].repairIncompleteCandidates;
    getPool = mods[2].getPool;
    closePool = mods[2].closePool;
    withTransaction = mods[2].withTransaction;
  } finally {
    clearInterval(heartbeat);
  }
  say('[repair] modules loaded');

  const rootEnv = resolve(process.cwd(), '.env');
  const webEnv = resolve(process.cwd(), 'web/.env');
  if (existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv, override: true });
    say('[repair] loaded root .env');
  } else {
    say('[repair] root .env NOT found');
  }
  if (existsSync(webEnv)) {
    dotenv.config({ path: webEnv });
    say('[repair] loaded web/.env');
  }

  const hasDb = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGPASSWORD));
  say(`[repair] DB config: ${hasDb ? 'ok' : 'MISSING'}`);
  if (!hasDb) throw new Error('Need .env with PGHOST/PGPASSWORD or DATABASE_URL');

  say(`[repair] target: ${process.env.PGHOST || 'DATABASE_URL'} schema=${process.env.DB_SCHEMA || 'so-candidate-data'}`);
  say('[repair] connecting DB (15s timeout)...');
  const pool = getPool();
  await Promise.race([
    pool.query('SELECT 1 AS ok'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB connect timeout 15s — check VPN/network/.env')), 15_000)),
  ]);
  say('[repair] DB connected — scanning incomplete resumes...');

  try {
    const result = await repairIncompleteCandidates(
      {
        query: (text, params) => pool.query(text, params),
        withTransaction,
      },
      {
        dryRun,
        limit: 2000,
        onProgress: ({ repaired }) => say(`[repair] repaired ${repaired}...`),
      },
    );
    say(JSON.stringify(result, null, 2));
    say('[repair] done');
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  say(`[repair] FAILED: ${error.message}`);
  process.exitCode = 1;
});
