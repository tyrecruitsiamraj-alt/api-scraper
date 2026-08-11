import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { query } from '../db/pool.js';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const clamp = (value, max = 2_147_483_647) => Math.max(0, Math.min(max, Number(value) || 0));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseGoogleSuggestResponse(raw) {
  const text = String(raw ?? '').replace(/^\)\]\}',?\s*/, '').trim();
  try {
    const json = JSON.parse(text);
    const list = Array.isArray(json?.[1]) ? json[1] : [];
    return [...new Set(list.map((item) => clean(Array.isArray(item) ? item[0] : item)).filter(Boolean))].slice(0, 8);
  } catch {
    return [];
  }
}

export function parseEngagementText(raw) {
  const text = clean(raw);
  const number = (value) => {
    const match = clean(value).match(/([\d,.]+)\s*([kKmM]|พัน|หมื่น|แสน|ล้าน)?/);
    if (!match) return 0;
    let n = Number(match[1].replace(/,/g, '')) || 0;
    const unit = (match[2] || '').toLowerCase();
    if (unit === 'k' || unit === 'พัน') n *= 1_000;
    else if (unit === 'm' || unit === 'ล้าน') n *= 1_000_000;
    else if (unit === 'หมื่น') n *= 10_000;
    else if (unit === 'แสน') n *= 100_000;
    return Math.round(n);
  };
  const first = (...patterns) => patterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean) ?? '';
  return {
    reactions: number(first(/(?:reactions?|ถูกใจ|คนที่แสดงความรู้สึก)\s*([\d,.]+\s*(?:[kKmM]|พัน|หมื่น|แสน|ล้าน)?)/i, /([\d,.]+\s*(?:[kKmM]|พัน|หมื่น|แสน|ล้าน)?)\s*(?:reactions?|ถูกใจ|คนที่แสดงความรู้สึก)/i)),
    comments: number(first(/(?:comments?|ความคิดเห็น)\s*([\d,.]+\s*(?:[kKmM]|พัน|หมื่น|แสน|ล้าน)?)/i, /([\d,.]+\s*(?:[kKmM]|พัน|หมื่น|แสน|ล้าน)?)\s*(?:comments?|ความคิดเห็น)/i)),
    shares: number(first(/(?:shares?|การแชร์|แชร์)\s*([\d,.]+\s*(?:[kKmM]|พัน|หมื่น|แสน|ล้าน)?)/i, /([\d,.]+\s*(?:[kKmM]|พัน|หมื่น|แสน|ล้าน)?)\s*(?:shares?|การแชร์|แชร์)/i)),
  };
}

function evidenceKey(...parts) {
  return createHash('sha256').update(parts.map(clean).join('|')).digest('hex').slice(0, 32);
}

function findFacebookSession() {
  const configured = clean(process.env.FB_SESSION_PATH);
  if (configured && fs.existsSync(configured)) return configured;
  const directory = path.join(process.cwd(), 'autopost', '.auth');
  if (!fs.existsSync(directory)) return null;
  return fs.readdirSync(directory)
    .filter((name) => /^facebook-.*\.json$/i.test(name))
    .map((name) => ({ file: path.join(directory, name), modified: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified)[0]?.file ?? null;
}

async function saveEvidence(campaignId, evidence) {
  await query(
    `INSERT INTO campaign_market_research
       (campaign_id, evidence_key, source_type, source_url, query_term, source_name,
        published_at, reactions, comments, shares, findings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (campaign_id, evidence_key) DO UPDATE SET
       reactions=EXCLUDED.reactions, comments=EXCLUDED.comments, shares=EXCLUDED.shares,
       findings=EXCLUDED.findings, collected_at=now()`,
    [campaignId, evidence.key, evidence.sourceType, evidence.url ?? null, evidence.queryTerm ?? null,
      evidence.sourceName ?? null, evidence.publishedAt ?? null, clamp(evidence.reactions),
      clamp(evidence.comments), clamp(evidence.shares), JSON.stringify(evidence.findings ?? {})],
  );
}

async function collectGoogleSuggestions(campaignId, position) {
  const endpoint = new URL('https://suggestqueries.google.com/complete/search');
  endpoint.searchParams.set('client', 'firefox');
  endpoint.searchParams.set('hl', 'th');
  endpoint.searchParams.set('gl', 'th');
  endpoint.searchParams.set('q', position);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Google suggestions HTTP ${response.status}`);
    const suggestions = parseGoogleSuggestResponse(await response.text()).filter((item) => item !== position).slice(0, 6);
    for (const suggestion of suggestions) {
      await saveEvidence(campaignId, {
        key: evidenceKey('google', position, suggestion), sourceType: 'google_trends',
        url: `https://trends.google.co.th/explore?geo=TH&q=${encodeURIComponent(suggestion)}`,
        queryTerm: suggestion, sourceName: 'Google search suggestions (TH)',
        findings: { seed: position, suggested_query: suggestion },
      });
    }
    return suggestions;
  } finally {
    clearTimeout(timer);
  }
}

