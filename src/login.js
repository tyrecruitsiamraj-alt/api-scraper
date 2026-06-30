import { loadRuntime } from './config.js';
import { getJobbkkSession } from './providers/jobbkk/session.js';

// Pre-warm / verify the session (saves .auth/jobbkk.json). Useful to run once
// so subsequent `npm run scrape` reuses the cookies and never logs in again.
async function main() {
  const runtime = loadRuntime();
  console.log('Acquiring JobBKK session...');
  const { browser } = await getJobbkkSession({ headless: runtime.headless, debug: true });
  await browser.close();
  console.log('Session ready (saved to .auth/jobbkk.json).');
}

main().catch((e) => {
  console.error('Login failed:', e.message);
  process.exit(1);
});
