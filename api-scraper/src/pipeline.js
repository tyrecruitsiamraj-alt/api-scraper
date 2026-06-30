import { resolveProvider } from './connectors/registry.js';
import { RateLimiter } from './core/anti-ban.js';
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

    let sess = await provider.getSession({
      headless: runtime.headless,
      debug: runtime.debug,
      username: connector.username,
      password: connector.password(),
      storageState: connector.session_state ?? undefined,
    });
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
      sess = await provider.getSession({
        headless: runtime.headless,
        debug: runtime.debug,
        username: connector.username,
        password: connector.password(),
        forceLogin: true,
      });
      browser = sess.browser;
      await saveConnectorSession(connector.id, await sess.dumpState());
      search = await runSearch();
    }
    found = search.ids.length;
    console.log(`  [${connector.label}] found ${found} ids (target ${target}, site ~${search.totalAvailable ?? '?'})`);

    let saved = 0;
    let detailRelogged = false; // force a fresh login (taking over other sessions) at most once
    for (const id of search.ids) {
      if (saved >= target) break;
      await limiter.wait();
      try {
        const url = provider.resumeDetailUrl(id);
        let html = await provider.fetchResumeHtml(sess.request, id, runtime);
        let parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });
        // A detail page with no name = a logged-out/gated view (the account's
        // session was kicked, e.g. someone logged in elsewhere). Force a fresh
        // login — performLogin clicks ยืนยัน/ตกลง to TAKE OVER and boot the other
        // session — then refetch. Done at most once per run to avoid a tug-of-war loop.
        if (!parsed.name && !detailRelogged) {
          detailRelogged = true;
          console.warn(`  [${connector.label}] resume ${id}: logged-out/gated view → fresh login (takeover) + refetch`);
          await browser.close().catch(() => {});
          sess = await provider.getSession({
            headless: runtime.headless,
            debug: runtime.debug,
            username: connector.username,
            password: connector.password(),
            forceLogin: true,
          });
          browser = sess.browser;
          await saveConnectorSession(connector.id, await sess.dumpState());
          html = await provider.fetchResumeHtml(sess.request, id, runtime);
          parsed = provider.parseResumeHtml(html, { sourceUrl: url, index: saved + 1, focusPosition: criteria.position || '-' });
        }
        // platforms where contacts are masked in HTML (e.g. JobThai) reveal them here
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
      } catch (e) {
        if (e.fatal) {
          status = 'cooldown';
          error = e.message;
          await setConnectorCooldown(connector.id, new Date(Date.now() + COOLDOWN_MS).toISOString());
          console.error(`  ⛔ soft-ban detected (${e.message}) — cooldown ${COOLDOWN_MS / 3600000}h`);
          break;
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
