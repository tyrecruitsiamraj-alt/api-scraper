import { closePool } from '../db/pool.js';
import { createConnector, listConnectors } from '../db/repositories.js';

/**
 * Manage connectors (credentials live in the DB, password encrypted).
 *
 *   node src/cli/connector.js add --platform jobbkk --label "JobBKK-HR1" \
 *        --username USER --password PASS --limit 15 --daily 200
 *   node src/cli/connector.js list
 */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
      out[key] = val;
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const cmd = argv._[0];

  if (cmd === 'add') {
    for (const req of ['platform', 'label', 'username', 'password']) {
      if (!argv[req]) throw new Error(`--${req} is required`);
    }
    const id = await createConnector({
      platform: argv.platform,
      label: argv.label,
      username: argv.username,
      password: argv.password,
      scrapeLimit: Number.parseInt(argv.limit ?? '15', 10),
      dailyCap: Number.parseInt(argv.daily ?? '200', 10),
    });
    console.log(`Connector created: ${id} (${argv.platform} / ${argv.label})`);
  } else if (cmd === 'list') {
    const rows = await listConnectors();
    if (!rows.length) console.log('(no connectors)');
    for (const c of rows) {
      console.log(
        `${c.id} | ${c.platform} | ${c.label} | user=${c.username} | limit=${c.scrape_limit} | daily=${c.daily_cap} | enabled=${c.enabled} | cooldown=${c.cooldown_until ?? '-'}`,
      );
    }
  } else {
    console.log('Usage: connector.js add|list  (see file header for flags)');
  }

  await closePool();
}

main().catch(async (e) => {
  console.error('connector cli error:', e.message);
  await closePool();
  process.exit(1);
});
