import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, '.auth');
const STORAGE_PATH = join(AUTH_DIR, 'jobbkk.json');
const DASHBOARD_URL = 'https://www.jobbkk.com/employer/dashboard';

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function main() {
  await mkdir(AUTH_DIR, { recursive: true });

  console.log('Launching Chromium (visible browser)...');
  console.log(`Opening: ${DASHBOARD_URL}`);
  console.log('');
  console.log('Please log in manually in the browser window.');
  console.log('Complete any CAPTCHA/OTP steps yourself.');
  console.log('When you reach the employer dashboard, return here and press Enter.');
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'th-TH',
  });
  const page = await context.newPage();

  try {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForEnter('Press Enter to save session and close the browser... ');
    await context.storageState({ path: STORAGE_PATH });
    console.log(`Session saved to: ${STORAGE_PATH}`);
    console.log('No username or password was stored.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Auth failed:', error.message);
  process.exit(1);
});
