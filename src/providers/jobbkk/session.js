import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AUTH_DIR, envString, envInt, envBool, sleep } from '../../config.js';
import { detectCaptcha, injectCaptchaToken, solveCaptcha } from '../../captcha.js';
import { dismissOverlays } from '../../core/popup.js';

const BASE = 'https://www.jobbkk.com';
const STORAGE_PATH = join(AUTH_DIR, 'jobbkk.json');
const LOGIN_URL = () => envString('JOBBKK_EMPLOYER_LOGIN_URL', 'https://www.jobbkk.com/login/employer_login');
const DASHBOARD_URL = () => envString('JOBBKK_DASHBOARD_URL', 'https://www.jobbkk.com/employer/dashboard');
const DASHBOARD_URL_ALT = () => envString('JOBBKK_DASHBOARD_URL_ALT', 'https://www.jobbkk.com/dashboard/employer');
// Fail-fast: cap the fresh-login wait so a bot-check/CAPTCHA hang errors quickly (with a debug
// screenshot) instead of freezing for minutes. Tunable via env; defaults 45s wait / 30s page-load.
const LOGIN_TIMEOUT_MS = () => envInt('JOBBKK_LOGIN_TIMEOUT_MS', 45_000);
const LOGIN_GOTO_TIMEOUT_MS = () => envInt('JOBBKK_LOGIN_GOTO_TIMEOUT_MS', 30_000);
const LOGIN_REQUEST_TIMEOUT_MS = () => envInt('JOBBKK_LOGIN_REQUEST_TIMEOUT_MS', 10_000);
const CAPTCHA_TIMEOUT_MS = () => envInt('JOBBKK_CAPTCHA_TIMEOUT_MS', 30_000);

