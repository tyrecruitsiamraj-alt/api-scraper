/**
 * Google Trends autocomplete is useful as keyword evidence: it proves that
 * Google presents a term for a seed query, but it is not a search-volume API.
 * Keep that distinction when data is stored or shown to users.
 */

const XSSI_PREFIX = /^\)\]\}',?\s*/;

export function parseGoogleTrendsSuggestions(raw) {
  const text = String(raw ?? '').replace(XSSI_PREFIX, '').trim();
  if (!text) return [];
  const json = JSON.parse(text);
  const topics = json?.default?.topics ?? json?.topics ?? [];
  if (!Array.isArray(topics)) return [];

  const seen = new Set();
  return topics
    .map((topic, index) => ({
      keyword: String(topic?.title ?? topic?.query ?? '').replace(/\s+/g, ' ').trim(),
      type: String(topic?.type ?? 'ข้อความค้นหา').trim(),
      rank: index + 1,
    }))
    .filter((item) => {
      const key = item.keyword.toLocaleLowerCase('th-TH');
      if (!item.keyword || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function pickRelevantSuggestions(suggestions, { include = [], exclude = [], limit = 6 } = {}) {
  const allowed = include.map((x) => String(x).toLocaleLowerCase('th-TH')).filter(Boolean);
  const blocked = exclude.map((x) => String(x).toLocaleLowerCase('th-TH')).filter(Boolean);
  return suggestions
    .filter(({ keyword }) => {
      const value = keyword.toLocaleLowerCase('th-TH');
      return !blocked.some((term) => value.includes(term))
        && (allowed.length === 0 || allowed.some((term) => value.includes(term)));
    })
    .slice(0, limit);
}

export async function fetchGoogleTrendsSuggestions(query, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const seed = String(query ?? '').replace(/\s+/g, ' ').trim();
  if (!seed) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`https://trends.google.com/trends/api/autocomplete/${encodeURIComponent(seed)}`);
    url.searchParams.set('hl', 'th');
    url.searchParams.set('geo', 'TH');
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'SO-Autopost-TrendAgent/1.0' },
    });
    if (!response.ok) throw new Error(`Google Trends HTTP ${response.status}`);
    return parseGoogleTrendsSuggestions(await response.text());
  } finally {
    clearTimeout(timer);
  }
}
