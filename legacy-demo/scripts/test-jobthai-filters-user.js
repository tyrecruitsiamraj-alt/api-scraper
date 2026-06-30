import 'dotenv/config';
import { chromium } from 'playwright';
import { loadJobThaiConfig, prepareSession, applyFilters } from '../providers/jobthai/scrape-impl.js';

const criteria = {
  position: 'จัดซื้อ',
  keyword: '',
  maxCandidates: 15,
  province: 'กรุงเทพมหานคร',
  salaryMin: '20000',
  salaryMax: '25000',
  ageMin: '30',
  ageMax: '31',
  gender: 'หญิง',
  education: 'ปริญญาตรี',
  experience: '2',
  availableStart: 'ทันที',
  drivingLicense: 'ไม่ระบุ',
};

async function main() {
  const config = loadJobThaiConfig();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await prepareSession(page, config, false);
    const report = await applyFilters(page, criteria, config);
    console.log('OK', report);
    console.log('URL', page.url());
  } catch (e) {
    console.error('FAIL', e.message);
    console.log('URL at fail', page.url());
  }
  await browser.close();
}

main();