/** True when HTML still shows the employer login form (legacy or Ant Design). */
export function htmlHasEmployerLoginForm(html) {
  const head = String(html || '').slice(0, 12_000);
  if (/name=["']?username_emp\b/i.test(head) || /id=["']username_emp["']/i.test(head)) return true;
  // 2026 Ant Design login: #username / #password + primary "เข้าสู่ระบบ" (button outside <form>).
  if (/id=["']username["']/i.test(head) && /id=["']password["']/i.test(head)) return true;
  if (/name=["']username["']/i.test(head) && /name=["']password["']/i.test(head) && /เข้าสู่ระบบ/i.test(head)) return true;
  return false;
}

/** A public /home redirect is logged out even when it no longer contains the
 * old username_emp form in the first HTML chunk. */
export function isEmployerSessionUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!/(^|\.)jobbkk\.com$/i.test(url.hostname)) return false;
    const path = url.pathname || '';
    // Live JobBKK uses both /employer/... and /dashboard/employer after login.
    const employerPath = /^\/employer\//i.test(path) || /^\/dashboard\/employer(?:\/|$)/i.test(path);
    return employerPath && !/noLogIn|login/i.test(`${path}${url.search}`);
  } catch {
    return false;
  }
}

function abortError() {
  const error = new Error('ยกเลิกการเข้าสู่ระบบ JobBKK เพราะใช้เวลานานเกินกำหนด');
  error.code = 'LOGIN_ABORTED';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

async function withOperationTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Is this context's session still a valid logged-in employer session?
 * Cheap HTTP check via the request context (reuses cookies, no rendering).
 */
async function probeEmployerSession(context, url) {
  const res = await context.request
    .get(url, { maxRedirects: 5, timeout: LOGIN_REQUEST_TIMEOUT_MS() })
    .catch(() => null);
  if (!res) return false;
  if (!isEmployerSessionUrl(res.url())) return false;
  const body = await res.text().catch(() => '');
  // logged-out pages bounce to the login form (legacy or Ant Design)
  return !htmlHasEmployerLoginForm(body);
}

async function isLoggedIn(context) {
  if (await probeEmployerSession(context, DASHBOARD_URL())) return true;
  return probeEmployerSession(context, DASHBOARD_URL_ALT());
}

/** Navigate to an employer landing page, trying both live JobBKK dashboard shapes. */
async function gotoEmployerDashboard(page) {
  for (const url of [DASHBOARD_URL(), DASHBOARD_URL_ALT()]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    if (isEmployerSessionUrl(page.url())) return true;
  }
  return isEmployerSessionUrl(page.url());
}

// Prefer Ant Design ids first — live JobBKK (2026) no longer ships #username_emp.
const USERNAME_SELECTORS = [
  '#username',
  'input[name="username"]',
  '#username_emp',
  'input[name="username_emp"]',
  'input[placeholder*="ชื่อผู้ใช้" i]',
  'input[name*="username" i]',
  'input[type="email"]',
];
const PASSWORD_SELECTORS = [
  '#password',
  'input[name="password"]',
  '#password_emp',
  'input[name="password_emp"]',
  'input[placeholder*="รหัสผ่าน" i]',
  'input[type="password"]',
];

/** Click the employer login CTA. Ant Design puts type=button OUTSIDE <form>, so Enter does nothing. */
async function clickEmployerLoginSubmit(page) {
  const candidates = [
    page.locator('#sign_in_emp, button[name="sign_in_emp"]').first(),
    page.getByRole('button', { name: /^\s*เข้าสู่ระบบ\s*$/ }),
    page.locator('button.ant-btn-primary').filter({ hasText: /^\s*เข้าสู่ระบบ\s*$/ }),
    page.locator('button').filter({ hasText: /^\s*เข้าสู่ระบบ\s*$/ }),
  ];
  for (const loc of candidates) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 3); i += 1) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = ((await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      // Never click the seeker CTA ("เข้าสู่ระบบ สำหรับผู้สมัครงาน").
      if (/ผู้สมัคร/i.test(label)) continue;
      await el.click({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/** Surface on-page auth failures so operators see wrong-password vs takeover vs stuck form. */
export function classifyLoginPageHint(text) {
  const body = String(text || '');
  if (/ชื่อผู้ใช้\s*หรือ\s*รหัสผ่าน\s*ไม่ถูกต้อง|รหัสผ่านไม่ถูกต้อง|username\s*or\s*password\s*(is\s*)?(incorrect|invalid)|wrong[_\s-]?password/i.test(body)) {
    return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  }
  if (isSessionTakeoverPrompt(body)) return 'บัญชีล็อกอินซ้อน — ต้องกดยืนยันแย่ง session';
  if (/captcha|recaptcha|ผมไม่ใช่หุ่นยนต์/i.test(body)) return 'ติด CAPTCHA/ยืนยันตัวตน';
  return null;
}

async function readLoginFailureHint(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  return classifyLoginPageHint(body);
}

async function findVisibleLoginFields(page) {
  for (const uSel of USERNAME_SELECTORS) {
    const userField = page.locator(uSel).first();
    if (!(await userField.count().catch(() => 0))) continue;
    if (!(await userField.isVisible().catch(() => false))) continue;
    for (const pSel of PASSWORD_SELECTORS) {
      const passField = page.locator(pSel).first();
      if (!(await passField.count().catch(() => 0))) continue;
      if (await passField.isVisible().catch(() => false)) return { userField, passField };
    }
  }
  return null;
}

/** Wait until the employer login form is visible, recovering from cookie redirects. */
async function waitForLoginFields(page, context, { debug, signal, timeoutMs = LOGIN_TIMEOUT_MS() } = {}) {
  const deadline = Date.now() + timeoutMs;
  let loggedOutForFresh = false;

  while (Date.now() < deadline) {
    throwIfAborted(signal);
    await dismissOverlays(page, { debug });
    const fields = await findVisibleLoginFields(page);
    if (fields) return fields;

    const url = page.url();
    const onLoginUrl = /\/login\//i.test(url);
    const cookieLoggedIn = (await isLoggedIn(context).catch(() => false)) || (/\/employer\//i.test(url) && !onLoginUrl && !/noLogIn/i.test(url));

    // Saved cookies can skip the login form entirely (redirect → dashboard). That
    // leaves no #username_emp to fill (30s timeout) and no sessionStorage from a
    // real login. Log out once and reload the login page for a clean credential flow.
    if (cookieLoggedIn && !loggedOutForFresh) {
      console.log('  [JobBKK] saved cookies skipped login form — logging out for fresh login...');
      await logoutJobbkk(context, { debug });
      loggedOutForFresh = true;
      await page.goto(LOGIN_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
      await sleep(800);
      continue;
    }

    if (!onLoginUrl) {
      await page.goto(LOGIN_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() }).catch(() => {});
      await sleep(800);
      continue;
    }

    await sleep(500);
  }
  return null;
}

/** True when JobBKK is asking us to kick the other active session. */
export function isSessionTakeoverPrompt(text) {
  return /ถูกใช้งานอยู่ในระบบ|ถูกใช้งานจากอุปกรณ์อื่น|ใช้งานอยู่ในระบบ|logged[\s-]?in elsewhere|ยืนยันการเข้าใช้งาน|เข้าใช้งานซ้ำ|เซสชันอื่น|session.*elsewhere|duplicate_login|duplicate_employer/i.test(String(text || ''));
}

/**
 * Always take over when JobBKK says the account is logged in elsewhere.
 * Product rule: concurrent login is expected — click ตกลง/ยืนยัน immediately,
 * never wait for a human and never treat the dialog as a hard failure.
 */
async function confirmSessionTakeover(page, { debug = false } = {}) {
  const body = await page.locator('body').innerText().catch(() => '');
  const takeoverHint = isSessionTakeoverPrompt(body);

  const candidates = [
    page.getByRole('button', { name: /^\s*ตกลง\s*$/ }),
    page.getByRole('button', { name: /^\s*ยืนยัน\s*$/ }),
    page.getByRole('button', { name: /ยืนยัน/ }),
    page.getByRole('button', { name: /^\s*OK\s*$/i }),
    page.getByText(/^\s*ตกลง\s*$/, { exact: true }),
    page.getByText(/^\s*ยืนยัน\s*$/, { exact: true }),
    page.locator('button, a, input[type="button"], input[type="submit"], .btn, [role="button"]')
      .filter({ hasText: /^\s*(ตกลง|ยืนยัน|OK)\s*$/i }),
    // Ant Design / SweetAlert / Bootstrap modals
    page.locator('.ant-modal button, .ant-modal-confirm-btns button, .ant-btn-primary, .modal.show button, .modal button, .swal2-confirm, .confirm, .btn-confirm, .btn-danger, .btn-primary, .btn-success')
      .filter({ hasText: /ตกลง|ยืนยัน|OK/i }),
    page.locator('input[type="button"][value*="ตกลง"], input[type="submit"][value*="ตกลง"], input[value*="ยืนยัน"]'),
  ];

  for (const loc of candidates) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('value').catch(() => '')) || '').trim();
      // Prefer an explicit takeover dialog; still click a lone ตกลง/ยืนยัน after submit.
      if (!takeoverHint && !/^(ตกลง|ยืนยัน|OK)$/i.test(label)) continue;
      if (/ยกเลิก|cancel|ปิด|close|ผู้สมัคร/i.test(label)) continue;
      console.log('  [JobBKK] บัญชีล็อกอินที่อื่นอยู่ — กดยืนยันแย่ง session ทันที');
      await el.click({ timeout: 3000, force: true }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(1200);
      if (debug) console.log('  [JobBKK] session takeover confirmed');
      return true;
    }
  }

  // Last resort: click any visible Ant Design primary button inside a modal when
  // the page text clearly asks to confirm a duplicate session.
  if (takeoverHint) {
    const modalPrimary = page.locator('.ant-modal-wrap:not([style*="display: none"]) button.ant-btn-primary, .ant-modal button.ant-btn-primary').first();
    if (await modalPrimary.isVisible().catch(() => false)) {
      console.log('  [JobBKK] บัญชีล็อกอินที่อื่นอยู่ — กดปุ่มหลักใน modal');
      await modalPrimary.click({ timeout: 3000, force: true }).catch(() => {});
      await sleep(1200);
      return true;
    }
  }

  if (takeoverHint && debug) {
    console.log('  [JobBKK] saw takeover prompt but no confirm button yet');
  }
  return false;
}

/** Poll until cookies prove we're logged in — handles dialogs/CAPTCHA along the way. */
async function waitForLoginComplete(page, context, { debug, onHeartbeat, signal, timeoutMs = LOGIN_TIMEOUT_MS() }) {
  const start = Date.now();
  let captchaNotified = false;
  let lastBeat = 0;

  while (Date.now() - start < timeoutMs) {
    throwIfAborted(signal);
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

    await confirmSessionTakeover(page, { debug });
    await dismissOverlays(page, { debug });

    const challenge = await detectCaptcha(page);
    if (challenge?.present) {
      if (!captchaNotified) {
        console.log('  [JobBKK] CAPTCHA on login — attempting automated solve...');
        captchaNotified = true;
      }
      const token = await withOperationTimeout(
        solveCaptcha(challenge),
        CAPTCHA_TIMEOUT_MS(),
        'ระบบแก้ CAPTCHA ของ JobBKK ไม่ตอบกลับภายในเวลาที่กำหนด',
      );
      await injectCaptchaToken(page, token);
      if (!(await clickEmployerLoginSubmit(page))) {
        await page.locator('input[type="password"]').first().press('Enter').catch(() => {});
      }
    }

    await sleep(600);
  }

  const shot = join(AUTH_DIR, 'jobbkk-login-debug.png');
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  const secs = Math.round(timeoutMs / 1000);
  console.log(`  [JobBKK] login failed — screenshot saved → ${shot} | url=${page.url()}`);
  throw new Error(`JobBKK เข้าสู่ระบบไม่สำเร็จภายใน ${secs} วินาที อาจติด CAPTCHA หรือระบบป้องกันบอท โปรดดูภาพ ${shot}`);
}

async function performLogin(context, { username, password, debug, onHeartbeat, signal }) {
  if (!username || !password) {
    throw new Error('JobBKK username/password missing (จาก connector หรือ .env)');
  }

  const page = await context.newPage();
  try {
    throwIfAborted(signal);
    if (onHeartbeat) await Promise.resolve(onHeartbeat()).catch(() => {});
    console.log('  [JobBKK] opening login page...');
    await page.goto(LOGIN_URL(), { waitUntil: 'domcontentloaded', timeout: LOGIN_GOTO_TIMEOUT_MS() });
    await sleep(500);
    await dismissOverlays(page, { debug });

    const fields = await waitForLoginFields(page, context, { debug, signal, timeoutMs: LOGIN_TIMEOUT_MS() });
    if (!fields) {
      const shot = join(AUTH_DIR, 'jobbkk-login-debug.png');
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      throw new Error(`JobBKK ไม่พบช่องกรอกชื่อผู้ใช้และรหัสผ่าน (หน้า ${page.url()}) โปรดดูภาพ ${shot}`);
    }

    await fields.userField.fill(username);
    await fields.passField.fill(password);

    const challenge = await detectCaptcha(page);
    if (challenge?.present) {
      console.log('  [JobBKK] CAPTCHA before submit — attempting automated solve...');
      const token = await withOperationTimeout(
        solveCaptcha(challenge),
        CAPTCHA_TIMEOUT_MS(),
        'ระบบแก้ CAPTCHA ของ JobBKK ไม่ตอบกลับภายในเวลาที่กำหนด',
      );
      await injectCaptchaToken(page, token);
    }

    console.log('  [JobBKK] submitting credentials...');
    if (!(await clickEmployerLoginSubmit(page))) {
      // Legacy forms may still submit on Enter; Ant Design employer CTA will not.
      await fields.passField.press('Enter').catch(() => {});
    }

    // Product rule: if JobBKK says the account is logged in elsewhere, always
    // click ตกลง/ยืนยัน and take the session — never wait for a human.
    const isPageLoggedIn = () => isEmployerSessionUrl(page.url()) || /\/resumes\//i.test(page.url());
    const deadline = Date.now() + LOGIN_TIMEOUT_MS();
    let confirmedKick = false;
    let earlyFailHint = null;
    // First attempt right after submit — dialog often appears immediately.
    if (await confirmSessionTakeover(page, { debug })) confirmedKick = true;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      if (onHeartbeat) await Promise.resolve(onHeartbeat()).catch(() => {});
      if (isPageLoggedIn()) break;

      if (await confirmSessionTakeover(page, { debug })) {
        confirmedKick = true;
        continue;
      }

      const hint = await readLoginFailureHint(page);
      if (hint && /รหัสผ่านไม่ถูกต้อง|ชื่อผู้ใช้หรือรหัสผ่าน/i.test(hint)) {
        earlyFailHint = hint;
        break;
      }

      const challenge = await detectCaptcha(page);
      if (challenge?.present) {
        console.log('  [JobBKK] CAPTCHA on login — attempting automated solve...');
        const token = await withOperationTimeout(
          solveCaptcha(challenge),
          CAPTCHA_TIMEOUT_MS(),
          'ระบบแก้ CAPTCHA ของ JobBKK ไม่ตอบกลับภายในเวลาที่กำหนด',
        );
        await injectCaptchaToken(page, token);
        if (!(await clickEmployerLoginSubmit(page))) {
          await page.locator('input[type="password"]').first().press('Enter').catch(() => {});
        }
      }

      // if the login form is gone but URL hasn't updated, nudge to the dashboard
      const stillOnForm = await findVisibleLoginFields(page);
      if (!stillOnForm && !isPageLoggedIn()) {
        await gotoEmployerDashboard(page);
        if (await confirmSessionTakeover(page, { debug })) confirmedKick = true;
      }
      await sleep(600);
    }

    // Confirm the session is REAL by loading the dashboard (not the noLogIn bounce).
    if (!earlyFailHint) {
      await gotoEmployerDashboard(page);
      // Dashboard bounce can re-show the takeover dialog — always click confirm again.
      if (await confirmSessionTakeover(page, { debug })) {
        confirmedKick = true;
        await gotoEmployerDashboard(page);
      }
    }
    if (debug) console.log(`  [JobBKK] login result: url=${page.url()} (kickConfirmed=${confirmedKick})`);
    const finalEmployerUrl = page.url();
    const employerSessionReady = !earlyFailHint
      && isEmployerSessionUrl(finalEmployerUrl)
      && await isLoggedIn(context).catch(() => false);
    if (!employerSessionReady) {
      await page.screenshot({ path: join(AUTH_DIR, 'jobbkk-postlogin.png'), fullPage: true }).catch(() => {});
      const hint = earlyFailHint || await readLoginFailureHint(page);
      const hintPart = hint ? ` — ${hint}` : '';
      throw new Error(`JobBKK Login ยังไม่สร้าง Employer Session (ไปที่ ${finalEmployerUrl})${hintPart} โปรดตรวจบัญชี/สิทธิ์และภาพ .auth/jobbkk-postlogin.png`);
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
export async function getJobbkkSession({ headless = true, debug = false, username, password, storageState, forceLogin = false, onHeartbeat, signal } = {}) {
  const creds = {
    username: username ?? envString('JOBBKK_USERNAME'),
    password: password ?? envString('JOBBKK_PASSWORD'),
  };
  const useFile = !storageState && !forceLogin; // standalone mode persists to .auth file
  if (useFile) await mkdir(AUTH_DIR, { recursive: true });

  // Never preload saved cookies into the browser context. JobBKK premium search needs
  // a fresh headful login (sessionStorage is set during login and isn't in
  // storageState). Preloaded cookies redirect /login/employer_login → dashboard,
  // so #username_emp never appears and fill() times out after 30s.
  const hideWindow = !headless && !debug && !envBool('JOBBKK_SHOW_BROWSER', false);
  const browser = await chromium.launch({
    headless,
    args: hideWindow ? ['--window-position=-32000,-32000', '--window-size=1536,864'] : [],
  });
  // Closing Chromium is what actually interrupts Playwright calls that are stuck
  // inside a page/network operation. The pipeline aborts this signal at its outer
  // login deadline, preventing orphan Chrome processes and single-session clashes.
  const closeOnAbort = () => void browser.close().catch(() => {});
  signal?.addEventListener('abort', closeOnAbort, { once: true });

  try {
    throwIfAborted(signal);
    const context = await browser.newContext({
      locale: 'th-TH',
      acceptDownloads: true,
      // Desktop viewport — the Resume Search Talent premium UI (#autoComplete-position)
      // only renders at desktop width; a narrow viewport falls back to a mobile layout
      // that hides the search fields.
      viewport: { width: 1536, height: 864 },
    });

    // NOTE: JobBKK always logs in fresh. A reused cookie session passes an HTTP check
    // but the Resume Search Talent premium page relies on per-page sessionStorage set
    // during login (storageState can't carry it), so reuse renders masked / redirects.
    // Fresh headful login on a kept-open page is the only reliable path.
    console.log('  [JobBKK] logging in with connector credentials...');
    const page = await performLogin(context, { ...creds, debug, onHeartbeat, signal });
    throwIfAborted(signal);
    if (useFile) {
      await context.storageState({ path: STORAGE_PATH });
      if (debug) console.log(`  Logged in & saved session → ${STORAGE_PATH}`);
    } else if (debug) {
      console.log('  Logged in (session will be persisted to DB by caller)');
    }

    signal?.removeEventListener('abort', closeOnAbort);
    return {
      browser,
      context,
      page, // the logged-in page — JobBKK's browser search must run on THIS page
      request: context.request,
      reused: false,
      dumpState: () => context.storageState(),
    };
  } catch (error) {
    signal?.removeEventListener('abort', closeOnAbort);
    await browser.close().catch(() => {});
    throw error;
  }
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
      const loggedOut = !res || /employer_login|\/login\//i.test(res.url()) || htmlHasEmployerLoginForm(body);
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
