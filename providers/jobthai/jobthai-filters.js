import { sleep } from '../../core/env.js';

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '' && v !== 'ไม่ระบุ';
}

function createReport() {
  return { applied: [], skipped: [], errors: [] };
}

function recordApplied(report, field, value, selector) {
  report.applied.push({ field, value: String(value), status: 'success', selector });
}

function recordSkipped(report, field, value, reason = 'empty') {
  report.skipped.push({ field, value: String(value ?? ''), status: reason });
}

function parseNumber(text) {
  const digits = String(text ?? '').replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : NaN;
}

function mapEducationValue(text) {
  const t = String(text ?? '').toLowerCase();
  if (!hasValue(t)) return '';
  if (/โท|master|mba/i.test(t)) return '2';
  if (/เอก|doctoral|ph\.?d/i.test(t)) return '2';
  if (/ตรี|bachelor|ป\.?ว\.?ท/i.test(t)) return '3';
  if (/ม\.6|ปวส|อนุปริญญา|ต่ำกว่า|ม\.3|ม\.1/i.test(t)) return '4';
  return '3';
}

function mapExperienceValue(text) {
  const years = parseNumber(text);
  if (!Number.isFinite(years)) {
    const t = String(text ?? '');
    if (/มากกว่า\s*10|10\s*ปี/i.test(t)) return '5';
    if (/5\s*[-–]?\s*10/i.test(t)) return '4';
    if (/3\s*[-–]?\s*5/i.test(t)) return '3';
    if (/1\s*[-–]?\s*3/i.test(t)) return '2';
    if (/0\s*[-–]?\s*1|ไม่มี|fresh/i.test(t)) return '1';
    return '';
  }
  if (years > 10) return '5';
  if (years >= 5) return '4';
  if (years >= 3) return '3';
  if (years >= 1) return '2';
  return '1';
}

function mapSalaryValue(salaryMin, salaryMax) {
  const min = parseNumber(salaryMin);
  const max = parseNumber(salaryMax);
  const ref = Number.isFinite(max) ? max : Number.isFinite(min) ? min : NaN;
  if (!Number.isFinite(ref)) return '';
  if (ref <= 10_000) return '1';
  if (ref <= 15_000) return '2';
  if (ref <= 20_000) return '3';
  if (ref <= 30_000) return '4';
  if (ref <= 50_000) return '5';
  if (ref <= 100_000) return '6';
  return '7';
}

function mapAgeValue(ageMin, ageMax) {
  const min = parseNumber(ageMin);
  const max = parseNumber(ageMax);
  const ref = Number.isFinite(min) ? min : Number.isFinite(max) ? max : NaN;
  if (!Number.isFinite(ref)) return '';
  if (ref < 20) return '1';
  if (ref <= 25) return '2';
  if (ref <= 30) return '3';
  if (ref <= 35) return '4';
  return '5';
}

function mapGenderValue(gender) {
  if (gender === 'ชาย') return 'M';
  if (gender === 'หญิง') return 'F';
  return '';
}

async function selectOptionByLabel(page, selector, labelText) {
  const select = page.locator(selector).first();
  if ((await select.count()) === 0) return false;
  const wanted = String(labelText).trim();
  const matched = await select.evaluate((el, wantedText) => {
    const options = [...el.options];
    const hit =
      options.find((o) => o.textContent.trim() === wantedText) ||
      options.find((o) => o.textContent.includes(wantedText)) ||
      options.find((o) => wantedText.includes(o.textContent.trim()));
    if (!hit) return '';
    el.value = hit.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return hit.value;
  }, wanted);
  return Boolean(matched);
}

async function fillField(page, selector, value, scope = '#advanced') {
  const selectors = selector.split(',').map((s) => s.trim());
  for (const single of selectors) {
    const field = scope === 'body'
      ? page.locator(single).first()
      : page.locator(`${scope} ${single}`).first();
    if ((await field.count()) === 0) continue;
    await field.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await field.isVisible().catch(() => false))) continue;
    const tag = await field.evaluate((el) => el.tagName);
    if (tag === 'SELECT') {
      await field.selectOption(String(value));
    } else {
      await field.fill(String(value));
    }
    return true;
  }
  return false;
}

