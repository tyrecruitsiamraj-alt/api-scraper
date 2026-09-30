import { clickWithoutNavigationWait } from '../browser/safe-click.js';
import { ensureLatestUpdatedSort } from '../latest-sort.js';
import {
  dismissJobbkkOverlays,
  firstEditableLocator,
  firstVisibleLocator,
  readResumeResultPool,
  sleep,
  waitForResultChange,
} from '../resume-talent-entry.js';
import { missingRequiredNormalFilters, planTalentNormalFilters, provinceSearchAliases } from '../talent-filter-plan.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function activateNormalMode(page) {
  await dismissJobbkkOverlays(page);
  await sleep(400);
  const mode = await firstVisibleLocator([
    page.getByRole('button', { name: /Normal\s*Search/i }),
    page.getByRole('tab', { name: /Normal\s*Search/i }),
    page.getByText(/^Normal\s*Search$/i),
  ]);
  if (!mode) throw new Error('JOBBKK_SITE_CONTRACT_CHANGED: ไม่พบปุ่ม Normal Search');
  const alreadyActive = await mode.evaluate((element) => (
    element.classList.contains('bg-Primary') && element.classList.contains('text-white')
  )).catch(() => false);
  if (!alreadyActive) await clickWithoutNavigationWait(mode);
  await sleep(500);
}

async function visibleOpenLayer(page) {
  return firstVisibleLocator([
    page.locator('.ant-select-dropdown:visible'),
    page.locator('.ant-tree-select-dropdown:visible'),
    page.locator('[role="listbox"]:visible'),
    page.locator('[role="dialog"]:visible'),
  ]);
}

async function closeOpenLayer(page) {
  const layer = await visibleOpenLayer(page);
  if (!layer) return;
  await page.keyboard.press('Escape').catch(() => {});
  await layer.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
}

async function clickMatchingOption(page, labels) {
  const layer = await visibleOpenLayer(page);
  const scope = layer || page;
  for (const label of labels) {
    const exact = new RegExp(`^${escapeRegExp(label)}$`, 'u');
    const option = await firstVisibleLocator([
      scope.getByRole('option', { name: exact }),
      scope.locator('.ant-select-item-option-content').filter({ hasText: exact }),
      scope.getByText(exact),
    ]);
    if (!option) continue;
    await clickWithoutNavigationWait(option);
    return true;
  }
  return false;
}

async function findChipInput(page, field) {
  const needle = field === 'position' ? 'ค้นหาชื่อตำแหน่งงาน' : 'ค้นหา Keyword';
  const nearby = page.locator('.ant-select, .ant-select-selection-wrap, .ant-form-item').filter({
    hasText: new RegExp(escapeRegExp(needle), 'u'),
  });
  return firstEditableLocator([
    nearby.locator('input.ant-select-selection-search-input, input:not([readonly])'),
    page.locator(`input[placeholder="${needle}"]`),
    page.getByRole('combobox', { name: new RegExp(escapeRegExp(needle), 'u') }),
  ]);
}

async function applyChipField(page, field, terms, report) {
  for (const term of terms) {
    const input = await findChipInput(page, field);
    if (!input) {
      if (!report.skipped.includes(field)) report.skipped.push(field);
      return;
    }
    await clickWithoutNavigationWait(input);
    await input.fill(term);
    await sleep(250);
    const picked = await clickMatchingOption(page, [term]);
    if (!picked) await page.keyboard.press('Enter').catch(() => {});
    await sleep(150);
  }
  if (!report.applied.includes(field)) report.applied.push(field);
}

