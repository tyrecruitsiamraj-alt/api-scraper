import { chromium } from 'playwright';

const LOGIN_URL =
  'https://auth.jobthai.com/companies/login?client_id=NlnJk4E3pLR2TBGu930OQXJAiy9mJ7sWpZ8w8RAq&response_type=code&redirect_uri=https%3A%2F%2Fwww.jobthai.com%2Fcallback&scope=login&l=th&type=company';

const username = process.env.JOBTHAI_USERNAME || 'siam_raj';
const password = process.env.JOBTHAI_PASSWORD || '';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(3000);

  const inputs = await page.locator('input').evaluateAll((els) =>
    els.map((el) => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      visible: el.offsetParent !== null,
    })),
  );
  console.log('INPUTS:', JSON.stringify(inputs, null, 2));

  const buttons = await page.locator('button, input[type="submit"]').evaluateAll((els) =>
    els.map((el) => ({ tag: el.tagName, type: el.type, text: el.innerText?.slice(0, 50), id: el.id })),
  );
  console.log('BUTTONS:', JSON.stringify(buttons, null, 2));

  if (password) {
    const userField = page.locator('input[type="text"], input[name*="user" i], input[id*="user" i]').first();
    const passField = page.locator('input[type="password"]').first();
    await userField.fill(username);
    await passField.fill(password);
    await page.locator('button:has-text("เข้าสู่ระบบ"), input[type="submit"]').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    console.log('AFTER LOGIN URL:', page.url());

    const findResumeUrl = 'https://www.jobthai.com/findresume/';
    await page.goto(findResumeUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log('FIND RESUME URL:', page.url());

    const adv = page.locator('#findResume-image-tabAdvancedActive, [onclick*="tabsearch"][onclick*="advanced"]');
    console.log('ADV TAB count:', await adv.count());

    const forms = await page.locator('form input, form select, form textarea').evaluateAll((els) =>
      els.slice(0, 40).map((el) => ({
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
      })),
    );
    console.log('FORM FIELDS:', JSON.stringify(forms, null, 2));

    await page.screenshot({ path: 'output/jobthai-explore.png', fullPage: true });
  }

  await page.waitForTimeout(15000);
  await browser.close();
}

main().catch(console.error);