export async function ensureAdvancedSearchTab(page) {
  const positionField = page.locator('#advanced #position_field, #position_field').first();
  if (await positionField.isVisible().catch(() => false)) return true;

  await page.evaluate(() => {
    const search = document.getElementById('search');
    const advanced = document.getElementById('advanced');
    if (search) search.style.display = 'none';
    if (advanced) {
      advanced.style.display = 'block';
      advanced.style.visibility = 'visible';
    }
    const categories = document.getElementById('findResume-text-searchCategories');
    if (categories) categories.style.marginTop = '760px';
  });
  await sleep(1000);

  return positionField.isVisible().catch(() => false);
}

export async function applyJobThaiFilters(page, criteria) {
  const report = createReport();
  const onListPage = /resume_list\.php/i.test(page.url());

  if (!onListPage) {
    const ready = await ensureAdvancedSearchTab(page);
    if (!ready) {
      report.errors.push({ field: 'advanced_tab', value: '', status: 'error', message: 'Advanced search tab not visible' });
      throw new Error('JobThai advanced search tab not ready');
    }
  }

  const scope = onListPage ? 'body' : '#advanced';

  if (hasValue(criteria.position)) {
    const ok = await fillField(page, '#position_field', criteria.position, scope);
    if (ok) recordApplied(report, 'position', criteria.position, `${scope} #position_field`);
    else recordSkipped(report, 'position', criteria.position, 'selector_not_found');
  }

  if (hasValue(criteria.keyword)) {
    const ok = await fillField(page, '#advKeyWord', criteria.keyword, scope);
    if (ok) recordApplied(report, 'keyword', criteria.keyword, '#advKeyWord');
    else recordSkipped(report, 'keyword', criteria.keyword, 'selector_not_found');
  }

  if (hasValue(criteria.province)) {
    const regionSelector = scope === 'body' ? '#region_adv' : `${scope} #region_adv`;
    const ok = await selectOptionByLabel(page, regionSelector, criteria.province);
    if (ok) recordApplied(report, 'province', criteria.province, '#region_adv');
    else recordSkipped(report, 'province', criteria.province, 'option_not_found');
  }

  const salaryValue = mapSalaryValue(criteria.salaryMin, criteria.salaryMax);
  if (salaryValue) {
    const ok = await fillField(page, '#salary_field, #salary_box', salaryValue, scope);
    if (ok) recordApplied(report, 'salary', salaryValue, '#salary_field');
    else recordSkipped(report, 'salary', salaryValue, 'selector_not_found');
  }

  const ageValue = mapAgeValue(criteria.ageMin, criteria.ageMax);
  if (ageValue) {
    const ok = await fillField(page, '#age_adv', ageValue, scope);
    if (ok) recordApplied(report, 'age', ageValue, '#age_adv');
    else recordSkipped(report, 'age', ageValue, 'selector_not_found');
  }

  const genderValue = mapGenderValue(criteria.gender);
  if (genderValue) {
    const ok = await fillField(page, '#gender_field', genderValue, scope);
    if (ok) recordApplied(report, 'gender', criteria.gender, '#gender_field');
    else recordSkipped(report, 'gender', criteria.gender, 'selector_not_found');
  }

  const educationValue = mapEducationValue(criteria.education);
  if (educationValue) {
    const ok = await fillField(page, '#level_adv', educationValue, scope);
    if (ok) recordApplied(report, 'education', criteria.education, '#level_adv');
    else recordSkipped(report, 'education', criteria.education, 'selector_not_found');
  }

  const experienceValue = mapExperienceValue(criteria.experience);
  if (experienceValue) {
    const ok = await fillField(page, '#experience_field, #exp_box', experienceValue, scope);
    if (ok) recordApplied(report, 'experience', criteria.experience, '#experience_field');
    else recordSkipped(report, 'experience', criteria.experience, 'selector_not_found');
  }

  console.log(
    `JobThai filters: ${report.applied.length} applied, ${report.skipped.length} skipped, ${report.errors.length} errors`,
  );
  return report;
}

export async function clickJobThaiSearchButton(page) {
  const btn = page.locator('#buttonadvsearch').first();
  if ((await btn.count()) === 0) {
    throw new Error('JobThai search button #buttonadvsearch not found');
  }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click();
  await page.waitForURL(/resume_list\.php/, { timeout: 90_000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(2500);
}

export async function waitForJobThaiSearchResults(page) {
  await page
    .locator('#resumeList-text-notFoundResume, [onclick*="window.open"][onclick*="/resume/"]')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
    .catch(() => {});
  await sleep(1000);
}
