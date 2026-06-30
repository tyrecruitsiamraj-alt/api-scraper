import { sleep } from '../config.js';

/**
 * Anti-ban toolkit. The whole point: behave like a careful human, fail safe.
 *
 *  - randomized delays between requests (no fixed cadence)
 *  - per-connector concurrency = 1 (caller enforces by awaiting sequentially)
 *  - exponential backoff + jitter on 429/5xx
 *  - soft-ban detection (captcha / login redirect / sudden empty results)
 *  - per-round + daily caps (enforced in pipeline via connector limits)
 */

export class RateLimiter {
  constructor({ minMs = 2000, maxMs = 6000 } = {}) {
    this.minMs = minMs;
    this.maxMs = maxMs;
    this._last = 0;
  }

  nextGap() {
    if (this.maxMs <= this.minMs) return this.minMs;
    return this.minMs + Math.floor(Math.random() * (this.maxMs - this.minMs + 1));
  }

  /** Wait the remaining time so consecutive calls are spaced by a random gap. */
  async wait() {
    const now = Date.now();
    const target = this._last + this.nextGap();
    if (now < target) await sleep(target - now);
    this._last = Date.now();
  }
}

/** Retry a request-returning fn with exponential backoff + jitter. */
export async function withRetry(fn, { retries = 3, baseMs = 1500, debug = false, label = 'request' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.fatal || attempt === retries) break;
      const wait = baseMs * 2 ** attempt + Math.floor(Math.random() * 800);
      if (debug) console.log(`  ${label} retry ${attempt + 1}/${retries} in ${wait}ms (${e.message})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const SOFT_BAN_PATTERNS = [
  /employer_login/i,
  /กรุณาเข้าสู่ระบบ/u,
  /captcha|recaptcha|hcaptcha/i,
  /คุณถูกระงับ|ถูกบล็อก|access denied|too many requests/iu,
];

/**
 * Inspect an HTTP response + body for signs of a soft ban / session loss.
 * Returns { banned: boolean, reason } so the pipeline can stop + cooldown.
 */
export function detectSoftBan({ status, finalUrl = '', body = '' }) {
  if (status === 429) return { banned: true, reason: 'http_429_rate_limited' };
  if (status === 403) return { banned: true, reason: 'http_403_forbidden' };
  if (/employer_login|\/login\//i.test(finalUrl)) return { banned: true, reason: 'redirected_to_login' };
  const head = body.slice(0, 6000);
  for (const p of SOFT_BAN_PATTERNS) {
    if (p.test(head)) return { banned: true, reason: `pattern:${p.source.slice(0, 24)}` };
  }
  return { banned: false };
}

/** Mark an error as fatal so withRetry stops immediately (e.g. soft ban). */
export function fatal(message) {
  const e = new Error(message);
  e.fatal = true;
  return e;
}