async function readSelectTags(page, openerPattern) {
  const wrap = page.locator('.ant-select, .ant-form-item').filter({ hasText: openerPattern }).first();
  const texts = await wrap.locator('.ant-select-selection-item').allTextContents().catch(() => []);
  return texts.map((text) => String(text || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Drop junk tags Ant Design sometimes keeps (bare quotes / punctuation) after a failed pick. */
async function clearJunkSelectTags(page, openerPattern) {
  const wrap = page.locator('.ant-select, .ant-form-item').filter({ hasText: openerPattern }).first();
  const items = wrap.locator('.ant-select-selection-item');
  const count = await items.count().catch(() => 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const text = String(await items.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (text && !/^["'\\.\-_/]+$/.test(text) && /[ก-๙A-Za-z]/.test(text)) continue;
    const remove = items.nth(i).locator('.ant-select-selection-item-remove, [aria-label="remove"], .anticon-close');
    if (await remove.count().catch(() => 0)) {
      await remove.first().click({ force: true }).catch(() => {});
      await sleep(80);
    }
  }
}

async function pickSearchableValue(page, value) {
  const search = await firstVisibleLocator([
    page.locator('.ant-select-dropdown:visible input'),
    page.locator('.ant-tree-select-dropdown:visible input'),
    page.locator('.ant-select-selection-search-input:visible'),
    page.locator('[role="dialog"]:visible input[type="search"], [role="dialog"]:visible input[type="text"]'),
  ]);
  if (search) {
    await search.fill('');
    await search.fill(value);
    await sleep(280);
  }
  if (await clickMatchingOption(page, [value])) return true;

  const layer = await visibleOpenLayer(page);
  const scope = layer || page;
  const checkbox = await firstVisibleLocator([
    scope.locator('label').filter({ hasText: new RegExp(`^${escapeRegExp(value)}$`, 'u') }).locator('input[type="checkbox"]'),
    scope.getByRole('treeitem', { name: new RegExp(`^${escapeRegExp(value)}$`, 'u') }),
    scope.locator('.ant-select-tree-title, .ant-tree-title').filter({ hasText: new RegExp(`^${escapeRegExp(value)}$`, 'u') }),
  ]);
  if (checkbox) {
    await clickWithoutNavigationWait(checkbox);
    return true;
  }
  const fuzzy = await firstVisibleLocator([
    scope.getByText(new RegExp(`^${escapeRegExp(value)}$`, 'u')),
    scope.getByText(new RegExp(escapeRegExp(value), 'u')),
  ]);
  if (!fuzzy) return false;
  await clickWithoutNavigationWait(fuzzy);
  return true;
}

function tagsMatchRequested(tags, values) {
  const joined = tags.join(' ');
  return values.some((value) => {
    const bare = String(value).replace(/^จังหวัด\s*/u, '').trim();
    return tags.some((tag) => tag.includes(bare) || bare.includes(tag.replace(/^จังหวัด\s*/u, '')))
      || joined.includes(bare);
  });
}

async function applySearchableChecks(page, openerPattern, values, field, report) {
  const wanted = (Array.isArray(values) ? values : [values])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value && !/^["'\\.\-_/]+$/.test(value));
  if (!wanted.length) {
    report.skipped.push(field);
    return;
  }

  const opener = await firstVisibleLocator([
    page.getByRole('button', { name: openerPattern }),
    page.getByRole('combobox', { name: openerPattern }),
    page.locator('.ant-select, .ant-form-item').filter({ hasText: openerPattern }).locator('.ant-select-selector'),
    page.getByText(openerPattern),
  ]);
  if (!opener) {
    report.skipped.push(field);
    return;
  }
  await clickWithoutNavigationWait(opener);
  await sleep(300);

  let pickedAny = false;
  for (const value of wanted) {
    if (await pickSearchableValue(page, value)) pickedAny = true;
    await sleep(150);
  }
  await closeOpenLayer(page);
  await clearJunkSelectTags(page, openerPattern);

  const tags = await readSelectTags(page, openerPattern);
  const junkOnly = tags.length > 0 && tags.every((tag) => /^["'\\.\-_/]+$/.test(tag));
  if (junkOnly) {
    await clickWithoutNavigationWait(opener).catch(() => {});
    await clearJunkSelectTags(page, openerPattern);
    await closeOpenLayer(page);
  }
  const verified = tagsMatchRequested(await readSelectTags(page, openerPattern), wanted);
  if (pickedAny && (verified || field !== 'province')) {
    report.applied.push(field);
  } else {
    report.skipped.push(field);
  }
}

async function openFilterRow(page, labelPattern) {
  return firstVisibleLocator([
    page.getByRole('button', { name: labelPattern }),
    page.getByText(labelPattern),
  ]);
}

async function applySingleSelect(page, labelPattern, labels, field, report) {
  const opener = await openFilterRow(page, labelPattern);
  if (!opener) {
    report.skipped.push(field);
    return;
  }
  await clickWithoutNavigationWait(opener);
  await sleep(250);
  const picked = await clickMatchingOption(page, labels);
  await closeOpenLayer(page);
  if (picked) report.applied.push(field);
  else report.skipped.push(field);
}

async function applyRangeSelect(page, rowPattern, minLabels, maxLabels, field, report) {
  const opener = await openFilterRow(page, rowPattern);
  if (!opener) {
    report.skipped.push(field);
    return;
  }
  await clickWithoutNavigationWait(opener);
  await sleep(250);
  let ok = false;
  if (minLabels?.length) {
    const minControl = await firstVisibleLocator([
      page.getByText(/ต่ำสุด/u),
      page.locator('.ant-select-selector').first(),
    ]);
    if (minControl) await clickWithoutNavigationWait(minControl);
    ok = (await clickMatchingOption(page, minLabels)) || ok;
  }
  if (maxLabels?.length) {
    const maxControl = await firstVisibleLocator([
      page.getByText(/สูงสุด/u),
    ]);
    if (maxControl) await clickWithoutNavigationWait(maxControl);
    ok = (await clickMatchingOption(page, maxLabels)) || ok;
  }
  await closeOpenLayer(page);
  if (ok) report.applied.push(field);
  else report.skipped.push(field);
}

async function applyPlannedFilter(page, step, report) {
  switch (step.field) {
    case 'position':
      return applyChipField(page, 'position', step.value, report);
    case 'keyword':
      return applyChipField(page, 'keyword', step.value, report);
    case 'jobTypes':
      return applySearchableChecks(page, /ประเภทงาน|สาขาอาชีพ/u, step.value, 'jobTypes', report);
    case 'province': {
      // Try bare name first, then จังหวัด… aliases — stop once the select shows a real tag.
      const aliases = provinceSearchAliases(step.value);
      for (const alias of aliases) {
        const before = report.applied.length;
        await applySearchableChecks(
          page,
          /สถานที่ทำงานทั้งหมด|พื้นที่ที่ต้องการทำงาน/u,
          [alias],
          'province',
          report,
        );
        if (report.applied.length > before) return;
        // undo skip from failed attempt so the next alias can retry cleanly
        const skipAt = report.skipped.lastIndexOf('province');
        if (skipAt >= 0) report.skipped.splice(skipAt, 1);
      }
      if (!report.applied.includes('province') && !report.skipped.includes('province')) {
        report.skipped.push('province');
      }
      return;
    }
    case 'education':
      return applyRangeSelect(page, /วุฒิการศึกษา/u, [step.value.min], [step.value.max], 'education', report);
    case 'gender':
      return applySingleSelect(page, /^เพศ$/u, [step.value], 'gender', report);
    case 'salary':
      return applyRangeSelect(page, /เงินเดือน/u, step.value.minLabels, step.value.maxLabels, 'salary', report);
    case 'age':
      return applyRangeSelect(
        page,
        /^อายุ$/u,
        step.value.min ? [step.value.min] : [],
        step.value.max ? [step.value.max] : [],
        'age',
        report,
      );
    case 'workType':
      return applySearchableChecks(page, /รูปแบบงาน/u, step.value, 'workType', report);
    case 'experience':
      return applySingleSelect(page, /ประสบการณ์/u, [step.value], 'experience', report);
    case 'availableStart':
      return applySingleSelect(page, /ระยะเวลาเริ่มงาน/u, [step.value], 'availableStart', report);
    default:
      report.skipped.push(step.field);
  }
}

async function findSearchButton(page) {
  return firstVisibleLocator([
    page.getByRole('button', { name: /^ค้นหาผู้สมัครงาน$/u }),
    page.getByRole('button', { name: /ค้นหาผู้สมัครงาน/u }),
  ]);
}

async function collectPages(page, pool, need) {
  const seen = new Set(pool.map((item) => item.id));
  let pagesScanned = 1;
  while (pool.length < need && pagesScanned < 40) {
    const next = await firstVisibleLocator([
      page.locator('a[rel="next"]'),
      page.getByRole('link', { name: /^(?:ถัดไป|next|>)$/i }),
      page.getByRole('button', { name: /^(?:ถัดไป|next|>)$/i }),
    ]);
    if (!next) break;
    const before = [...seen];
    await clickWithoutNavigationWait(next);
    const nextPool = await waitForResultChange(page, before, 20_000).catch(() => []);
    const fresh = nextPool.filter((item) => !seen.has(item.id));
    if (!fresh.length) break;
    for (const item of fresh) {
      seen.add(item.id);
      pool.push({ ...item, rank: pool.length + 1 });
    }
    pagesScanned += 1;
  }
  return pagesScanned;
}

export async function runNormalSearch(page, criteria, { need = 15 } = {}) {
  await activateNormalMode(page);
  const report = { applied: [], skipped: [] };
  const plan = planTalentNormalFilters(criteria);
  for (const step of plan) {
    await applyPlannedFilter(page, step, report);
    await dismissJobbkkOverlays(page);
  }
  const missing = missingRequiredNormalFilters(plan, report);
  if (missing.includes('position')) {
    throw new Error('JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันตำแหน่งหรือ Keyword จึงไม่รับผลค้นหาแบบกว้าง');
  }
  if (missing.includes('province')) {
    throw new Error('JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันจังหวัดตามใบขอ จึงไม่รับผลค้นหาทั้งประเทศ');
  }

  const before = await readResumeResultPool(page);
  await dismissJobbkkOverlays(page);
  const button = await findSearchButton(page);
  if (!button) throw new Error('JOBBKK_SITE_CONTRACT_CHANGED: ไม่พบปุ่มค้นหาของ Normal Search');
  await clickWithoutNavigationWait(button);
  const pool = await waitForResultChange(page, before.map((item) => item.id));
  let latest = { method: 'unverified', guaranteed: false };
  try {
    latest = await ensureLatestUpdatedSort(page);
  } catch (error) {
    const newest = await firstVisibleLocator([
      page.getByText(/อัปเดตล่าสุด|เรียง.*ล่าสุด/u),
    ]);
    if (newest) await clickWithoutNavigationWait(newest);
    latest = { method: 'talent_latest_label', guaranteed: false, warning: error.message };
    console.warn(`  [JobBKK] newest-first fallback: ${error.message}`);
  }
  const sortedPool = await readResumeResultPool(page);
  const pagesScanned = await collectPages(page, sortedPool, need);
  return {
    strategy: 'normal',
    pool: sortedPool.length ? sortedPool : pool,
    report,
    latest,
    pagesScanned,
    plan,
  };
}
