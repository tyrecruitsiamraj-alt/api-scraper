import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createObjectCsvWriter } from 'csv-writer';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { attachmentsSummary, downloadAllCandidates } from './candidate-assets.js';
import { waitForEmployerLoginComplete } from './scrape-timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const JSONL_PATH = join(OUTPUT_DIR, 'candidates.jsonl');

dotenv.config({ path: join(__dirname, '.env') });

const CSV_CANDIDATE_HEADERS = [
  'index',
  'scraped_at',
  'focus_position',
  'source',
  'prefix',
  'first_name',
  'last_name',
  'name',
  'phone',
  'email',
  'line_id',
  'age',
  'gender',
  'province',
  'address',
  'expected_salary',
  'available_start',
  'desired_positions',
  'education_count',
  'education_json',
  'education_summary',
  'work_experience_count',
  'work_experience_json',
  'experience_summary',
  'hard_skills',
  'soft_skills',
  'profile_image_url',
  'profile_image_local',
  'attachments_count',
  'attachments_summary',
  'parse_status',
  'source_url',
  'raw_text_preview',
];

const LOGIN_BUTTON_TEXTS = ['เข้าสู่ระบบ', 'Login', 'Sign in'];
const USERNAME_SELECTORS = [
  'input[name*="username" i]',
  'input[name*="email" i]',
  'input[name*="user" i]',
  'input[type="email"]',
  'input[type="text"]',
];
const PASSWORD_SELECTORS = ['input[type="password"]', 'input[name*="password" i]'];

function envString(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value.trim();
}

