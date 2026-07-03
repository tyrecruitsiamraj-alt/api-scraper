import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_DIR, envString, envInt, sleep } from '../../config.js';
import { detectCaptcha, injectCaptchaToken, solveCaptcha } from '../../captcha.js';
import { dismissOverlays } from '../../core/popup.js';

const STORAGE_PATH = join(AUTH_DIR, 'jobbkk.json');
const LOGIN_URL = () => envString('JOBBKK_EMPLOYER_LOGIN_URL', 'https://www.jobbkk.com/login/employer_login');
const DASHBOARD_URL = () => envString('JOBBKK_DASHBOARD_URL', 'https://www.jobbkk.com/employer/dashboard');
// Fail-fast: cap the fresh-login wait so a bot-check/CAPTCHA hang errors quickly (with a debug
// screenshot) instead of freezing for minutes. Tunable via env; defaults 45s wait / 30s page-load.
const LOGIN_TIMEOUT_MS = () => envInt('JOBBKK_LOGIN_TIMEOUT_MS', 45_000);
const LOGIN_GOTO_TIMEOUT_MS = () => envInt('JOBBKK_LOGIN_GOTO_TIMEOUT_MS', 30_000);

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
  if (!/ถูกใช้งานอยู่ในระบบ|ใช้งานอยู่ในระบบ|logged in elsewhere/i.test(body)) return false;
  if (debug) console.log('  [JobBKK] "already logged in elsewhere" dialog — confirming...');

  const candidates = [
    page.getByRole('button', { name: 'ตกลง', exact: true }),
    page.getByRole('button', { name: 'ยืนยัน', exact: false }),
    page.locator('button, a, input[type="button"], input[type="submit"]').filter({ hasText: /^(ตกลง|ยืนยัน)$/ }),
    page.locator('.modal.show button, .swal2-confirm, .confirm').filter({ hasText: /ตกลง|ยืนยัน/ }),
  ];
  for (const loc of candidates) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 3000 }).catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await sleep(1200);
        if (debug) console.log('  [JobBKK] confirmed session takeover');
        return true;
      }
    }
  }
  if (debug) console.log('  [JobBKK] could not find confirm button on session dialog');
  return false;
}

/** Poll until cookies prove we're logged in — handles dialogs/CAPTCHA along the way. */
async function waitForLoginComplete(page, context, { debug, onHeartbeat, timeoutMs = LOGIN_TIMEOUT_MS() }) {
  const start = Date.now();
  let captchaNotified = false;
  let lastBeat = 0;

  while (Date.now() - start < timeoutMs) {
    if (onHeartbeat) await Promise.resolve(onHeartbeat()).catch(() => {});

    if (await isLoggedIn(context)) {
      if (debug) console.log('  [JobBKK] login complete ✓');
      return;
    }

    // heartbeat every ~10s so a slow login is visible progress, not a silent freeze
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (elapsed >= lastBeat + 10) {
      lastBeat = elapsed;
      console.log(`  [JobBKK] waiting for login… ${elapsed}s / ${Math.round(timeoutMs / 1000)}s`);
    }

    await handleAlreadyLoggedIn(page, debug);
    await dismissOverlays(page, { debug });

    const challenge = await detectCaptcha(page);
    if (challenge?.present) {
      if (!captchaNotified) {
        console.log('  [JobBKK] CAPTCHA on login — attempting automated solve...');
        captchaNotified = true;
      }
      const token = await solveCaptcha(challenge);
      await injectCaptchaToken(page, token);
      const submit = page.locator('#sign_in_emp, button[name="sign_in_emp"]').first();
      if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => {});
    }

    await sleep(600);
  }

  const shot = join(AUTH_DIR, 'jobbkk-login-debug.png');
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  const secs = Math.round(timeoutMs / 1000);
  console.log(`  [JobBKK] login failed — screenshot saved → ${shot} | url=${page.url()}`);
  throw new Error(`Login timed out — employer session not detected within ${secs}s (likely a CAPTCHA/bot-check on fresh login; see ${shot}). Retrying usually works, or raise JOBBKK_LOGIN_TIMEOUT_MS / configure a CAPTCHA solver.`);
}

async function performLogin(context, { username, password, debug, onHeartbeat }) {
  if (!username || !password) {
    throw new Error('JobBKK username/password missing (จาก connector หรือ .env)');
  }

  const page = await context.newPage();
  try {
    if (onHeartbeat) await Promise.resolve(onHeartbeat()).catch(() => {});
    console.log('  [JobBKK] opening login page...');
    await page.goto(LOGIN_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() });
    await sleep(500);

    const userField = page.locator('#username_emp, input[name="username_emp"]').first();
    const passField = page.locator('#password_emp, input[name="password_emp"]').first();
    await userField.fill(username);
    await passField.fill(password);

    const challenge = await detectCaptcha(page);
    if (challenge?.present) {
      console.log('  [JobBKK] CAPTCHA before submit — attempting automated solve...');
      const token = await solveCaptcha(challenge);
      await injectCaptchaToken(page, token);
    }

    console.log('  [JobBKK] submitting credentials...');
    const submit = page.locator('#sign_in_emp, button[name="sign_in_emp"]').first();
    if (await submit.count()) {
      await submit.click();
    } else {
      await passField.press('Enter');
    }

    await waitForLoginComplete(page, context, { debug, onHeartbeat });

    const postChallenge = await detectCaptcha(page);
    if (postChallenge?.present) {
      throw new Error('Login still on a CAPTCHA challenge after submit — configure a solver (see captcha.js).');
    }
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
export async function getJobbkkSession({ headless = true, debug = false, username, password, storageState, forceLogin = false, onHeartbeat } = {}) {
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
    console.log(`  [JobBKK] logging in as ${creds.username}...`);
    await performLogin(context, { ...creds, debug, onHeartbeat });
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
