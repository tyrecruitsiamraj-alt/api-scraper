import { closePool } from './db/pool.js';
import {
  listConnectors,
  saveConnectorCanary,
  saveConnectorSession,
} from './db/repositories.js';
import { resolveProvider } from './connectors/registry.js';
import { loadRuntime } from './config.js';

/**
 * One-result live contract check. It validates login, search selectors, detail
 * rendering and parser shape without revealing contacts or saving a candidate.
 */
async function checkConnector(connector, runtime) {
  const provider = resolveProvider(connector.platform);
  let session = null;
  let searchCount = 0;
  let parsedOk = false;
  try {
    session = await provider.getSession({
      headless: provider.headful ? false : runtime.headless,
      debug: runtime.debug,
      username: connector.username,
      password: connector.password(),
      storageState: connector.session_state ?? undefined,
      forceLogin: false,
    });
    await saveConnectorSession(connector.id, await session.dumpState());
    const search = await provider.searchResumeIds(
      session,
      { position: process.env.CANARY_POSITION || 'พนักงาน', maxCandidates: 1 },
      runtime,
    );
    searchCount = search.ids.length;
    if (search.ids[0]) {
      const id = search.ids[0];
      const url = provider.resumeDetailUrl(id);
      const html = await provider.fetchResumeHtml(session, id, runtime);
      const parsed = provider.parseResumeHtml(html, {
        sourceUrl: url,
        index: 1,
        focusPosition: 'canary',
      });
      parsedOk = !!(
        parsed &&
        (String(parsed.name || '').trim() ||
          String(parsed.desired_positions || '').trim() ||
          String(parsed.raw_text || '').trim())
      );
    }
    const status = searchCount > 0 && parsedOk ? 'pass' : 'fail';
    const error = status === 'pass' ? null : `search_count=${searchCount}; parsed_ok=${parsedOk}`;
    await saveConnectorCanary({
      connectorId: connector.id,
      platform: connector.platform,
      status,
      searchCount,
      parsedOk,
      error,
    });
    return { connector: connector.label, platform: connector.platform, status, searchCount, parsedOk, error };
  } catch (error) {
    await saveConnectorCanary({
      connectorId: connector.id,
      platform: connector.platform,
      status: 'fail',
      searchCount,
      parsedOk,
      error: String(error.message || error).slice(0, 500),
    }).catch(() => {});
    return {
      connector: connector.label,
      platform: connector.platform,
      status: 'fail',
      searchCount,
      parsedOk,
      error: String(error.message || error),
    };
  } finally {
    if (session) {
      if (provider.logout) await provider.logout(session.context, { debug: runtime.debug }).catch(() => {});
      await session.browser.close().catch(() => {});
    }
  }
}

async function main() {
  const runtime = loadRuntime();
  const connectors = await listConnectors({ enabledOnly: true });
  const results = [];
  for (const connector of connectors) {
    if (connector.cooldown_until && new Date(connector.cooldown_until) > new Date()) {
      results.push({
        connector: connector.label,
        platform: connector.platform,
        status: 'skipped_cooldown',
      });
      continue;
    }
    results.push(await checkConnector(connector, runtime));
  }
  console.log(JSON.stringify(results, null, 2));
  await closePool();
  if (results.some((r) => r.status === 'fail')) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error.message || String(error));
  await closePool();
  process.exit(1);
});
