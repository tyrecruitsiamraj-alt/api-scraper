/**
 * Full-base profile photo repair.
 *
 * Phase 1 (no login): supersede older faces + reject placeholder URLs.
 * Phase 2 (optional redownload): log in per connector and fetch a fresh face
 * for every candidate that still lacks a good profile photo.
 *
 * Never invents photos. Never deletes bytea history — only marks status.
 */
import { resolveProvider } from '../connectors/registry.js';
import { sleep } from '../config.js';
import { isRejectedProfileUrl } from './profile-photo.js';
import {
  listConnectors,
  saveAsset,
  saveConnectorSession,
  supersedeStaleProfilePhotos,
} from '../db/repositories.js';

const PLACEHOLDER_URL_SQL = `(
  COALESCE(a.source_url, '') ~* '/img/profile(?:_default)?\\\\.(jpg|jpeg|png|gif|webp)'
  OR COALESCE(a.source_url, '') ~* 'default[-_]?profile|no[-_]?photo|no[-_]?image|avatar[-_]?default|placeholder|anonymous'
  OR COALESCE(a.source_url, '') ~* '/logo|/favicon|employer[_-]?login'
  OR COALESCE(a.source_url, '') ~* '^data:'
)`;

const NEED_PHOTO_SQL = `
  SELECT DISTINCT ON (c.id)
         c.id AS candidate_id,
         c.gender,
         s.id AS source_id,
         s.platform,
         s.external_id,
         s.source_url,
         s.connector_id
    FROM candidates c
    JOIN candidate_sources s ON s.candidate_id = c.id
   WHERE NULLIF(trim(COALESCE(s.external_id, '')), '') IS NOT NULL
     AND s.platform IN ('jobbkk', 'jobthai')
     AND (
       $2::boolean
       OR NOT EXISTS (
         SELECT 1
           FROM candidate_assets a
          WHERE a.candidate_id = c.id
            AND a.kind = 'profile'
            AND a.download_status = 'success'
            AND a.content IS NOT NULL
            AND NOT ${PLACEHOLDER_URL_SQL}
       )
     )
   ORDER BY c.id, s.last_seen_at DESC NULLS LAST, s.first_seen_at DESC NULLS LAST
   LIMIT $1
`;

