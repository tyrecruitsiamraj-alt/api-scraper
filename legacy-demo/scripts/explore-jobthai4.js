import 'dotenv/config';
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const LOGIN_URL =
  'https://auth.jobthai.com/companies/login?client_id=NlnJk4E3pLR2TBGu930OQXJAiy9mJ7sWpZ8w8RAq&response_type=code&redirect_uri=https%3A%2F%2Fwww.jobthai.com%2Fcallback&scope=login&l=th&type=company';

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('#login-form-username').fill(process.env.JOBTHAI_USERNAME || '');
  await page.locator('#login-form-password').fill(process.env.JOBTHAI_PASSWORD || '');
  await page.locator('#login_company').click();
  await page.waitForURL(/jobthai\.com/, { timeout: 120_000 });
  await page.waitForTimeout(2000);
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await login(page);

  await page.locator('#findResume-image-tabAdvancedActive, #findResume-image-tabAdvanced').first().click().catch(async () => {
    await page.locator('[onclick*="tabsearch(\'advanced\')"]').first().click();
  });
  await page.waitForTimeout(1000);

  await page.locator('#jobtype_adv, select[name="jobtype"]').first().selectOption('Ga');
  await page.locator('#region_adv').selectOption('0601');
  await page.locator('#buttonadvsearch').click();
  await page.waitForURL(/resume_list\.php/, { timeout: 120_000 });
  await page.waitForTimeout(4000);

  const notFound = await page.locator('#resumeList-text-notFoundResume').isVisible().catch(() => false);
  console.log('NOT FOUND:', notFound, 'URL:', page.url());

  const allLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a, [onclick], tr, div')].slice(0, 500).map((el) => {
      const onclick = el.getAttribute?.('onclick') || '';
      const href = el.href || '';
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!onclick && !href) return null;
      if (!/resume|view|detail|open/i.test(`${href} ${onclick}`)) return null;
      return { tag: el.tagName, href, onclick: onclick.slice(0, 120), text };
    }).filter(Boolean),
  );
  console.log('RESUME-ish:', JSON.stringify(allLinks.slice(0, 40), null, 2));

  const imgs = await page.locator('img[src*="resume"], img[src*="photo"], img[src*="profile"]').evaluateAll((els) =>
    els.slice(0, 20).map((el) => ({ src: el.src, parent: el.closest('a')?.href || el.closest('[onclick]')?.getAttribute('onclick') })),
  );
  console.log('IMGS:', JSON.stringify(imgs, null, 2));

  writeFileSync('output/jobthai-resume-list2.html', await page.content());

  const detailCandidate = allLinks.find((l) => l.href && !/resume_list|findresume\.php/i.test(l.href));
  if (detailCandidate?.href) {
    await page.goto(detailCandidate.href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    writeFileSync('output/jobthai-resume-detail2.html', await page.content());
    console.log('DETAIL:', page.url());
  }

  await browser.close();
}

main().catch(console.error);