async function collectFacebookPosts(campaignId, position) {
  const sessionFile = findFacebookSession();
  if (!sessionFile) return { posts: [], reason: 'ไม่พบ Facebook session' };
  const { rows: groups } = await query(
    `SELECT fb_group_id, COALESCE(url, 'https://www.facebook.com/groups/' || fb_group_id) AS url
       FROM content_group_sources WHERE active=true
      ORDER BY last_scanned_at NULLS FIRST, created_at LIMIT $1`,
    [Math.max(1, Math.min(8, Number(process.env.RESEARCH_MAX_GROUPS) || 4))],
  );
  if (!groups.length) return { posts: [], reason: 'ยังไม่ได้ตั้งกลุ่ม Facebook สำหรับสำรวจ' };

  const headless = process.env.RESEARCH_HEADLESS !== '0';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: sessionFile, locale: 'th-TH', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const posts = [];
  const roleTerms = [...new Set([position, ...position.split(/\s+/)])].filter((term) => term.length >= 3);
  try {
    for (const group of groups) {
      try {
        await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await sleep(2_500);
        if (/login|checkpoint|login\.php/i.test(page.url())) return { posts, reason: 'Facebook session ต้องยืนยันตัวตน' };
        for (let round = 0; round < 2; round += 1) {
          await page.mouse.wheel(0, 1_200).catch(() => {});
          await sleep(1_200);
        }
        const found = await page.evaluate((terms) => Array.from(document.querySelectorAll('[role="article"]')).map((article) => {
          const text = (article.innerText || '').replace(/\s+/g, ' ').trim();
          const link = Array.from(article.querySelectorAll('a[href]')).map((a) => a.href)
            .find((href) => /facebook\.com\/(?:groups\/[^/]+\/)?(?:posts|permalink)\//i.test(href)) || '';
          return { text: text.slice(0, 1200), link };
        }).filter((item) => item.text && terms.some((term) => item.text.toLowerCase().includes(term.toLowerCase()))).slice(0, 8), roleTerms);
        for (const item of found) {
          const metrics = parseEngagementText(item.text);
          const post = { ...item, ...metrics, groupId: group.fb_group_id, groupUrl: group.url };
          posts.push(post);
          await saveEvidence(campaignId, {
            key: evidenceKey('facebook', item.link || group.url, item.text.slice(0, 160)),
            sourceType: 'facebook_post', url: item.link || group.url, queryTerm: position,
            sourceName: `Facebook group ${group.fb_group_id}`, ...metrics,
            findings: { excerpt: item.text.slice(0, 500), engagement_is_raw_signal: true },
          });
        }
        await query(`UPDATE content_group_sources SET last_scanned_at=now() WHERE fb_group_id=$1`, [group.fb_group_id]);
      } catch (error) {
        console.warn(`  [research] Facebook group ${group.fb_group_id}: ${error.message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { posts, reason: '' };
}

async function collectOwnedFacebookHistory(campaignId, position) {
  const schema = clean(process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper');
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(schema)) return [];
  const AP = `"${schema}"`;
  const terms = [...new Set([position, ...position.split(/\s+/).filter((term) => term.length >= 4)])];
  const patterns = terms.map((term) => `%${term}%`);
  let rows = [];
  try {
    ({ rows } = await query(
      `SELECT post_link, job_title, group_name, created_at,
              COALESCE(reactions,0) AS reactions, COALESCE(comment_count,0) AS comments,
              COALESCE(shares,0) AS shares
         FROM ${AP}.post_logs
        WHERE job_title ILIKE ANY($1::text[]) AND post_link IS NOT NULL
        ORDER BY created_at DESC LIMIT 12`,
      [patterns],
    ));
  } catch {
    return [];
  }
  for (const row of rows) {
    await saveEvidence(campaignId, {
      key: evidenceKey('owned-facebook', row.post_link), sourceType: 'facebook_post',
      url: row.post_link, queryTerm: position, sourceName: row.group_name || 'โพสต์เดิมของระบบ',
      publishedAt: row.created_at, reactions: row.reactions, comments: row.comments, shares: row.shares,
      findings: { owned_post: true, job_title: row.job_title, group_name: row.group_name, engagement_is_raw_signal: true },
    });
  }
  return rows;
}

export async function loadCampaignMarketResearch(campaignId) {
  const { rows } = await query(
    `SELECT source_type, source_url, query_term, source_name, published_at,
            COALESCE(reactions,0) AS reactions, COALESCE(comments,0) AS comments,
            COALESCE(shares,0) AS shares, findings, collected_at
       FROM campaign_market_research WHERE campaign_id=$1
      ORDER BY (COALESCE(comments,0)*3 + COALESCE(shares,0)*2 + COALESCE(reactions,0)) DESC,
               collected_at DESC LIMIT 20`,
    [campaignId],
  );
  return rows;
}

export async function collectCampaignMarketResearch({ campaignId, facts }) {
  const position = clean(facts?.position);
  if (!campaignId || !position) return { keywords: [], facebookPosts: [], evidence: [], warnings: ['ไม่มีตำแหน่งสำหรับสำรวจ'] };
  const warnings = [];
  if (process.env.RESEARCH_LIVE_ENABLED === '0') {
    const evidence = await loadCampaignMarketResearch(campaignId).catch(() => []);
    return { keywords: evidence.filter((item) => item.source_type === 'google_trends').map((item) => item.query_term).filter(Boolean), facebookPosts: [], evidence, warnings: ['ปิดการสำรวจสดด้วย RESEARCH_LIVE_ENABLED=0'] };
  }
  const keywords = await collectGoogleSuggestions(campaignId, position).catch((error) => {
    warnings.push(`Google: ${error.message}`); return [];
  });
  const ownedPosts = await collectOwnedFacebookHistory(campaignId, position).catch(() => []);
  const facebook = await collectFacebookPosts(campaignId, position).catch((error) => ({ posts: [], reason: error.message }));
  if (facebook.reason) warnings.push(`Facebook: ${facebook.reason}`);
  const evidence = await loadCampaignMarketResearch(campaignId).catch(() => []);
  return { keywords, facebookPosts: [...ownedPosts, ...facebook.posts], evidence, warnings };
}
