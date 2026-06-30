import http from 'node:http';
import { envInt, loadCriteria, loadRuntime } from '../config.js';
import { getAsset, getCandidateDetail, getConnector, listCandidates, listConnectors } from '../db/repositories.js';
import { runConnector } from '../pipeline.js';

/**
 * Minimal zero-dependency control API.
 *   GET  /health
 *   GET  /connectors
 *   GET  /candidates?limit=50&platform=jobbkk
 *   GET  /candidates/:id
 *   GET  /assets/:id                 → raw file (bytea)
 *   POST /runs   {connectorId, criteria?}   → trigger a scrape (async)
 */
const PORT = envInt('PORT', 8080);

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true });

    if (req.method === 'GET' && path === '/connectors') {
      const rows = await listConnectors();
      return json(res, 200, rows.map((c) => ({ id: c.id, platform: c.platform, label: c.label, enabled: c.enabled, scrape_limit: c.scrape_limit, cooldown_until: c.cooldown_until })));
    }

    if (req.method === 'GET' && path === '/candidates') {
      const rows = await listCandidates({
        limit: Number.parseInt(url.searchParams.get('limit') ?? '50', 10),
        offset: Number.parseInt(url.searchParams.get('offset') ?? '0', 10),
        platform: url.searchParams.get('platform') ?? undefined,
      });
      return json(res, 200, rows);
    }

    const candMatch = path.match(/^\/candidates\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && candMatch) {
      const detail = await getCandidateDetail(candMatch[1]);
      return detail ? json(res, 200, detail) : json(res, 404, { error: 'not found' });
    }

    const assetMatch = path.match(/^\/assets\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && assetMatch) {
      const a = await getAsset(assetMatch[1]);
      if (!a || !a.content) return json(res, 404, { error: 'not found' });
      res.writeHead(200, {
        'Content-Type': a.mime || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${a.title || 'file'}.${a.file_type || 'bin'}"`,
      });
      return res.end(a.content);
    }

    if (req.method === 'POST' && path === '/runs') {
      const body = await readBody(req);
      const connector = await getConnector(body.connectorId);
      if (!connector) return json(res, 404, { error: 'connector not found' });
      const criteria = { ...loadCriteria(), ...(body.criteria ?? {}) };
      // fire-and-forget; client polls scrape_runs / candidates for progress
      runConnector(connector, criteria, loadRuntime()).catch((e) => console.error('run error:', e.message));
      return json(res, 202, { accepted: true, connector: connector.label });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`control API on :${PORT}`));
