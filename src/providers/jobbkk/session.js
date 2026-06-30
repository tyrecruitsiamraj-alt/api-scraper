import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_DIR, envString, sleep } from '../../config.js';
import { detectCaptcha, injectCaptchaToken, solveCaptcha } from '../../captcha.js';
import { dismissOverlays } from '../../core/popup.js';

const STORAGE_PATH = join(AUTH_DIR, 'jobbkk.json');
const LOGIN_URL = () => envString('JOBBKK_EMPLOYER_LOGIN_URL', 'https://www.jobbkk.com/login/employer_login');
const DASHBOARD_URL = () => envString('JOBBKK_DASHBOARD_URL', 'https://www.jobbkk.com/employer/dashboard');

/**
 * Is this context's session still a valid logged-in employer session?
 * Cheap HTTP check via the request context (reuses cookies, no rendering).
 */
async function isLoggedIn(context) {
  const res = await context.request.get(DASHBOARD_URL(), { maxRedirects: 5 }).catch(() => null);
  if (!res) return false;
  const finalUrl = res.url();
  if (/employer_login|\/login\//i.test(finalUrl)) return false;
  const body = await res.text().catch(() => '');
  // logged-out pages bounce to the login form
  return !/name=["']?username_emp/i.test(body.slice(0, 8000));
}

/**
 * JobBKK shows a confirmation when the account is already logged in elsewhere:
 * "รหัสผู้ใช้งานนี้ได้ถูกใช้งานอยู่ในระบบ ... กดปุ่มยืนยัน". Clicking ยืนยัน
 * forces login and kicks the other session. Keeps us Human=0 on concurrent use.
 */
async function handleAlreadyLoggedIn(page, debug) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (!/ถูกใช้งานอยู่ในระบบ|ใช้งานอยู่ในระบบ/u.test(body)) return false;
  if (debug) console.log('  "already logged in elsewhere" dialog — confirming (ยืนยัน) to take over...');

  // The dialog's confirm button is labelled "ตกลง" (the cancel one is "ยกเลิก").
  const candidates = [
    page.getByRole('button', { name: 'ตกลง', exact: true }),
    page.locator('button, a, input[type="button"], input[type="submit"]').filter({ hasText: /^ตกลง$/ }),
    page.getByRole('button', { name: 'ยืนยัน', exact: false }),
  ];
  for (const loc of candidates) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await sleep(1200);
        return true;
      }
    }
  }
  if (debug) console.log('  could not find visible ยืนยัน button');
  return false;
}

async function performLogin(context, { username, password, debug }) {
  if (!username || !password) {
    throw new Error('JobBKK username/password missing (จาก connector หรือ .env)');
  }

  const page = await context.newPage();
  try {
    await page.goto(LOGIN_URL(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(500);

    const userField = page.locator('#username_emp, input[name="username_emp"]').first();
    const passField = page.locator('#password_emp, input[name="password_emp"]').first();
    await userField.fill(username);
    await passField.fill(password);

    // CAPTCHA — keep Human=0: detect, solve via service, inject. Rare in practice.
    const challenge = await detectCaptcha(page);
    if (challenge?.present) {
      if (debug) console.log('  CAPTCHA detected on login — attempting automated solve...');
      const token = await solveCaptcha(challenge);
      await injectCaptchaToken(page, token);
    }

    const submit = page.locator('#sign_in_emp, button[name="sign_in_emp"]').first();
    if (await submit.count()) {
      await submit.click();
    } else {
      await passField.press('Enter');
    }

    // success = navigated away from the login page
    await page
      .waitForURL((url) => !/employer_login|\/login\//i.test(url.href), { timeout: 30_000 })
      .catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(800);

    // "already logged in elsewhere" dialog — confirm to take over the session.
    await handleAlreadyLoggedIn(page, debug);

    // ad / cookie / modal popups (may be 0, 1, or several stacked)
    await dismissOverlays(page, { debug });

    const postChallenge = await detectCaptcha(page);
    if (postChallenge?.present) {
      throw new Error('Login still on a CAPTCHA challenge after submit — configure a solver (see captcha.js).');
    }

    // Verify via the session itself (cookies), not a race-prone URL check:
    // poll the dashboard over HTTP until the employer session is live.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await isLoggedIn(context)) return;
      await sleep(800);
    }

    if (debug) {
      const shot = join(AUTH_DIR, 'login-debug.png');
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      console.log(`  login-debug.png saved | url=${page.url()}`);
    }
    throw new Error('Login failed — employer session not detected (check credentials / CAPTCHA in .env).');
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Get a logged-in JobBKK session.
 *
 * Two modes:
 *  - Connector mode (DB): pass { username, password, storageState } from a
 *    connector row. Persisted state is reused; `dumpState()` returns the fresh
 *    storageState so the caller can save it back to the DB.
 *  - Standalone mode (.env): omit credentials → falls back to JOBBKK_* env +
 *    a local .auth/jobbkk.json file (used by the standalone scrape.js).
 *
 * Returns { browser, context, request, dumpState, reused }.
 */
export async function getJobbkkSession({ headless = true, debug = false, username, password, storageState, forceLogin = false } = {}) {
  const creds = {
    username: username ?? envString('JOBBKK_USERNAME'),
    password: password ?? envString('JOBBKK_PASSWORD'),
  };
  const useFile = !storageState && !forceLogin; // standalone mode persists to .auth file
  if (useFile) await mkdir(AUTH_DIR, { recursive: true });

  // forceLogin: ignore any stored session, start clean, and log in fresh — routes
  // through performLogin which dismisses the "logged in elsewhere" (ตกลง) dialog
  // and solves CAPTCHA, so a stale/hijacked session self-heals.
  const initialState = forceLogin
    ? undefined
    : storageState ?? (useFile && existsSync(STORAGE_PATH) ? STORAGE_PATH : undefined);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: 'th-TH',
    acceptDownloads: true,
    ...(initialState ? { storageState: initialState } : {}),
  });

  let loggedIn = false;
  if (initialState) {
    loggedIn = await isLoggedIn(context);
    if (debug) console.log(`  Reused session: ${loggedIn ? 'valid ✓' : 'expired — re-login'}`);
  }

  if (!loggedIn) {
    await performLogin(context, { ...creds, debug });
    if (useFile) {
      await context.storageState({ path: STORAGE_PATH });
      if (debug) console.log(`  Logged in & saved session → ${STORAGE_PATH}`);
    } else if (debug) {
      console.log('  Logged in (session will be persisted to DB by caller)');
    }
  }

  return {
    browser,
    context,
    request: context.request,
    reused: loggedIn,
    dumpState: () => context.storageState(),
  };
}
