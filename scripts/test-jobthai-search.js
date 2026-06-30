import 'dotenv/config';
import { chromium } from 'playwright';
import { loadJobThaiConfig, prepareSession, applyFilters, runSearch, collectResumeLinks } from '../providers/jobthai/scrape-impl.js';

const criteria = {
  position: '',
  keyword: '',
  maxCandidates: 3,
  province: 'กรุงเทพมหานคร',
  salaryMin: '',
  salaryMax: '',
  ageMin: '',
  ageMax: '',
  gender: 'ไม่ระบุ',
  education: '',
  experience: '',
};

async function main() {
  const config = loadJobThaiConfig();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await prepareSession(page, config, false);
  await applyFilters(page, criteria, config);
  await runSearch(page);
  const links = await collectResumeLinks(page, true);
  console.log('FOUND', links.length, 'links');
  if (links[0]) console.log('FIRST', links[0].url);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
