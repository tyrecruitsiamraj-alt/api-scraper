import 'dotenv/config';
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const LOGIN_URL =
  'https://auth.jobthai.com/companies/login?client_id=NlnJk4E3pLR2TBGu930OQXJAiy9mJ7sWpZ8w8RAq&response_type=code&redirect_uri=https%3A%2F%2Fwww.jobthai.com%2Fcallback&scope=login&l=th&type=company';

const LIST_URL =
  'https://www3.jobthai.com/findresume/resume_list.php?l=th&search=Y&search-section=advance-search&StepSearch=2&typesearch=Adv&jobtype=Ga&region=0601&level=1&time=7&KWType=2';

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('#login-form-username').fill(process.env.JOBTHAI_USERNAME || '');
  await page.locator('#login-form-password').fill(process.env.JOBTHAI_PASSWORD || '');
  await page.locator('#login_company').click();
  await page.waitForURL(/jobthai\.com/, { timeout: 120_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await login(page);
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(5000);

  const notFound = await page.locator('#resumeList-text-notFoundResume').isVisible().catch(() => false);
  console.log('NOT FOUND:', notFound);

  const links = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href;
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      if (/resume_detail|view_resume|resume_view|openResume|resumeid=/i.test(href) || /resume_detail|view_resume/i.test(a.getAttribute('onclick') || '')) {
        out.push({ href, text: text.slice(0, 60), onclick: (a.getAttribute('onclick') || '').slice(0, 100) });
      }
    }
    for (const el of document.querySelectorAll('[onclick]')) {
      const onclick = el.getAttribute('onclick') || '';
      if (/resume|view|detail|open/i.test(onclick) && !out.some((o) => o.onclick === onclick)) {
        out.push({ href: '', text: (el.innerText || '').slice(0, 40), onclick });
      }
    }
    return out.slice(0, 50);
  });
  console.log('LINKS:', JSON.stringify(links, null, 2));

  writeFileSync('output/jobthai-resume-list3.html', await page.content());

  if (links[0]?.href) {
    await page.goto(links[0].href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    writeFileSync('output/jobthai-resume-detail3.html', await page.content());
    console.log('DETAIL URL:', page.url());
    const bodyText = await page.locator('body').innerText();
    console.log('BODY PREVIEW:', bodyText.slice(0, 1500));
  }

  await browser.close();
}

main().catch(console.error);
