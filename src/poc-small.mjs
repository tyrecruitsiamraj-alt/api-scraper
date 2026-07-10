import { closePool, query } from './db/pool.js';
import { getConnector } from './db/repositories.js';
import { loadRuntime } from './config.js';
import { buildSearchUrl, searchResumeIds } from './providers/jobthai/client.js';
import { getJobthaiSession } from './providers/jobthai/session.js';
import { getJobbkkSession, logoutJobbkk } from './providers/jobbkk/session.js';
import { browserSearchResumeIds } from './providers/jobbkk/browser-search.js';
import { fetchResumeHtml, resumeDetailUrl } from './providers/jobbkk/client.js';
import { parseResumeHtml } from './providers/jobbkk/parser.js';

const MAX = 2;

function hr(title) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

async function pocJobThai(connector) {
  hr('POC 1/2 — JobThai (HTTP + filters)');
  const criteria = {
    position: 'บัญชี',
    keyword: '',
    province: 'กรุงเทพมหานคร',
    gender: 'หญิง',
    education: 'ปริญญาตรี',
    salaryMin: '15000',
    salaryMax: '20000',
    ageMin: '25',
    ageMax: '30',
    maxCandidates: MAX,
  };
  console.log('URL:', buildSearchUrl(criteria));

  const runtime = loadRuntime();
  const sess = await getJobthaiSession({
    headless: true,
    username: connector.username,
    password: connector.password(),
    storageState: connector.session_state ?? undefined,
  });
  const res = await searchResumeIds(sess, criteria, runtime);
  console.log(`Search: ${res.ids.length} id(s) in ${res.pagesScanned} page(s) →`, res.ids);
  await sess.browser.close();
  return res.ids.length > 0;
}

async function pocJobBkk(connector) {
  hr('POC 2/2 — JobBKK (browser login + premium search)');
  const criteria = {
    position: 'จัดซื้อ',
    keyword: '',
    province: 'กรุงเทพมหานคร',
    gender: 'ชาย',
    education: 'ปริญญาตรี',
    salaryMin: '20000',
    salaryMax: '25000',
    ageMin: '25',
    ageMax: '30',
    maxCandidates: MAX,
  };

  const runtime = loadRuntime();
  const sess = await getJobbkkSession({
    headless: false,
    username: connector.username,
    password: connector.password(),
  });
  const search = await browserSearchResumeIds(sess, criteria, runtime);
  console.log(`Search: ${search.ids.length} id(s) in ${search.pagesScanned} page(s) →`, search.ids.slice(0, MAX));

  if (search.ids[0]) {
    const id = search.ids[0];
    const html = await fetchResumeHtml(sess, id, runtime);
    const parsed = parseResumeHtml(html, { sourceUrl: resumeDetailUrl(id), index: 1, focusPosition: criteria.position });
    const masked = !parsed.phone || /x{3,}/i.test(parsed.phone);
    console.log(`Sample #1: ${parsed.full_name || '(no name)'} | ☎ ${parsed.phone || '-'} | masked=${masked}`);
  }

  await logoutJobbkk(sess.context, { debug: false });
  await sess.browser.close();
  return search.ids.length > 0;
}

const { rows } = await query(`SELECT id, platform, label FROM connectors WHERE enabled = true ORDER BY platform`);
if (!rows.length) throw new Error('No enabled connectors in DB');

const byPlatform = Object.fromEntries(rows.map((r) => [r.platform, r]));
const results = {};

console.log('Small POC — max', MAX, 'candidates per platform');
console.log('Connectors:', rows.map((r) => `${r.platform}:${r.label}`).join(', '));

if (byPlatform.jobthai) {
  const c = await getConnector(byPlatform.jobthai.id);
  results.jobthai = await pocJobThai(c).catch((e) => {
    console.error('JobThai FAIL:', e.message);
    return false;
  });
} else {
  console.log('\n(skip JobThai — no connector)');
  results.jobthai = null;
}

if (byPlatform.jobbkk) {
  const c = await getConnector(byPlatform.jobbkk.id);
  results.jobbkk = await pocJobBkk(c).catch((e) => {
    console.error('JobBKK FAIL:', e.message);
    return false;
  });
} else {
  console.log('\n(skip JobBKK — no connector)');
  results.jobbkk = null;
}

hr('POC SUMMARY');
for (const [p, ok] of Object.entries(results)) {
  if (ok === null) console.log(`  ${p}: skipped`);
  else console.log(`  ${p}: ${ok ? 'PASS ✓' : 'FAIL ✗'}`);
}

await closePool();
process.exit(Object.values(results).some((v) => v === false) ? 1 : 0);
