import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Apply schema files in order (all idempotent — CREATE/ALTER ... IF NOT EXISTS).
async function main() {
  for (const file of ['schema.sql', 'schema-002.sql', 'schema-003.sql', 'schema-004.sql']) {
    const sql = await readFile(join(__dirname, file), 'utf8');
    console.log(`Applying ${file} ...`);
    await getPool().query(sql);
  }
  console.log('Schema applied ✓ (schema "so-candidate-data")');
  await closePool();
}

main().catch(async (e) => {
  console.error('Migration failed:', e.message);
  await closePool();
  process.exit(1);
});
