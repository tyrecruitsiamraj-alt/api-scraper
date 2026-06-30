/**
 * JobBKK filter automation with per-field apply report.
 * Premium page (/resumes/premium) uses popover/autocomplete UI.
 */

import {
  applyPremiumSearchFilters,
  ensurePremiumSearchPage,
  firstTrulyVisibleLocator,
  waitForPremiumSearchResults,
} from './resume-premium-search.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '' && v !== 'ไม่ระบุ';
}

function createReport() {
  return { applied: [], skipped: [], errors: [] };
}

function recordApplied(report, field, value, selector, status = 'success') {
  report.applied.push({ field, value: String(value), status, selector });
}

function recordSkipped(report, field, value, reason = 'selector_not_found') {
  report.skipped.push({ field, value: String(value ?? ''), status: reason });
}

function recordError(report, field, value, message) {
  report.errors.push({ field, value: String(value ?? ''), status: 'error', message });
}

function mapCriteriaToPremium(criteria) {
  const drivingLicense =
    criteria.drivingLicense === 'มี'
      ? 'รถยนต์, รถจักรยานยนต์'
      : criteria.drivingLicense === 'ไม่มี'
        ? ''
        : criteria.drivingLicense !== 'ไม่ระบุ'
          ? criteria.drivingLicense
          : '';

  return {
    position: criteria.position,
    keyword: criteria.keyword,
    areas: hasValue(criteria.province) ? [criteria.province] : [],
    salaryMin: criteria.salaryMin,
    salaryMax: criteria.salaryMax,
    ageMin: criteria.ageMin,
    ageMax: criteria.ageMax,
    gender: criteria.gender !== 'ไม่ระบุ' ? criteria.gender : '',
    education: criteria.education,
    experience: criteria.experience,
    availableStart: criteria.availableStart !== 'ไม่ระบุ' ? criteria.availableStart : '',
    drivingLicense,
  };
}

function premiumFieldMap() {
  return {
    position: { selector: '#autoComplete-position' },
    keyword: { selector: '#autoComplete-keyword' },
    province: { selector: 'popover:all-workplaces', field: 'areas' },
    salaryMin: { selector: 'popover:salary#issalarymin' },
    salaryMax: { selector: 'popover:salary#issalarymax' },
    ageMin: { selector: 'popover:age#isagemin' },
    ageMax: { selector: 'popover:age#isagemax' },
    gender: { selector: 'popover:sex' },
    education: { selector: 'popover:educational-qualification' },
    experience: { selector: 'popover:experience' },
    availableStart: { selector: 'popover:date' },
    drivingLicense: { selector: 'popover:license' },
  };
}

function recordPremiumResults(report, criteria, premium, results) {
  const fields = premiumFieldMap();

  for (const [field, meta] of Object.entries(fields)) {
    const criteriaValue = field === 'province' ? criteria.province : criteria[field];
    if (!hasValue(criteriaValue)) continue;

    const resultKey = meta.field ?? field;
    const ok = Boolean(results?.[resultKey]);
    if (ok) {
      recordApplied(report, field, criteriaValue, meta.selector, 'success_premium');
    } else {
      recordSkipped(report, field, criteriaValue, 'premium_apply_failed');
    }
  }
}

export async function applyJobBkkFilters(page, criteria, premiumUrl = 'https://www.jobbkk.com/resumes/premium') {
  const report = createReport();
  await page.getByRole('button', { name: 'ยอมรับ' }).click({ timeout: 2000 }).catch(() => {});
  await sleep(800);

  const onPremium = await ensurePremiumSearchPage(page, premiumUrl);
  if (!onPremium) {
    recordError(report, 'premium_page', premiumUrl, 'Could not load Resume Search Talent premium UI (#autoComplete-position)');
    throw new Error('Resume Search Talent premium page not ready. Check login and URL.');
  }

  console.log('Premium search UI detected — applying popover/autocomplete filters...');
  const premium = mapCriteriaToPremium(criteria);

  let results = {};
  try {
    results = await applyPremiumSearchFilters(page, premium);
    recordPremiumResults(report, criteria, premium, results);
  } catch (err) {
    recordError(report, 'premium_filters', '', err.message);
    throw err;
  }

  const wantsPosition = hasValue(criteria.position);
  const wantsKeyword = hasValue(criteria.keyword);
  const positionOk = !wantsPosition || report.applied.some((r) => r.field === 'position');
  const keywordOk = !wantsKeyword || report.applied.some((r) => r.field === 'keyword');

  if ((wantsPosition || wantsKeyword) && !positionOk && !keywordOk) {
    throw new Error('Could not apply position or keyword filters on JobBKK premium page.');
  }

  console.log(`Filter apply: ${report.applied.length} applied, ${report.skipped.length} skipped, ${report.errors.length} errors`);
  return report;
}

export async function clickSearchButton(page) {
  const desktopBtn = await firstTrulyVisibleLocator(page, 'button#btn-search');
  if (desktopBtn) {
    await desktopBtn.scrollIntoViewIfNeeded().catch(() => {});
    await desktopBtn.click();
    console.log('Clicked button#btn-search');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(2500);
    return 'button#btn-search';
  }

  const textBtn = page.getByRole('button', { name: 'ค้นหา', exact: false }).first();
  if ((await textBtn.count()) > 0 && (await textBtn.isVisible().catch(() => false))) {
    await textBtn.click();
    await sleep(2500);
    return 'button:text=ค้นหา';
  }

  for (const sel of ['input[type="submit"]', 'button[type="submit"]']) {
    const el = await firstTrulyVisibleLocator(page, sel);
    if (el) {
      await el.click();
      await sleep(1200);
      return sel;
    }
  }

  console.warn('Search button not found; pressing Enter.');
  await page.keyboard.press('Enter');
  await sleep(1200);
  return 'Enter';
}

export async function waitForSearchResults(page, timeoutMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cards = await page.locator(
      'article.bg-resume a.read-profile[data-id], article.bg-resume a.clickShowDetail[data-id]',
    ).count();
    if (cards > 0) {
      console.log(`Search results ready: ${cards} resume cards visible`);
      return cards;
    }
    await sleep(800);
  }

  const count = await waitForPremiumSearchResults(page, 5000);
  return count ?? 0;
}
