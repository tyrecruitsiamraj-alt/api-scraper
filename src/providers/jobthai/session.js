import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_DIR, envString, sleep } from '../../config.js';
import { dismissOverlays } from '../../core/popup.js';
import { detectCaptcha } from '../../captcha.js';

const STORAGE_PATH = join(AUTH_DIR, 'jobthai.json');
const LOGIN_URL = () =>
  envString(
    'JOBTHAI_LOGIN_URL',
    'https://auth.jobthai.com/companies/login?client_id=NlnJk4E3pLR2TBGu930OQXJAiy9mJ7sWpZ8w8RAq&response_type=code&redirect_uri=https%3A%2F%2Fwww.jobthai.com%2Fcallback&scope=login&l=th&type=company',
  );
const SEARCH_URL = () => envString('JOBTHAI_RESUME_SEARCH_URL', 'https://www3.jobthai.com/findresume/findresume.php?l=th');

/** Logged-in if the resume-search page loads without bouncing to auth/login. */
async function isLoggedIn(context) {
  const res = await context.request.get(SEARCH_URL(), { maxRedirects: 5 }).catch(() => null);
  if (!res) return false;
  if (/auth\.jobthai\.com|\/login/i.test(res.url())) return false;
  const body = await res.text().catch(() => '');
  if (/login-form-username|login_company|เข้าสู่ระบบสำหรับบริษัท/i.test(body.slice(0, 8000))) return false;
  return /findresume|ค้นประวัติ|ออกจากระบบ/i.test(body.slice(0, 20000));
}

async function performLogin(context, { username, password, debug }) {
  if (!username || !password) throw new Error('JobThai username/password missing (จาก connector หรือ .env)');

  const page = await context.newPage();
  try {
    await page.goto(LOGIN_URL(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(600);

    await page.locator('#login-form-username, input[placeholder="ชื่อผู้ใช้"]').first().fill(username);
    await page.locator('#login-form-password, input[type="password"]').first().fill(password);

    const challenge = await detectCaptcha(page);
    if (challenge?.present) throw new Error('JobThai login shows a CAPTCHA — configure a solver (captcha.js).');

    const btn = page.locator('#login_company, button[type="submit"]').first();
    if (await btn.count()) await btn.click();
    else await page.locator('input[type="password"]').first().press('Enter');

    // OAuth redirect chain → callback → employer area
    await page.waitForURL((u) => !/auth\.jobthai\.com/i.test(u.href), { timeout: 60_000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(1500);
    await dismissOverlays(page, { debug });

    // land on the resume-search page if not already there
    if (!/findresume/i.test(page.url())) {
      await page.goto(SEARCH_URL(), { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
      await sleep(1200);
    }

    for (let i = 0; i < 10; i += 1) {
      if (await isLoggedIn(context)) return;
      await sleep(800);
    }
    if (debug) {
      await page.screenshot({ path: join(AUTH_DIR, 'jobthai-login-debug.png'), fullPage: true }).catch(() => {});
      console.log(`  jobthai-login-debug.png saved | url=${page.url()}`);
    }
    throw new Error('JobThai login failed — employer session not detected.');
  } finally {
    await page.close().catch(() => {});
  }
}

/** Same contract as the JobBKK session. */
export async function getJobthaiSession({ headless = true, debug = false, username, password, storageState, forceLogin = false } = {}) {
  const creds = {
    username: username ?? envString('JOBTHAI_USERNAME'),
    password: password ?? envString('JOBTHAI_PASSWORD'),
  };
  const useFile = !storageState && !forceLogin;
  if (useFile) await mkdir(AUTH_DIR, { recursive: true });

  const initialState = forceLogin
    ? undefined
    : storageState ?? (useFile && existsSync(STORAGE_PATH) ? STORAGE_PATH : undefined);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ locale: 'th-TH', acceptDownloads: true, ...(initialState ? { storageState: initialState } : {}) });

  let loggedIn = false;
  if (initialState) {
    loggedIn = await isLoggedIn(context);
    if (debug) console.log(`  Reused JobThai session: ${loggedIn ? 'valid ✓' : 'expired — re-login'}`);
  }
  if (!loggedIn) {
    await performLogin(context, { ...creds, debug });
    if (useFile) await context.storageState({ path: STORAGE_PATH });
    if (debug) console.log('  JobThai logged in');
  }

  return { browser, context, request: context.request, reused: loggedIn, dumpState: () => context.storageState() };
}