export async function rejectPlaceholderProfileAssets(db, { dryRun = false } = {}) {
  if (dryRun) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n
         FROM candidate_assets a
        WHERE a.kind = 'profile'
          AND a.download_status IN ('success', 'pending', 'superseded')
          AND ${PLACEHOLDER_URL_SQL}`,
    );
    return { rejected: rows[0]?.n || 0, dryRun: true };
  }
  const { rowCount } = await db.query(
    `UPDATE candidate_assets a
        SET download_status = 'rejected_placeholder'
      WHERE a.kind = 'profile'
        AND a.download_status IN ('success', 'pending', 'superseded')
        AND ${PLACEHOLDER_URL_SQL}`,
  );
  return { rejected: rowCount || 0, dryRun: false };
}

export async function cleanupAllProfilePhotos(db, { dryRun = false } = {}) {
  const placeholders = await rejectPlaceholderProfileAssets(db, { dryRun });
  let superseded = 0;
  if (!dryRun) {
    const result = await db.withTransaction(async (client) => supersedeStaleProfilePhotos(client, { limit: 20000 }));
    superseded = result.superseded || 0;
  }
  return { placeholdersRejected: placeholders.rejected, superseded, dryRun };
}

async function openConnectorSession(connector, provider) {
  const password = typeof connector.password === 'function' ? connector.password() : '';
  const session = await provider.getSession({
    headless: provider.headful ? false : true,
    debug: false,
    username: connector.username,
    password,
    storageState: connector.session_state || undefined,
  });
  return session;
}

async function closeSession(session) {
  try {
    if (session?.dumpState && session?.reused === false) {
      // caller persists when connector id known
    }
  } catch {
    // ignore
  }
  await session?.browser?.close?.().catch(() => {});
}

async function refreshOnePhoto(provider, session, row) {
  const sourceUrl = row.source_url || provider.resumeDetailUrl?.(row.external_id) || '';
  if (row.platform === 'jobthai') {
    const record = {
      source_url: sourceUrl,
      gender: row.gender || '',
      profile_image_url: '',
    };
    const assets = await provider.collectAssetsForDb(session.request, record, { profileOnly: true });
    return { assets, sourceUrl };
  }

  // JobBKK needs a real browser page to paint the face URL.
  const html = await provider.fetchResumeHtml(session, row.external_id, {});
  const parsed = provider.parseResumeHtml(html, {
    sourceUrl,
    index: 0,
    focusPosition: '-',
  });
  if (isRejectedProfileUrl(parsed.profile_image_url)) {
    parsed.profile_image_url = '';
  }
  const assets = await provider.collectAssetsForDb(session.request, parsed, { profileOnly: true });
  return { assets, sourceUrl };
}

/**
 * @param {{ query: Function, withTransaction: Function }} db
 * @param {{
 *   dryRun?: boolean,
 *   redownload?: boolean,
 *   force?: boolean,
 *   limit?: number,
 *   onProgress?: Function,
 * }} [opts]
 */
export async function repairAllProfilePhotos(db, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const redownload = opts.redownload !== false;
  const force = Boolean(opts.force);
  const limit = Math.min(Math.max(Number(opts.limit) || 5000, 1), 20000);
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const cleanup = await cleanupAllProfilePhotos(db, { dryRun });
  const summary = {
    dryRun,
    redownload,
    force,
    ...cleanup,
    scanned: 0,
    refreshed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    sample: [],
  };

  if (!redownload) return summary;
  if (dryRun) {
    summary.note = 'dry-run: cleanup counted only; redownload skipped';
    return summary;
  }

  const { rows } = await db.query(NEED_PHOTO_SQL, [limit, force]);
  summary.scanned = rows.length;
  if (!rows.length) return summary;

  const byConnector = new Map();
  for (const row of rows) {
    const key = `${row.platform}:${row.connector_id || 'any'}`;
    if (!byConnector.has(key)) byConnector.set(key, []);
    byConnector.get(key).push(row);
  }

  for (const [, group] of byConnector) {
    const platform = group[0].platform;
    let provider;
    try {
      provider = resolveProvider(platform);
    } catch (error) {
      summary.skipped += group.length;
      if (summary.errors.length < 20) summary.errors.push({ platform, error: error.message });
      continue;
    }
    if (!provider?.getSession || !provider?.collectAssetsForDb) {
      summary.skipped += group.length;
      continue;
    }

    let connector = null;
    if (group[0].connector_id) {
      const listed = await listConnectors({ platform, enabledOnly: true });
      connector = listed.find((item) => item.id === group[0].connector_id) || listed[0] || null;
    } else {
      const listed = await listConnectors({ platform, enabledOnly: true });
      connector = listed[0] || null;
    }
    if (!connector) {
      summary.failed += group.length;
      if (summary.errors.length < 20) {
        summary.errors.push({ platform, error: 'no_enabled_connector' });
      }
      continue;
    }

    let session;
    try {
      session = await openConnectorSession(connector, provider);
      onProgress({ phase: 'login', platform, connector: connector.label || connector.id });
    } catch (error) {
      summary.failed += group.length;
      if (summary.errors.length < 20) {
        summary.errors.push({ platform, connector: connector.id, error: error.message });
      }
      continue;
    }

    try {
      for (const row of group) {
        try {
          const { assets } = await refreshOnePhoto(provider, session, row);
          const ok = (assets || []).find((asset) => (
            asset.kind === 'profile'
            && asset.download_status === 'success'
            && asset.sha256
            && asset.content
            && !isRejectedProfileUrl(asset.source_url)
          ));
          if (!ok) {
            summary.skipped += 1;
            continue;
          }
          await db.withTransaction(async (client) => {
            await saveAsset(client, row.candidate_id, row.source_id, ok);
          });
          summary.refreshed += 1;
          if (summary.sample.length < 10) {
            summary.sample.push({
              candidate_id: row.candidate_id,
              platform: row.platform,
              bytes: ok.byte_size,
            });
          }
          onProgress({
            phase: 'refresh',
            refreshed: summary.refreshed,
            scanned: summary.scanned,
            platform: row.platform,
          });
          // Gentle pacing — JobBKK especially hates burst resume opens.
          await sleep(platform === 'jobbkk' ? 1800 : 600);
        } catch (error) {
          summary.failed += 1;
          if (summary.errors.length < 20) {
            summary.errors.push({
              candidate_id: row.candidate_id,
              platform: row.platform,
              error: error.message,
            });
          }
        }
      }

      if (session?.dumpState) {
        try {
          const state = await session.dumpState();
          await saveConnectorSession(connector.id, state);
        } catch {
          // session persist is best-effort
        }
      }
    } finally {
      await closeSession(session);
    }
  }

  // Final pass: keep newest face after mass refresh.
  if (!dryRun) {
    const again = await db.withTransaction(async (client) => supersedeStaleProfilePhotos(client, { limit: 20000 }));
    summary.superseded += again.superseded || 0;
  }

  return summary;
}
