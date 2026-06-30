function envString(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value.trim();
}

export function envInt(name, fallback) {
  const parsed = Number.parseInt(envString(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function envBool(name, fallback = false) {
  const value = envString(name, String(fallback)).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random delay between candidates — jitter helps avoid bot-like fixed intervals. */
export function candidateGapMs() {
  const min = envInt('DELAY_MS_MIN', envInt('DELAY_MS', 1500));
  const max = envInt('DELAY_MS_MAX', Math.max(min, min + 800));
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function attachmentGapMs() {
  const base = envInt('ATTACHMENT_DELAY_MS', 400);
  const jitter = envInt('ATTACHMENT_DELAY_JITTER_MS', 250);
  if (jitter <= 0) return base;
  return base + Math.floor(Math.random() * (jitter + 1));
}

export async function waitForResumePageReady(page, timeoutMs = 12_000) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const ready = page.locator(
    '.header-name, .rsm-name, .education, #attach-zone, .main-name, .pic-profile, #hiddenPhone_1, #tagMail_1, a[href*="showPhone"]',
  ).first();
  await ready.waitFor({ state: 'attached', timeout: timeoutMs }).catch(() => {});
  await sleep(envInt('PAGE_READY_MS', 350));
}

export async function isEmployerLoggedIn(page) {
  const url = page.url();
  if (/\/employer\//i.test(url) && !/\/login\//i.test(url)) return true;
  if (/\/resumes\//i.test(url)) return true;

  const loginField = page.locator('#username_emp, input[name="username_emp"], #password_emp').first();
  if ((await loginField.count()) === 0) return true;
  return !(await loginField.isVisible().catch(() => false));
}

/** Poll until employer login succeeds — no Enter required (captcha: complete in browser, scraper continues). */
export async function waitForEmployerLoginComplete(page, timeoutMs = 120_000) {
  const start = Date.now();
  let notifiedCaptcha = false;

  while (Date.now() - start < timeoutMs) {
    if (await isEmployerLoggedIn(page)) {
      console.log('Login complete — continuing automatically.');
      await sleep(400);
      return true;
    }

    const hasCaptcha = (await page.locator('iframe[src*="recaptcha"], iframe[src*="captcha"]').count()) > 0;
    if (hasCaptcha && !notifiedCaptcha) {
      console.log('Captcha detected — complete it in the browser; scraper will continue when login succeeds.');
      notifiedCaptcha = true;
    }

    await sleep(500);
  }

  throw new Error('Login timed out — employer session not detected within 2 minutes');
}

export function runPreflightChecks({
  username,
  password,
  employerLoginUrl,
  resumeSearchUrl,
  debugMode,
  delayMin,
  delayMax,
}) {
  const warnings = [];
  const errors = [];

  if (!username || !password) {
    errors.push('JOBBKK_USERNAME / JOBBKK_PASSWORD ไม่ครบใน .env');
  }
  if (!employerLoginUrl) {
    errors.push('JOBBKK_EMPLOYER_LOGIN_URL ไม่ได้ตั้งใน .env');
  }
  if (!resumeSearchUrl) {
    errors.push('JOBBKK_RESUME_SEARCH_URL ไม่ได้ตั้งใน .env');
  }
  if (delayMin < 800) {
    warnings.push(`DELAY_MS_MIN=${delayMin} ต่ำมาก — เสี่ยงโดน block (แนะนำ >= 1000)`);
  }
  if (debugMode) {
    warnings.push('DEBUG_MODE=true — บันทึก PNG/HTML ทุก candidate ทำให้ช้าลง (ปิดเพื่อความเร็ว)');
  }

  return { warnings, errors };
}

export function printPreflightReport(report) {
  if (report.warnings.length) {
    console.log('\n--- Preflight warnings ---');
    for (const line of report.warnings) console.log(`  ! ${line}`);
  }
  if (report.errors.length) {
    console.log('\n--- Preflight errors ---');
    for (const line of report.errors) console.log(`  x ${line}`);
    throw new Error(report.errors.join('; '));
  }
  if (!report.warnings.length) {
    console.log('Preflight OK');
  }
}
