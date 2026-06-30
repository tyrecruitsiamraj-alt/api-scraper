/**
 * CAPTCHA strategy for Human=0 operation.
 *
 * In testing, JobBKK employer login did NOT present a CAPTCHA — plain
 * username/password POST is enough. So the primary defense against ever
 * needing a human is simply: log in rarely.
 *
 * Layered strategy (cheapest → last resort):
 *   1. Session reuse   — persist storageState and reuse it; only re-login when
 *                        the session is actually dead. This alone keeps logins
 *                        rare enough that CAPTCHA almost never appears.
 *   2. Solver service  — if a CAPTCHA ever blocks an automated login, hand the
 *                        sitekey to a solving service (2captcha/anti-captcha)
 *                        via API and inject the token. Fully automated, no human.
 *                        Enable by setting CAPTCHA_PROVIDER + CAPTCHA_API_KEY.
 *   3. Alert + abort   — if no solver is configured and a CAPTCHA appears, fail
 *                        loudly with a clear message rather than hang waiting
 *                        for a human (keeps the pipeline non-blocking).
 *
 * This module exposes detection + a pluggable solver hook. The 2captcha call
 * itself is left as a thin stub you can fill with your account — the wiring
 * (detect → solve → inject → continue) is here.
 */

import { envString } from './config.js';

const CAPTCHA_IFRAME = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="captcha"]';

export async function detectCaptcha(page) {
  const count = await page.locator(CAPTCHA_IFRAME).count().catch(() => 0);
  if (!count) return null;
  const sitekey = await page
    .locator('[data-sitekey]')
    .first()
    .getAttribute('data-sitekey')
    .catch(() => null);
  return { present: true, sitekey, pageUrl: page.url() };
}

/**
 * Solve a detected CAPTCHA without a human, if a provider is configured.
 * Returns the solved token (string) or throws.
 */
export async function solveCaptcha(challenge) {
  const provider = envString('CAPTCHA_PROVIDER');
  const apiKey = envString('CAPTCHA_API_KEY');

  if (!provider || !apiKey) {
    throw new Error(
      'CAPTCHA detected during login but no solver configured. ' +
        'Set CAPTCHA_PROVIDER + CAPTCHA_API_KEY to keep this fully automated, ' +
        'or re-run later (sessions are reused, so CAPTCHA is rare).',
    );
  }

  if (provider === '2captcha') {
    return solveWith2captcha(apiKey, challenge);
  }

  throw new Error(`Unknown CAPTCHA_PROVIDER "${provider}" (supported: 2captcha)`);
}

/**
 * 2captcha reCAPTCHA v2 flow: submit sitekey+url → poll for token.
 * Stub: fill in once you have an account. Intentionally not network-active
 * by default so the MVP runs without external paid services.
 */
async function solveWith2captcha(apiKey, { sitekey, pageUrl }) {
  if (!sitekey) throw new Error('2captcha needs a sitekey but none was found on the page');
  // const inResp = await fetch(`https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`);
  // const { request: id } = await inResp.json();
  // poll https://2captcha.com/res.php?key=...&action=get&id=...&json=1 until status=1
  throw new Error('2captcha integration stub — fill in solveWith2captcha() with your account to enable');
}

/**
 * Inject a solved reCAPTCHA token into the page so the form submit accepts it.
 */
export async function injectCaptchaToken(page, token) {
  await page.evaluate((t) => {
    const ta = document.querySelector('#g-recaptcha-response, textarea[name="g-recaptcha-response"]');
    if (ta) {
      ta.value = t;
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // common site callback name; harmless if absent
    if (typeof window.captchaCallback === 'function') window.captchaCallback(t);
  }, token);
}
