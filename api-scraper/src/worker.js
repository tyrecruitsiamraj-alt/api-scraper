import { closePool } from './db/pool.js';
import { listConnectors } from './db/repositories.js';
import { loadCriteria, loadRuntime } from './config.js';
import { runConnector } from './pipeline.js';

/**
 * Worker: run every enabled connector (skipping those in cooldown) once,
 * using the search criteria from .env. Designed to run inside the Docker
 * container, either one-shot or on a schedule.
 *
 *   PLATFORM=jobbkk node src/worker.js     # only one platform
 *   node src/worker.js                      # all enabled connectors
 */
async function main() {
  const runtime = loadRuntime();
  const criteria = loadCriteria();
  const platform = process.env.PLATFORM || undefined;

  const connectors = await listConnectors({ platform, enabledOnly: true });
  const now = Date.now();
  const active = connectors.filter((c) => !c.cooldown_until || new Date(c.cooldown_until).getTime() < now);

  console.log(`\n=== worker: ${active.length}/${connectors.length} connector(s) ready ===`);
  console.log(`Criteria: position="${criteria.position}" keyword="${criteria.keyword}" max=${criteria.maxCandidates}\n`);

  const results = [];
  for (const connector of active) {
    console.log(`▶ ${connector.platform} / ${connector.label}`);
    const r = await runConnector(connector, criteria, runtime);
    results.push({ connector: connector.label, ...r });
  }

  console.log('\n=== summary ===');
  for (const r of results) {
    console.log(`  ${r.connector}: ${r.status} | new ${r.newCount} / upd ${r.updatedCount} / fail ${r.failed} (found ${r.found})`);
  }

  await closePool();
}

main().catch(async (e) => {
  console.error('\nworker failed:', e.message);
  await closePool();
  process.exit(1);
});
