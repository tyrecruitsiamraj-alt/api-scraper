import { chromium } from 'playwright';
import 'dotenv/config';

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
  console.log('URL:', page.url());

  const tabs = await page.locator('[id*="findResume"], [onclick*="tabsearch"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.id, onclick: el.getAttribute('onclick'), tag: el.tagName, text: el.innerText?.slice(0, 30) })),
  );
  console.log('TABS:', JSON.stringify(tabs, null, 2));

  const adv = page.locator('#findResume-image-tabAdvancedActive, [onclick*="tabsearch(\'advanced\')"]');
  if ((await adv.count()) > 0) {
    await adv.first().click();
    await page.waitForTimeout(2000);
  }

  const allInputs = await page.locator('input, select, textarea').evaluateAll((els) =>
    els
      .filter((el) => el.type !== 'hidden')
      .map((el) => ({
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        value: el.value?.slice(0, 30),
      })),
  );
  console.log('VISIBLE FIELDS:', JSON.stringify(allInputs, null, 2));

  const links = await page.locator('a[href*="resume"], a[href*="view"]').evaluateAll((els) =>
    els.slice(0, 20).map((el) => ({ href: el.href, text: el.innerText?.slice(0, 40) })),
  );
  console.log('LINKS:', JSON.stringify(links, null, 2));

  const html = await page.content();
  const fs = await import('fs');
  fs.writeFileSync('output/jobthai-findresume.html', html);
  await page.screenshot({ path: 'output/jobthai-findresume.png', fullPage: true });

  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch(console.error);
