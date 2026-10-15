/**
 * Repair incomplete candidate rows from stored source raw_text / OCR.
 * Fills blank/mangled คำนำหน้า and missing/weak ประสบการณ์ทำงาน when the
 * stored text already has them — never invents values.
 *
 * Usage (on the worker with .env, after git pull main):
 *   node scripts/repair-incomplete-candidates.mjs
 *   node scripts/repair-incomplete-candidates.mjs --dry-run
 *   node scripts/repair-incomplete-candidates.mjs --limit=500
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

function argValue(name, fallback) {
  const hit = process.argv.find((item) => item.startsWith(`${name}=`));
  if (!hit) return fallback;
  const raw = hit.slice(name.length + 1);
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

say('[repair] start');
say('[repair] script loaded — preparing...');

const dryRun = process.argv.includes('--dry-run');
const batchLimit = Math.min(Math.max(argValue('--limit', 2000), 1), 2000);
const maxRounds = Math.min(Math.max(argValue('--rounds', 50), 1), 200);
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
  say('[repair] DB connected — scanning incomplete resumes (prefix + work)...');

  const totals = {
    dryRun,
    rounds: 0,
    scanned: 0,
    repaired: 0,
    unrepaired: 0,
    failed: 0,
    filledFields: 0,
    withOcr: 0,
    ocrChars: 0,
    sample: [],
    errors: [],
    unrepairedGapCounts: {},
  };

  try {
    const db = {
      query: (text, params) => pool.query(text, params),
      withTransaction,
    };

    for (let round = 1; round <= maxRounds; round += 1) {
      say(`[repair] round ${round}/${maxRounds} (batch ≤ ${batchLimit})...`);
      const result = await repairIncompleteCandidates(db, {
        dryRun,
        limit: batchLimit,
        onProgress: ({ repaired, scanned }) => say(`[repair] round ${round}: repaired ${repaired} / scanned ${scanned}`),
      });
      totals.rounds = round;
      totals.scanned += result.scanned || 0;
      totals.repaired += result.repaired || 0;
      totals.unrepaired += result.unrepaired || 0;
      totals.failed += result.failed || 0;
      totals.filledFields += result.filledFields || 0;
      totals.withOcr += result.withOcr || 0;
      totals.ocrChars += result.ocrChars || 0;
      if (Array.isArray(result.sample)) {
        for (const item of result.sample) {
          if (totals.sample.length < 12) totals.sample.push(item);
        }
      }
      if (Array.isArray(result.errors)) {
        for (const item of result.errors) {
          if (totals.errors.length < 20) totals.errors.push(item);
        }
      }
      for (const [gap, count] of Object.entries(result.unrepairedGapCounts || {})) {
        totals.unrepairedGapCounts[gap] = (totals.unrepairedGapCounts[gap] || 0) + count;
      }

      say(`[repair] round ${round} done — repaired=${result.repaired} unrepaired=${result.unrepaired} hasMore=${result.hasMore}`);
      if (!result.hasMore) break;
      if ((result.repaired || 0) === 0 && (result.scanned || 0) > 0) {
        say('[repair] no further rows changed — stopping');
        break;
      }
    }

    say(JSON.stringify(totals, null, 2));
    say(`[repair] done — repaired ${totals.repaired} row(s) across ${totals.rounds} round(s)`);
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  say(`[repair] FAILED: ${error.message}`);
  process.exitCode = 1;
});
