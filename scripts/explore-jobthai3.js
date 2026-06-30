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
  await page.waitForTimeout(3000);
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await login(page);

  await page.locator('#findResume-image-tabAdvancedActive, #findResume-image-tabAdvanced').first().click().catch(async () => {
    await page.locator('[onclick*="tabsearch(\'advanced\')"]').first().click();
  });
  await page.waitForTimeout(1000);

  await page.locator('#position_field').fill('นักจัดซื้อ');
  await page.locator('#buttonadvsearch').click();
  await page.waitForURL(/resume_list\.php/, { timeout: 120_000 });
  await page.waitForTimeout(3000);
  console.log('LIST URL:', page.url());

  const links = await page.locator('a[href*="resume"]').evaluateAll((els) =>
    els.slice(0, 30).map((el) => ({ href: el.href, text: el.innerText?.replace(/\s+/g, ' ').trim().slice(0, 60) })),
  );
  console.log('LINKS:', JSON.stringify(links, null, 2));

  writeFileSync('output/jobthai-resume-list.html', await page.content());
  await page.screenshot({ path: 'output/jobthai-resume-list.png', fullPage: true });

  if (links.length > 0) {
    const detailUrl = links.find((l) => /view|detail|resume/i.test(l.href) && !/resume_list/i.test(l.href))?.href;
    if (detailUrl) {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForTimeout(3000);
      console.log('DETAIL URL:', page.url());
      writeFileSync('output/jobthai-resume-detail.html', await page.content());
      await page.screenshot({ path: 'output/jobthai-resume-detail.png', fullPage: true });
    }
  }

  await browser.close();
}

main().catch(console.error);