function envInt(name, fallback) {
  const parsed = Number.parseInt(envString(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBool(name, fallback = false) {
  const value = envString(name, String(fallback)).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listToText(value) {
  if (Array.isArray(value)) return value.join(' | ');
  return String(value ?? '').trim();
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function findVisibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
      return locator;
    }
  }
  return null;
}

async function clickByTexts(page, texts, roles = ['button', 'link']) {
  for (const text of texts) {
    for (const role of roles) {
      const locator = page.getByRole(role, { name: text, exact: false }).first();
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        await locator.click();
        return text;
      }
    }
    const generic = page.locator('button, a, input[type="submit"]').filter({ hasText: text }).first();
    if ((await generic.count()) > 0 && (await generic.isVisible().catch(() => false))) {
      await generic.click();
      return text;
    }
  }
  return null;
}

async function gotoEmployerLogin(page, homeUrl, employerLoginUrl) {
  if (homeUrl) {
    console.log(`Opening JobBKK home: ${homeUrl}`);
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(1500);

    const loginSelectors = [
      `a[href="${employerLoginUrl}"]`,
      'a[href*="/login/employer_login"]',
      'a.dropdown-item.dropdownItem[href*="employer_login"]',
    ];

    let clicked = false;
    for (const selector of loginSelectors) {
      const link = page.locator(selector).first();
      if ((await link.count()) > 0 && (await link.isVisible().catch(() => false))) {
        await link.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      const textLink = page.getByRole('link', { name: 'ผู้ประกอบการ', exact: false }).first();
      if ((await textLink.count()) > 0 && (await textLink.isVisible().catch(() => false))) {
        await textLink.click();
        clicked = true;
      }
    }

    if (!clicked) {
      throw new Error('Could not find employer login link.');
    }

    await page.waitForLoadState('domcontentloaded');
    await sleep(1500);
  } else {
    console.log(`Opening employer login: ${employerLoginUrl}`);
    await page.goto(employerLoginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(1500);
  }
}

async function loginEmployer(page, username, password) {
  const usernameField =
    (await findVisibleLocator(page, ['#username_emp', 'input[name="username_emp"]'])) ||
    (await findVisibleLocator(page, USERNAME_SELECTORS));
  const passwordField =
    (await findVisibleLocator(page, ['#password_emp', 'input[name="password_emp"]'])) ||
    (await findVisibleLocator(page, PASSWORD_SELECTORS));

  if (!usernameField || !passwordField) {
    throw new Error('Login form fields not found on employer login page.');
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const employerBtn = page.locator('#sign_in_emp, button[name="sign_in_emp"]').first();
  if ((await employerBtn.count()) > 0 && (await employerBtn.isVisible().catch(() => false))) {
    await employerBtn.click();
  } else {
    const clicked = await clickByTexts(page, LOGIN_BUTTON_TEXTS);
    if (!clicked) await passwordField.press('Enter');
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitForEmployerLoginComplete(page);
  console.log(`Logged in: ${page.url()}`);
}

async function readCandidatesJsonl(path) {
  const raw = await readFile(path, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJsonl(path, rows) {
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

async function writeCsv(path, rows) {
  const csvWriter = createObjectCsvWriter({
    path,
    header: CSV_CANDIDATE_HEADERS.map((id) => ({ id, title: id })),
    encoding: 'utf8',
  });
  const csvRows = rows.map((row) => {
    const normalized = { ...row };
    for (const field of ['hard_skills', 'soft_skills']) {
      normalized[field] = listToText(normalized[field]);
    }
    normalized.attachments_count = Array.isArray(row.attachments) ? row.attachments.length : 0;
    normalized.attachments_summary = row.attachments_summary || attachmentsSummary(row.attachments);
    normalized.education_count = Array.isArray(row.education) ? row.education.length : 0;
    normalized.education_json = JSON.stringify(row.education || []);
    normalized.work_experience_count = Array.isArray(row.work_experience) ? row.work_experience.length : 0;
    normalized.work_experience_json = JSON.stringify(row.work_experience || []);
    return normalized;
  });
  await csvWriter.writeRecords(csvRows);
}

async function main() {
  const homeUrl = envString('JOBBKK_HOME_URL', '');
  const employerLoginUrl = envString('JOBBKK_EMPLOYER_LOGIN_URL');
  const username = envString('JOBBKK_USERNAME');
  const password = envString('JOBBKK_PASSWORD');
  const headless = envBool('HEADLESS', false);
  const delayMs = envInt('DELAY_MS', 3000);

  if (!username || !password) {
    throw new Error('JOBBKK_USERNAME and JOBBKK_PASSWORD must be set in .env');
  }
  if (!employerLoginUrl) {
    throw new Error('JOBBKK_EMPLOYER_LOGIN_URL must be set in .env');
  }

  let candidates;
  try {
    candidates = await readCandidatesJsonl(JSONL_PATH);
  } catch {
    throw new Error(`No candidates found. Run "npm run scrape" first. Expected: ${JSONL_PATH}`);
  }

  if (candidates.length === 0) {
    throw new Error('candidates.jsonl is empty. Run "npm run scrape" first.');
  }

  console.log(`Found ${candidates.length} candidate(s) in candidates.jsonl`);
  console.log('Downloading profile images and attachments...\n');

  const browser = await chromium.launch({
    headless,
    args: headless ? [] : ['--start-maximized'],
  });
  const context = await browser.newContext({
    locale: 'th-TH',
    viewport: headless ? { width: 1400, height: 900 } : null,
    acceptDownloads: true,
  });

  try {
    const page = await context.newPage();
    await gotoEmployerLogin(page, homeUrl, employerLoginUrl);
    await loginEmployer(page, username, password);
    await page.close();

    const runAt = new Date().toISOString();
    const { candidates: updated, summary } = await downloadAllCandidates(context, candidates, OUTPUT_DIR, delayMs);

    await writeJsonl(JSONL_PATH, updated);
    await writeCsv(join(OUTPUT_DIR, 'candidates.csv'), updated);
    await writeFile(
      join(OUTPUT_DIR, 'download-report.json'),
      JSON.stringify({ run_at: runAt, ...summary }, null, 2),
      'utf8',
    );

    console.log('\nDownload complete.');
    console.log(`Profiles: ${summary.profile_downloaded}/${summary.total_candidates}`);
    console.log(`Attachments: ${summary.attachments_downloaded} ok, ${summary.attachments_failed} failed`);
    console.log(`Output: ${join(OUTPUT_DIR, 'candidates')}`);
    console.log(`Updated: candidates.jsonl, candidates.csv, download-report.json`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Download failed:', error.message);
  process.exit(1);
});
