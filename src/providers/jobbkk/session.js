import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_DIR, envString, envInt, envBool, sleep } from '../../config.js';
import { detectCaptcha, injectCaptchaToken, solveCaptcha } from '../../captcha.js';
import { dismissOverlays } from '../../core/popup.js';

const BASE = 'https://www.jobbkk.com';
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

    // Robust login completion. JobBKK enforces ONE active session: a second login shows
    // an "already logged in elsewhere" dialog (แจ้งเตือน) with a pink "ตกลง" button that
    // must be clicked to kick the other session and finish login. An HTTP-only check
    // false-positives here (cookies half-set) while the page is stuck on the dialog, so
    // we drive the PAGE: confirm the dialog, solve captcha, and wait until the page
    // actually reaches the employer area.
    const isPageLoggedIn = () => /\/employer\/(?!.*noLogIn)|\/resumes\//i.test(page.url());
    const deadline = Date.now() + LOGIN_TIMEOUT_MS();
    let confirmedKick = false;
    while (Date.now() < deadline) {
      if (onHeartbeat) await Promise.resolve(onHeartbeat()).catch(() => {});
      if (isPageLoggedIn()) break;

      // confirm the single-session "logged in elsewhere" dialog (button text = ตกลง)
      const okBtn = page.getByText('ตกลง', { exact: true }).first();
      if (await okBtn.isVisible().catch(() => false)) {
        if (debug) console.log('  [JobBKK] "logged in elsewhere" dialog — clicking ตกลง to take over...');
        await okBtn.click({ timeout: 3000 }).catch(() => {});
        confirmedKick = true;
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await sleep(1500);
        continue;
      }

      const challenge = await detectCaptcha(page);
      if (challenge?.present) {
        console.log('  [JobBKK] CAPTCHA on login — attempting automated solve...');
        const token = await solveCaptcha(challenge);
        await injectCaptchaToken(page, token);
        const submitAgain = page.locator('#sign_in_emp, button[name="sign_in_emp"]').first();
        if (await submitAgain.isVisible().catch(() => false)) await submitAgain.click().catch(() => {});
      }

      // if the login form is gone but URL hasn't updated, nudge to the dashboard
      const fieldVisible = await page.locator('#username_emp').isVisible().catch(() => false);
      if (!fieldVisible && !isPageLoggedIn()) {
        await page.goto(DASHBOARD_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
      }
      await sleep(600);
    }

    // Confirm the session is REAL by loading the dashboard (not the noLogIn bounce).
    await page.goto(DASHBOARD_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    if (debug) console.log(`  [JobBKK] login result: url=${page.url()} (kickConfirmed=${confirmedKick})`);
    if (/noLogIn|\/login\//i.test(page.url())) {
      await page.screenshot({ path: join(AUTH_DIR, 'jobbkk-postlogin.png'), fullPage: true }).catch(() => {});
      throw new Error('Login did not establish an employer session (bounced to noLogIn). See .auth/jobbkk-postlogin.png');
    }

    // Keep this page OPEN and return it — the premium search must run on the same page.
    return page;
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
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
  // JobBKK must run in a REAL (non-headless) browser to pass its bot-check and get
  // UNMASKED contact data. To avoid the window popping up in front of the user during
  // automated web/worker runs, shove it far off-screen — it's still a real browser,
  // just invisible. Set JOBBKK_SHOW_BROWSER=true (or run with debug) to watch it.
  const hideWindow = !headless && !debug && !envBool('JOBBKK_SHOW_BROWSER', false);
  const browser = await chromium.launch({
    headless,
    args: hideWindow ? ['--window-position=-32000,-32000', '--window-size=1536,864'] : [],
  });
  const context = await browser.newContext({
    locale: 'th-TH',
    acceptDownloads: true,
    // Desktop viewport — the Resume Search Talent premium UI (#autoComplete-position)
    // only renders at desktop width; a narrow viewport falls back to a mobile layout
    // that hides the search fields.
    viewport: { width: 1536, height: 864 },
    ...(initialState ? { storageState: initialState } : {}),
  });

  // NOTE: JobBKK always logs in fresh. A reused cookie session passes an HTTP check
  // but the Resume Search Talent premium page relies on per-page sessionStorage set
  // during login (storageState can't carry it), so reuse renders masked / redirects.
  // Fresh headful login on a kept-open page is the only reliable path.
  console.log(`  [JobBKK] logging in as ${creds.username}...`);
  const page = await performLogin(context, { ...creds, debug, onHeartbeat });
  if (useFile) {
    await context.storageState({ path: STORAGE_PATH });
    if (debug) console.log(`  Logged in & saved session → ${STORAGE_PATH}`);
  } else if (debug) {
    console.log('  Logged in (session will be persisted to DB by caller)');
  }

  return {
    browser,
    context,
    page, // the logged-in page — JobBKK's browser search must run on THIS page
    request: context.request,
    reused: false,
    dumpState: () => context.storageState(),
  };
}

/**
 * Log out server-side so JobBKK releases the single active session.
 *
 * JobBKK enforces ONE active employer session: if a previous run just closed the
 * browser (session left "active" on the server), the NEXT login collides — it lands
 * as a secondary session that the resume-detail render treats as NOT a logged-in
 * employer (masked `.ownerNoLogin` contact). Ending each run with an explicit logout
 * cleanly frees the session so the next run's login is the sole one and gets
 * recognised. Best-effort + verified; never throws (logout failure must not fail a run).
 *
 * Reads the real logout href from the dashboard header, navigates to it, then falls
 * back to known endpoints. Returns true if we end up logged out.
 */
export async function logoutJobbkk(context, { debug = false } = {}) {
  const page = await context.newPage();
  try {
    await page.goto(DASHBOARD_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
    // Prefer the real logout link (its href), so a hidden dropdown menu doesn't block a click.
    const href = await page
      .locator('a:has-text("ออกจากระบบ"), a[href*="logout" i], a[href*="signout" i]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    const candidates = [
      href && new URL(href, BASE).href,
      `${BASE}/login/logout`,
      `${BASE}/logout`,
      `${BASE}/employer/logout`,
    ].filter(Boolean);
    for (const u of candidates) {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
      await sleep(400);
      // logged out when the dashboard now bounces to the login form
      const res = await context.request.get(DASHBOARD_URL(), { maxRedirects: 5 }).catch(() => null);
      const body = res ? await res.text().catch(() => '') : '';
      const loggedOut = !res || /employer_login|\/login\//i.test(res.url()) || /name=["']?username_emp/i.test(body.slice(0, 8000));
      if (loggedOut) {
        if (debug) console.log(`  [JobBKK] logged out ✓ (${u})`);
        return true;
      }
    }
    if (debug) console.log('  [JobBKK] logout: could not confirm logged-out state');
    return false;
  } catch (e) {
    if (debug) console.log(`  [JobBKK] logout error (ignored): ${e.message}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}
