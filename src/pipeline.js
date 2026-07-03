import { resolveProvider } from './connectors/registry.js';
import { RateLimiter } from './core/anti-ban.js';
import { envInt } from './config.js';
import {
  countScrapedToday,
  finishRun,
  getProviderCap,
  platformScrapedToday,
  saveAsset,
  saveConnectorSession,
  setConnectorCooldown,
  startRun,
  upsertCandidate,
  upsertSource,
  withTransaction,
} from './db/repositories.js';

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h after a soft-ban
const CANDIDATE_TIMEOUT_MS = envInt('CANDIDATE_TIMEOUT_MS', 180_000); // skip hung resume fetches
const LOGIN_TIMEOUT_MS = envInt('LOGIN_TIMEOUT_MS', 300_000); // browser login must finish within 5 min

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout:${label}:${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function isSessionError(e) {
  if (e?.needsRelogin) return true;
  const m = String(e?.message ?? '');
  return /session_expired|session_redirect|Max redirect|jobpost|not_authenticated|logged-out|timeout:login/i.test(m);
}

/**
 * Run one scrape for a connector and persist everything to Postgres.
 * Honors per-round limit, daily cap, rate limiting, and soft-ban cooldown.
 */
export async function runConnector(connector, criteria, runtime, opts = {}) {
  const provider = resolveProvider(connector.platform);
  const limiter = new RateLimiter({ minMs: runtime.delayMin, maxMs: runtime.delayMax });
  const runId = await startRun(connector.id, connector.platform, criteria, opts.taskId ?? null);

  let newCount = 0;
  let updatedCount = 0;
  let failed = 0;
  let found = 0;
  let status = 'success';
  let error = null;
  let browser = null;

  // per-round limit ∩ connector daily cap ∩ PROVIDER daily cap (strict)
  const today = await countScrapedToday(connector.id);
  const connectorRemaining = Math.max(0, connector.daily_cap - today);
  const providerCap = await getProviderCap(connector.platform);
  let providerRemaining = Infinity;
  if (providerCap != null) {
    const platformToday = await platformScrapedToday(connector.platform);
    providerRemaining = Math.max(0, providerCap - platformToday);
  }
  // Honor an explicitly requested count (count-mode tasks set criteria.maxCandidates);
  // fall back to the connector's per-round scrape_limit when none is given.
  // The daily caps below still bound the result strictly (anti-ban).
  const requested = criteria.maxCandidates ?? connector.scrape_limit;
  const target = Math.min(requested, connectorRemaining, providerRemaining);
  if (opts.onTarget) await opts.onTarget(target);

  try {
    if (target <= 0) {
      status = 'cooldown';
      error =
        providerRemaining <= 0 && providerCap != null
          ? `provider daily cap reached for ${connector.platform} (cap ${providerCap})`
          : `connector daily cap reached (${today}/${connector.daily_cap})`;
      console.warn(`  [${connector.label}] ${error}`);
      return finalize();
    }

    const openSession = async (forceLogin = false) => {
      if (opts.onPhase) await opts.onPhase('login');
      if (opts.onHeartbeat) await opts.onHeartbeat();
      console.log(`  [${connector.label}] opening browser session${forceLogin ? ' (fresh login)' : ''}...`);
      return withTimeout(
        provider.getSession({
          headless: runtime.headless,
          debug: runtime.debug,
          username: connector.username,
          password: connector.password(),
          storageState: connector.session_state ?? undefined,
          forceLogin,
          onHeartbeat: opts.onHeartbeat,
        }),
        LOGIN_TIMEOUT_MS,
        'login',
      );
    };

    if (opts.onPhase) await opts.onPhase('scraping');
    let sess = await openSession(false);
    browser = sess.browser;
    await saveConnectorSession(connector.id, await sess.dumpState());

    const runSearch = () => provider.searchResumeIds(sess.request, { ...criteria, maxCandidates: target }, runtime);
    let search;
    try {
      search = await runSearch();
    } catch (e) {
      // Stale/hijacked session (login page, "logged in elsewhere" dialog, or a
      // non-results page): force a fresh browser login that takes over the
      // session, then retry the search ONCE so the run actually succeeds.
      if (!e.needsRelogin) throw e;
      console.warn(`  [${connector.label}] ${e.message} → forcing fresh login + retry`);
      await browser.close().catch(() => {});
      sess = await openSession(true);
      browser = sess.browser;
      await saveConnectorSession(connector.id, await sess.dumpState());
      search = await runSearch();
    }
    found = search.ids.length;
    console.log(`  [${connector.label}] found ${found} ids (target ${target}, site ~${search.totalAvailable ?? '?'})`);

    const resumeFrom = Math.max(0, opts.resumeFrom ?? 0);
    if (resumeFrom > 0) {
      console.log(`  [${connector.label}] resuming from #${resumeFrom + 1} (skip ${resumeFrom} ids already scraped)`);
    }

    let saved = resumeFrom;
    if (saved > 0 && opts.onProgress) await opts.onProgress(saved, target);
    let sessionRelogins = 0;
    const MAX_SESSION_RELOGINS = 8;

    async function refreshSession(reason) {
      if (sessionRelogins >= MAX_SESSION_RELOGINS) throw new Error(`session_relogin_exhausted: ${reason}`);
      sessionRelogins += 1;
      console.warn(`  [${connector.label}] ${reason} → fresh login (${sessionRelogins}/${MAX_SESSION_RELOGINS})`);
      await browser.close().catch(() => {});
      if (opts.onPhase) await opts.onPhase('login');
      if (opts.onHeartbeat) await opts.onHeartbeat();
      sess = await openSession(true);
      browser = sess.browser;
      await saveConnectorSession(connector.id, await sess.dumpState());
      if (opts.onPhase) await opts.onPhase('scraping');
    }

    for (let i = resumeFrom; i < search.ids.length; i += 1) {
      const id = search.ids[i];
      if (saved >= target) break;
      await limiter.wait();
      if (opts.onHeartbeat) await opts.onHeartbeat();
      try {
        await withTimeout((async () => {
        const url = provider.resumeDetailUrl(id);
        let html = await provider.fetchResumeHtml(sess.request, id, runtime);
        let parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });
        const authBlocked = provider.isResumeAuthBlocked?.(html, url) ?? false;
        if (authBlocked) {
          await refreshSession(`resume ${id}: session expired (login page)`);
          html = await provider.fetchResumeHtml(sess.request, id, runtime);
          parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });
        }
        if (provider.enrichContacts) await provider.enrichContacts(sess.request, id, parsed, runtime);
        const assets = await provider.collectAssetsForDb(sess.request, parsed);

        const { isNew } = await withTransaction(async (client) => {
          const cand = await upsertCandidate(client, parsed);
          const sourceId = await upsertSource(client, cand.id, {
            platform: connector.platform,
            connectorId: connector.id,
            externalId: provider.externalId(url),
            sourceUrl: url,
            runId,
            parseStatus: parsed.parse_status,
            rawText: parsed.raw_text,
          });
          for (const a of assets) {
            if (a.sha256) await saveAsset(client, cand.id, sourceId, a);
          }
          return cand;
        });

        if (isNew) newCount += 1;
        else updatedCount += 1;
        saved += 1;
        if (opts.onProgress) await opts.onProgress(saved, target);
        const att = assets.filter((a) => a.kind === 'attachment' && a.download_status === 'success').length;
        console.log(`  [${saved}/${target}] ${parsed.name || '(no name)'} ${isNew ? 'NEW' : 'upd'} | ☎ ${parsed.phone || '-'} 📎 ${att}`);
        })(), CANDIDATE_TIMEOUT_MS, `resume_${id}`);
      } catch (e) {
        if (e.fatal) {
          status = 'cooldown';
          error = e.message;
          await setConnectorCooldown(connector.id, new Date(Date.now() + COOLDOWN_MS).toISOString());
          console.error(`  ⛔ soft-ban detected (${e.message}) — cooldown ${COOLDOWN_MS / 3600000}h`);
          break;
        }
        if (isSessionError(e) && sessionRelogins < MAX_SESSION_RELOGINS) {
          try {
            await refreshSession(e.message);
            i -= 1;
            continue;
          } catch (re) {
            failed += 1;
            console.error(`  id ${id}: relogin failed — ${re.message}`);
            continue;
          }
        }
        failed += 1;
        console.error(`  id ${id}: ${e.message}`);
      }
    }

    if (status === 'success' && saved < target) status = 'partial';
  } catch (e) {
    error = e.message;
    if (e.fatal) {
      status = 'cooldown';
      await setConnectorCooldown(connector.id, new Date(Date.now() + COOLDOWN_MS).toISOString());
    } else {
      status = 'failed';
    }
    console.error(`  [${connector.label}] run error: ${e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return finalize();

  async function finalize() {
    await finishRun(runId, { status, requested, found, newCount, updatedCount, failed, error });
    return { runId, status, found, newCount, updatedCount, failed, error };
  }
}
