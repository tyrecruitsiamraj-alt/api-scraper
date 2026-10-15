/**
 * Repair ALL candidate profile photos.
 *
 * 1) Reject placeholder/default faces + keep only newest success per person
 * 2) Re-login connectors and re-download missing/bad faces from JobBKK/JobThai
 *
 * Usage (on Worker with .env + APP_ENCRYPTION_KEY):
 *   node scripts/repair-profile-photos.mjs
 *   node scripts/repair-profile-photos.mjs --dry-run
 *   node scripts/repair-profile-photos.mjs --cleanup-only
 *   node scripts/repair-profile-photos.mjs --force
 *   node scripts/repair-profile-photos.mjs --limit=1000
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

say('[photos] start — full profile photo repair');

const dryRun = process.argv.includes('--dry-run');
const cleanupOnly = process.argv.includes('--cleanup-only');
const force = process.argv.includes('--force');
const limit = Math.min(Math.max(argValue('--limit', 5000), 1), 20000);

async function main() {
  say('[photos] loading modules...');
  const heartbeat = setInterval(() => say('[photos] still loading...'), 2000);
  let dotenv;
  let repairAllProfilePhotos;
  let getPool;
  let closePool;
  let withTransaction;
  try {
    const mods = await Promise.all([
      import('dotenv'),
      import('../src/core/repair-profile-photos.js'),
      import('../src/db/pool.js'),
    ]);
    dotenv = mods[0].default;
    repairAllProfilePhotos = mods[1].repairAllProfilePhotos;
    getPool = mods[2].getPool;
    closePool = mods[2].closePool;
    withTransaction = mods[2].withTransaction;
  } finally {
    clearInterval(heartbeat);
  }

  const rootEnv = resolve(process.cwd(), '.env');
  const webEnv = resolve(process.cwd(), 'web/.env');
  if (existsSync(rootEnv)) dotenv.config({ path: rootEnv, override: true });
  if (existsSync(webEnv)) dotenv.config({ path: webEnv });

  const hasDb = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGPASSWORD));
  if (!hasDb) throw new Error('Need .env with PGHOST/PGPASSWORD or DATABASE_URL');
  if (!cleanupOnly && !process.env.APP_ENCRYPTION_KEY) {
    throw new Error('Need APP_ENCRYPTION_KEY in .env to decrypt connector passwords for redownload');
  }

  say(`[photos] target ${process.env.PGHOST || 'DATABASE_URL'} schema=${process.env.DB_SCHEMA || 'so-candidate-data'}`);
  const pool = getPool();
  await Promise.race([
    pool.query('SELECT 1 AS ok'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB connect timeout 15s')), 15_000)),
  ]);
  say('[photos] DB connected');

  try {
    const result = await repairAllProfilePhotos(
      {
        query: (text, params) => pool.query(text, params),
        withTransaction,
      },
      {
        dryRun,
        redownload: !cleanupOnly,
        force,
        limit,
        onProgress: (info) => {
          if (info.phase === 'login') say(`[photos] login ${info.platform} (${info.connector})`);
          if (info.phase === 'refresh' && info.refreshed % 10 === 0) {
            say(`[photos] refreshed ${info.refreshed}/${info.scanned}`);
          }
        },
      },
    );
    say(JSON.stringify(result, null, 2));
    say(`[photos] done — refreshed ${result.refreshed || 0}, rejected placeholders ${result.placeholdersRejected || 0}, superseded ${result.superseded || 0}`);
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  say(`[photos] FAILED: ${error.message}`);
  process.exitCode = 1;
});
