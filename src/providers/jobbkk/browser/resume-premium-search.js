/**
 * JobBKK Resume Search Talent (/resumes/premium) filter automation.
 * Uses visible desktop elements only; confirms each popover with "ตกลง".
 */

const POPOVER_FIELDS = [
  { key: 'jobTypes', buttonText: 'ประเภทงาน (สาขาอาชีพ)', checkboxIdPrefix: 'occupation_desktop_' },
  { key: 'areas', buttonText: 'พื้นที่ที่ต้องการทำงาน', checkboxIdPrefix: 'province_desktop_' },
  { key: 'education', buttonText: 'ระดับการศึกษา' },
  { key: 'gender', buttonText: 'เพศ' },
  { key: 'salary', buttonText: 'เงินเดือนที่ต้องการ (บาท)' },
  { key: 'age', buttonText: 'อายุ' },
  { key: 'workType', buttonText: 'รูปแบบงาน' },
  { key: 'experience', buttonText: 'ประสบการณ์' },
  { key: 'availableStart', buttonText: 'ระยะเวลาเริ่มงาน' },
  { key: 'vehicle', buttonText: 'ยานพาหนะส่วนตัว' },
  { key: 'drivingLicense', buttonText: 'ใบอนุญาตในการขับขี่' },
  { key: 'other', buttonText: 'อื่นๆ' },
  { key: 'resumeType', buttonText: 'ประเภทเรซูเม่' },
  { key: 'languageSkill', buttonText: 'ทักษะภาษา' },
  { key: 'businessType', buttonText: 'ประเภทธุรกิจ' },
  { key: 'hasPhoto', buttonText: 'รูปถ่าย' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLines(text) {
  if (!text) return [];
  if (Array.isArray(text)) return text.map((v) => String(v).trim()).filter(Boolean);
  return String(text)
    .split(/[\n,|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasValues(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

const OCCUPATION_ALIASES = {
  ประชาสัมพันธ์: ['การตลาด/PR', 'โฆษณา/สื่อ'],
  'การจัดซื้อ': ['จัดซื้อ'],
  จัดซื้อ: ['จัดซื้อ'],
  การตลาด: ['การตลาด/PR'],
};

function normalizeOptionText(value) {
  return cleanText(value).replace(/^การ/u, '').toLowerCase();
}

function expandOptionVariants(option) {
  const base = cleanText(option);
  const aliases = OCCUPATION_ALIASES[base] ?? [];
  return [...new Set([base, ...aliases])];
}

function optionMatches(search, target) {
  const a = normalizeOptionText(search);
  const b = normalizeOptionText(target);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

async function dismissCookieBanner(page) {
  await page.getByRole('button', { name: 'ยอมรับ' }).click({ timeout: 2000 }).catch(() => {});
}

export async function hasPremiumSearchUI(page) {
  const input = await firstTrulyVisibleLocator(page, '#autoComplete-position');
  return Boolean(input);
}

export async function ensurePremiumSearchPage(page, premiumUrl, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await hasPremiumSearchUI(page)) {
      await page.setViewportSize({ width: 1536, height: 864 }).catch(() => {});
      await sleep(800);
      return true;
    }

    const url = page.url();
    if (!/\/resumes\/premium/i.test(url)) {
      console.log(`Navigating to premium search: ${premiumUrl}`);
      await page.goto(premiumUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await dismissCookieBanner(page);
      await sleep(1500);
      continue;
    }

    const talentLink = page.locator('a[href*="/resumes/premium"]').first();
    if ((await talentLink.count()) > 0 && (await talentLink.isVisible().catch(() => false))) {
      await talentLink.click();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(1500);
      continue;
    }

    await sleep(1000);
  }

  return hasPremiumSearchUI(page);
}

export function buildSearchCriteriaPopupHtml(defaultMaxCandidates = 15) {
  const jobTypeOptions = [
    'การตลาด', 'การขาย', 'การจัดซื้อ', 'บัญชี', 'ทรัพยากรบุคคล',
    'ไอที', 'วิศวกรรม', 'บริการลูกค้า', 'ผลิต', 'คลังสินค้า',
  ];
  const areaOptions = [
    'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'เชียงใหม่', 'ภูเก็ต',
  ];

  const jobOpts = jobTypeOptions.map((o) => `<option value="${o}">${o}</option>`).join('');
  const areaOpts = areaOptions.map((o) => `<option value="${o}">${o}</option>`).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>เงื่อนไขการค้นหา Resume</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; background: #f0f4f8; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 16px 16px 110px; }
    h1 { font-size: 1.35rem; margin: 0 0 6px; }
    p.sub { color: #555; margin: 0 0 16px; font-size: 0.95rem; }
    .card { background: #fff; border-radius: 12px; padding: 18px; margin-bottom: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
    h2 { font-size: 1rem; margin: 0 0 12px; color: #1e40af; }
    label { display: block; margin: 10px 0 4px; font-weight: 600; font-size: 0.9rem; }
    input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 0.95rem; }
    textarea { min-height: 72px; resize: vertical; }
    .hint { font-size: 0.8rem; color: #666; margin-top: 3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .footer {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
      background: #fff; border-top: 2px solid #2563eb; padding: 12px 16px;
      display: flex; gap: 10px; justify-content: center; box-shadow: 0 -4px 16px rgba(0,0,0,0.12);
    }
    .footer button { flex: 1; max-width: 280px; padding: 14px; border: none; border-radius: 10px; font-size: 1rem; font-weight: 700; cursor: pointer; }
    #btnSearch { background: #2563eb; color: #fff; }
    #btnCancel { background: #e5e7eb; color: #111; }
    #status { text-align: center; margin-top: 8px; color: #333; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>เงื่อนไขการค้นหา — Resume Search Talent</h1>
    <p class="sub">ทุกช่องเป็น optional — กรอกเฉพาะที่ต้องการ แล้วกด <strong>ค้นหา</strong></p>

    <div class="card">
      <h2>คำค้นหาหลัก</h2>
      <label for="position">ชื่อตำแหน่งงาน (position)</label>
      <input id="position" type="text" placeholder="เช่น นักจัดซื้อ" />
      <label for="keyword">Keyword</label>
      <input id="keyword" type="text" placeholder="คำค้นเพิ่มเติม" />
      <label for="maxCandidates">จำนวน Resume ที่ต้องการดึง</label>
      <input id="maxCandidates" type="number" min="1" max="100" value="${defaultMaxCandidates}" />
    </div>

    <div class="card">
      <h2>Multi-select (เลือกหลายค่าได้)</h2>
      <label for="jobTypes">ประเภทงาน / สาขาอาชีพ</label>
      <select id="jobTypes" multiple size="5">${jobOpts}</select>
      <div class="hint">กด Ctrl ค้างเพื่อเลือกหลายรายการ</div>
      <label for="areas">พื้นที่ที่ต้องการทำงาน</label>
      <select id="areas" multiple size="5">${areaOpts}</select>
      <label for="jobTypesText">หรือพิมพ์ประเภทงาน (คั่นด้วย comma / ขึ้นบรรทัดใหม่)</label>
      <textarea id="jobTypesText" placeholder="การจัดซื้อ, การขาย"></textarea>
      <label for="areasText">หรือพิมพ์พื้นที่ (คั่นด้วย comma / ขึ้นบรรทัดใหม่)</label>
      <textarea id="areasText" placeholder="กรุงเทพมหานคร, นนทบุรี"></textarea>
    </div>

    <div class="card">
      <h2>ตัวกรองเพิ่มเติม (optional)</h2>
      <div class="grid">
        <div><label for="education">ระดับการศึกษา</label><input id="education" type="text" /></div>
        <div><label for="gender">เพศ</label><select id="gender"><option value="">—</option><option>ชาย</option><option>หญิง</option></select></div>
        <div><label for="salaryMin">เงินเดือนต่ำสุด</label><input id="salaryMin" type="text" /></div>
        <div><label for="salaryMax">เงินเดือนสูงสุด</label><input id="salaryMax" type="text" /></div>
        <div><label for="ageMin">อายุต่ำสุด</label><input id="ageMin" type="text" /></div>
        <div><label for="ageMax">อายุสูงสุด</label><input id="ageMax" type="text" /></div>
        <div><label for="workType">รูปแบบงาน</label><input id="workType" type="text" /></div>
        <div><label for="experience">ประสบการณ์</label><input id="experience" type="text" /></div>
        <div><label for="availableStart">ระยะเวลาเริ่มงาน</label><input id="availableStart" type="text" /></div>
        <div><label for="vehicle">ยานพาหนะส่วนตัว</label><input id="vehicle" type="text" /></div>
        <div><label for="drivingLicense">ใบอนุญาตขับขี่</label><input id="drivingLicense" type="text" /></div>
        <div><label for="resumeType">ประเภทเรซูเม่</label><input id="resumeType" type="text" /></div>
        <div><label for="languageSkill">ทักษะภาษา</label><input id="languageSkill" type="text" /></div>
        <div><label for="businessType">ประเภทธุรกิจ</label><input id="businessType" type="text" /></div>
        <div><label for="hasPhoto">รูปถ่าย</label><input id="hasPhoto" type="text" placeholder="มี / ไม่มี" /></div>
      </div>
      <label for="other">อื่นๆ</label>
      <input id="other" type="text" />
    </div>
    <p id="status"></p>
  </div>

  <div class="footer">
    <button type="button" id="btnCancel">ยกเลิก</button>
    <button type="button" id="btnSearch">ค้นหา</button>
  </div>

  <script>
    function selectedValues(id) {
      const el = document.getElementById(id);
      return Array.from(el.selectedOptions).map((o) => o.value).filter(Boolean);
    }
    function readPayload() {
      const jobFromSelect = selectedValues('jobTypes');
      const areaFromSelect = selectedValues('areas');
      const jobFromText = document.getElementById('jobTypesText').value.split(/[\\n,|]/).map(s => s.trim()).filter(Boolean);
      const areaFromText = document.getElementById('areasText').value.split(/[\\n,|]/).map(s => s.trim()).filter(Boolean);
      const jobTypes = [...new Set([...jobFromSelect, ...jobFromText])];
      const areas = [...new Set([...areaFromSelect, ...areaFromText])];
      const val = (id) => document.getElementById(id).value.trim();
      return {
        position: val('position'),
        keyword: val('keyword'),
        maxCandidates: Math.min(100, Math.max(1, parseInt(document.getElementById('maxCandidates').value, 10) || 1)),
        jobTypes,
        areas,
        education: val('education'),
        gender: val('gender'),
        salaryMin: val('salaryMin'),
        salaryMax: val('salaryMax'),
        ageMin: val('ageMin'),
        ageMax: val('ageMax'),
        workType: val('workType'),
        experience: val('experience'),
        availableStart: val('availableStart'),
        vehicle: val('vehicle'),
        drivingLicense: val('drivingLicense'),
        other: val('other'),
        resumeType: val('resumeType'),
        languageSkill: val('languageSkill'),
        businessType: val('businessType'),
        hasPhoto: val('hasPhoto'),
      };
    }
    async function submitSearch() {
      const status = document.getElementById('status');
      try {
        if (typeof window.submitSearchCriteria !== 'function') throw new Error('Bridge not ready');
        await window.submitSearchCriteria(readPayload());
        status.textContent = 'ส่งเงื่อนไขแล้ว — กำลังกรอกในหน้าเว็บ...';
      } catch (e) {
        status.textContent = e.message;
        alert(e.message);
      }
    }
    document.getElementById('btnSearch').addEventListener('click', submitSearch);
    document.getElementById('btnCancel').addEventListener('click', async () => {
      if (typeof window.cancelSearchCriteria === 'function') await window.cancelSearchCriteria();
    });
  </script>
</body>
</html>`;
}

export async function waitForVisible(page, selector, timeoutMs = 15_000) {
  const locator = page.locator(selector);
  await locator.first().waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
  return firstVisibleLocator(page, selector);
}

export async function firstVisibleLocator(page, selector) {
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

export async function firstVisibleByText(page, baseSelector, text) {
  const items = page.locator(baseSelector).filter({ hasText: text });
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const item = items.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function isTrulyVisible(locator) {
  return locator.evaluate((el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return el.offsetParent !== null || style.position === 'fixed';
  }).catch(() => false);
}

export async function firstTrulyVisibleLocator(page, selector) {
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await isTrulyVisible(item)) return item;
  }
  return null;
}

async function fillAutocompleteInput(page, selector, values, label) {
  const items = parseLines(values);
  if (!items.length) return false;

  const input = await firstTrulyVisibleLocator(page, selector);
  if (!input) {
    console.warn(`  [skip] ${label}: visible input not found (${selector})`);
    return false;
  }

  const tagListSelector = selector.includes('position')
    ? '#autoComplete-position-list'
    : '#autoComplete-keyword-list';

  for (const value of items.slice(0, 3)) {
    const tagsBefore = await page.locator(`${tagListSelector} li`).count();

    await input.click();
    await input.fill('');
    await input.type(value, { delay: 45 });
    await sleep(1000);

    const suggestions = page.locator('[id^="autoComplete_result_"], [id^="autoComplete_list_"] li[role="option"]');
    let picked = false;
    const suggestionCount = await suggestions.count();
    for (let i = 0; i < suggestionCount; i += 1) {
      const suggestion = suggestions.nth(i);
      if (!(await isTrulyVisible(suggestion))) continue;
      const text = cleanText(await suggestion.innerText().catch(() => ''));
      if (!text) continue;
      if (text.includes(value) || value.includes(text) || text.toLowerCase().includes(value.toLowerCase())) {
        await suggestion.click();
        picked = true;
        break;
      }
    }

    if (!picked) {
      const firstVisible = await firstTrulyVisibleLocator(page, '[id^="autoComplete_result_"], [id^="autoComplete_list_"] li[role="option"]');
      if (firstVisible) {
        await firstVisible.click();
        picked = true;
      }
    }

    if (!picked) {
      await input.press('Enter');
    }

    await sleep(700);
    const tagsAfter = await page.locator(`${tagListSelector} li`).count();
    if (tagsAfter <= tagsBefore) {
      console.warn(`  [warn] ${label}: tag not added for "${value}"`);
    } else {
      console.log(`  [filled] ${label}: ${value}`);
    }
  }

  return true;
}

const AVAILABLE_START_MAP = {
  ทันที: 'เริ่มงานได้ทันที',
  'ภายใน 7 วัน': 'ภายใน 7 วัน',
  'ภายใน 15 วัน': 'ภายใน 2 สัปดาห์',
  'ภายใน 30 วัน': 'ภายใน 1 เดือน',
};

function mapAvailableStart(value) {
  const text = cleanText(value);
  return AVAILABLE_START_MAP[text] ?? text;
}

async function clickPopoverByTarget(page, targetId, buttonText) {
  const selectors = [
    `.dropdown-filter-pc button[data-popover-target="${targetId}"]`,
    `.search-filters-pc button[data-popover-target="${targetId}"]`,
    `button[data-popover-target="${targetId}"]`,
  ];

  for (const selector of selectors) {
    const btn = page.locator(selector);
    const count = await btn.count();
    for (let i = 0; i < count; i += 1) {
      const item = btn.nth(i);
      if (!(await isTrulyVisible(item))) continue;
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await item.click();
      await sleep(700);
      return getOpenPopoverContainer(page, targetId);
    }
  }

  if (buttonText) {
    const opened = await clickVisiblePopoverButton(page, buttonText);
    if (opened) return getOpenPopoverContainer(page, targetId);
  }

  return null;
}

async function expandDropdownToggle(container, index = 0) {
  const toggles = container.locator('button.dropdown-toggle');
  const count = await toggles.count();
  let visibleIndex = 0;
  for (let i = 0; i < count; i += 1) {
    const toggle = toggles.nth(i);
    if (!(await isTrulyVisible(toggle))) continue;
    if (visibleIndex === index) {
      await toggle.scrollIntoViewIfNeeded().catch(() => {});
      await toggle.click();
      await sleep(350);
      return true;
    }
    visibleIndex += 1;
  }
  return false;
}

async function openDesktopDropdown(scope, labelClass) {
  const dropdown = scope.locator('.dropdown').filter({ has: scope.locator(labelClass) }).first();
  if ((await dropdown.count()) === 0) return false;

  const toggle = dropdown.locator('button.dropdown-toggle').first();
  await toggle.scrollIntoViewIfNeeded().catch(() => {});
  await toggle.click({ timeout: 10_000 }).catch(() => {});

  const opened = await dropdown.evaluate((el) => {
    const menu = el.querySelector('.dropdown-menu');
    const btn = el.querySelector('.dropdown-toggle');
    if (!menu || !btn) return false;
    el.classList.add('show');
    menu.classList.add('show');
    btn.setAttribute('aria-expanded', 'true');
    menu.style.display = 'block';
    return true;
  }).catch(() => false);

  await sleep(300);
  return opened;
}

async function collapseOpenDropdowns(popover) {
  const dropdowns = popover.locator(
    '#salary_lists_desktop .dropdown.show, #age_lists_desktop .dropdown.show, #education_lists .dropdown.show, #exp_lists_desktop .dropdown.show',
  );
  const count = await dropdowns.count();
  for (let i = 0; i < count; i += 1) {
    await dropdowns.nth(i).evaluate((el) => {
      const menu = el.querySelector('.dropdown-menu');
      const btn = el.querySelector('.dropdown-toggle');
      el.classList.remove('show');
      if (menu) {
        menu.classList.remove('show');
        menu.style.display = '';
      }
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }).catch(() => {});
  }
  await sleep(150);
}

async function selectRadioByValue(container, radioClass, value) {
  const normalized = String(value ?? '').replace(/\D/g, '');
  if (!normalized) return false;

  let radio = container.locator(`input.${radioClass}[value="${normalized}"][data-type="desktop"]`).first();
  if ((await radio.count()) === 0) {
    radio = container.locator(`input.${radioClass}[value="${normalized}"]`).first();
  }
  if ((await radio.count()) === 0) return false;

  const selected = await radio.evaluate((el) => {
    if (!el) return false;
    el.checked = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const label = el.closest('label');
    if (label) label.click();
    return el.checked;
  }).catch(() => false);

  await sleep(250);
  return Boolean(selected);
}

async function selectRadioByLabel(container, radioClass, labelText) {
  const variants = expandOptionVariants(labelText);
  const radios = container.locator(`input.${radioClass}`);
  const count = await radios.count();

  for (let i = 0; i < count; i += 1) {
    const radio = radios.nth(i);
    const labelEl = radio.locator('xpath=ancestor::label[1]');
    const text = cleanText(await labelEl.innerText().catch(() => ''));
    if (!text) continue;
    if (!variants.some((variant) => optionMatches(variant, text))) continue;

    const selected = await radio.evaluate((el) => {
      if (!el) return false;
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const label = el.closest('label');
      if (label) label.click();
      return el.checked;
    }).catch(() => false);

    if (selected) {
      console.log(`    ✓ selected ${radioClass}: ${text}`);
      await sleep(250);
      return true;
    }
  }

  console.warn(`    ✗ not found ${radioClass}: ${labelText}`);
  return false;
}

function parseEducationCriteria(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const parts = text.split(/[-–—,|]/).map((part) => cleanText(part)).filter(Boolean);
  if (parts.length >= 2) return { min: parts[0], max: parts[1] };
  return { min: parts[0], max: 'ปริญญาเอก' };
}

function parseExperienceCriteria(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const rangeMatch = text.match(/^(\d+)\s*[-–—]\s*(\d+)/);
  if (rangeMatch) return { min: rangeMatch[1], max: rangeMatch[2] };
  const num = text.replace(/\D/g, '');
  if (!num) return null;
  return { min: num, max: '11' };
}

async function fillEducationPopover(page, criteria) {
  const parsed = parseEducationCriteria(criteria.education);
  if (!parsed) return false;

  const popover = await clickPopoverByTarget(page, 'educational-qualification', 'ระดับการศึกษา');
  if (!popover) return false;

  const lists = popover.locator('#education_lists');
  let ok = false;

  await openDesktopDropdown(lists, '.educationMin-p');
  ok = (await selectRadioByLabel(lists, 'iseducationmin', parsed.min)) || ok;
  await collapseOpenDropdowns(popover);

  await openDesktopDropdown(lists, '.educationMax-p');
  ok = (await selectRadioByLabel(lists, 'iseducationmax', parsed.max)) || ok;
  await collapseOpenDropdowns(popover);

  if (ok) console.log(`  [filled] education: ${parsed.min} — ${parsed.max}`);
  await confirmPopover(page);
  return ok;
}

async function fillExperiencePopover(page, criteria) {
  const parsed = parseExperienceCriteria(criteria.experience);
  if (!parsed) return false;

  const popover = await clickPopoverByTarget(page, 'experience', 'ประสบการณ์');
  if (!popover) return false;

  const desktop = popover.locator('#exp_lists_desktop');
  let ok = false;

  await openDesktopDropdown(desktop, '.expMin-p');
  ok = (await selectRadioByValue(desktop, 'isexpmin', parsed.min)) || ok;
  if (ok) console.log(`  [filled] experienceMin: ${parsed.min} ปี`);
  await collapseOpenDropdowns(popover);

  await openDesktopDropdown(desktop, '.expMax-p');
  ok = (await selectRadioByValue(desktop, 'isexpmax', parsed.max)) || ok;
  if (ok) console.log(`  [filled] experienceMax: ${parsed.max === '11' ? 'มากกว่า 10 ปี' : `${parsed.max} ปี`}`);
  await collapseOpenDropdowns(popover);

  if (ok) console.log(`  [filled] experience: ${parsed.min} — ${parsed.max}`);
  await confirmPopover(page);
  return ok;
}

async function closePopover(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('h1.font-h1, .title-resume-search-premium h1').first().click({ force: true }).catch(() => {});
  await sleep(300);
}

async function clickVisiblePopoverButton(page, buttonText) {
  const scoped = page.locator('.dropdown-filter-pc .popover-button, .search-filters-pc .popover-button').filter({ hasText: buttonText });
  const count = await scoped.count();
  for (let i = 0; i < count; i += 1) {
    const btn = scoped.nth(i);
    if (await isTrulyVisible(btn)) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click();
      await sleep(700);
      return true;
    }
  }

  const btn = await firstVisibleByText(page, '.popover-button', buttonText);
  if (!btn) {
    console.warn(`  [skip] popover button not visible: ${buttonText}`);
    return false;
  }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click();
  await sleep(700);
  return true;
}

async function getOpenPopoverContainer(page, targetId = null) {
  if (targetId) {
    const byId = page.locator(`#${targetId}`).first();
    if ((await byId.count()) > 0) {
      const hidden = await byId.evaluate((el) => el.classList.contains('hidden')).catch(() => true);
      if (!hidden && (await isTrulyVisible(byId))) return byId;
    }
  }

  const selectors = [
    '[data-popover].popover-dropdown:not(.hidden)',
    '.popover-dropdown:not(.hidden)',
    '.popover.show',
    '.popover.fade.show',
    '[class*="popover"][style*="display: block"]',
    '.modal.show',
  ];
  for (const sel of selectors) {
    const pop = await firstTrulyVisibleLocator(page, sel);
    if (pop) return pop;
  }
  return null;
}

async function selectOptionsInPopover(page, options, checkboxIdPrefix, fieldType = 'checkbox') {
  const labels = parseLines(options);
  if (!labels.length) return;

  const popover = (await getOpenPopoverContainer(page)) ?? page;
  let selectedCount = 0;

  for (const option of labels) {
    const variants = expandOptionVariants(option);
    let checked = false;

    if (fieldType === 'radio') {
      for (const variant of variants) {
        const labelLocator = popover.locator('label').filter({ hasText: variant });
        const labelCount = await labelLocator.count();
        for (let i = 0; i < labelCount; i += 1) {
          const lbl = labelLocator.nth(i);
          if (!(await isTrulyVisible(lbl))) continue;
          const radio = lbl.locator('input[type="radio"]').first();
          if ((await radio.count()) === 0) continue;
          // เลือก + "ยืนยันว่าติดจริง" (JobBKK บางครั้ง radio ไม่รับคลิกแรก → ลองซ้ำสูงสุด 3 ครั้ง)
          for (let attempt = 0; attempt < 3 && !checked; attempt += 1) {
            await radio.check({ force: true }).catch(() => {});
            if (await radio.isChecked().catch(() => false)) { checked = true; break; }
            await lbl.click({ force: true }).catch(() => {});
            await sleep(150);
            if (await radio.isChecked().catch(() => false)) { checked = true; break; }
          }
          if (checked) break;
        }
        if (checked) break;
      }
    }

    if (!checked && checkboxIdPrefix) {
      const byId = page.locator(`[id^="${checkboxIdPrefix}"]`);
      const count = await byId.count();
      for (let i = 0; i < count; i += 1) {
        const cb = byId.nth(i);
        if (!(await isTrulyVisible(cb))) continue;
        const textValue = cleanText((await cb.getAttribute('text-value').catch(() => '')) ?? '');
        const labelText = cleanText(await cb.evaluate((el) => {
          const lbl = el.closest('label') || el.parentElement;
          return lbl?.innerText ?? '';
        }));
        const target = textValue || labelText;
        if (variants.some((variant) => optionMatches(variant, target))) {
          await cb.check({ force: true }).catch(async () => { await cb.click({ force: true }); });
          checked = true;
          break;
        }
      }
    }

    if (!checked) {
      for (const variant of variants) {
        const labelLocator = popover.locator('label').filter({ hasText: variant });
        const count = await labelLocator.count();
        for (let i = 0; i < count; i += 1) {
          const lbl = labelLocator.nth(i);
          if (!(await isTrulyVisible(lbl))) continue;
          const cb = lbl.locator('input[type="checkbox"], input[type="radio"]').first();
          if ((await cb.count()) > 0) {
            await cb.check({ force: true }).catch(async () => { await lbl.click({ force: true }); });
          } else {
            await lbl.click({ force: true });
          }
          checked = true;
          break;
        }
        if (checked) break;
      }
    }

    if (!checked) {
      for (const variant of variants) {
        const textOption = popover.getByText(variant, { exact: false }).first();
        if ((await textOption.count()) > 0 && (await isTrulyVisible(textOption))) {
          await textOption.click({ force: true });
          checked = true;
          break;
        }
      }
    }

    if (checked) selectedCount += 1;
    console.log(checked ? `    ✓ selected: ${option}` : `    ✗ not found: ${option}`);
    await sleep(200);
  }
  return selectedCount;
}

async function confirmPopover(page) {
  const popover = (await getOpenPopoverContainer(page)) ?? page;
  const confirmBtn = await firstVisibleByText(popover, 'button, a, .btn', 'ตกลง');
  if (confirmBtn) {
    await confirmBtn.click();
    await sleep(500);
    return true;
  }
  await closePopover(page);
  return true;
}

async function fillPopoverField(page, fieldDef, criteria) {
  const raw = criteria[fieldDef.key];
  if (!hasValues(raw)) return false;

  let values = parseLines(raw);
  if (fieldDef.key === 'availableStart') {
    values = values.map(mapAvailableStart);
  }

  const popoverTarget = fieldDef.popoverTarget ?? null;
  const opened = popoverTarget
    ? await clickPopoverByTarget(page, popoverTarget, fieldDef.buttonText)
    : (await clickVisiblePopoverButton(page, fieldDef.buttonText) ? await getOpenPopoverContainer(page) : null);

  if (!opened) return false;

  const fieldType = fieldDef.key === 'gender' ? 'radio' : 'checkbox';
  const selected = await selectOptionsInPopover(page, values, fieldDef.checkboxIdPrefix, fieldType);
  await confirmPopover(page);
  // radio (เช่น เพศ) ที่เลือกไม่ติดสักตัว = filter ไม่ถูก apply → รายงานล้มเหลว (อย่า skip เงียบ)
  if (fieldType === 'radio' && selected === 0) {
    console.warn(`  ⚠️ [filter-fail] ${fieldDef.key}: เลือก radio ไม่สำเร็จ — ผลลัพธ์จะไม่ถูกกรองตาม "${fieldDef.key}"`);
    return false;
  }
  console.log(`  [filled] ${fieldDef.key}: ${values.join(', ')} (เลือกได้ ${selected})`);
  return true;
}

async function fillSalaryPopover(page, criteria) {
  if (!criteria.salaryMin && !criteria.salaryMax) return false;
  const popover = await clickPopoverByTarget(page, 'salary', 'เงินเดือนที่ต้องการ (บาท)');
  if (!popover) return false;

  const desktop = popover.locator('#salary_lists_desktop');
  let ok = false;

  if (criteria.salaryMin) {
    await openDesktopDropdown(desktop, '.salaryMin-p');
    ok = (await selectRadioByValue(desktop, 'issalarymin', criteria.salaryMin)) || ok;
    if (ok) console.log(`  [filled] salaryMin: ${criteria.salaryMin}`);
    await collapseOpenDropdowns(popover);
  }
  if (criteria.salaryMax) {
    await openDesktopDropdown(desktop, '.salaryMax-p');
    ok = (await selectRadioByValue(desktop, 'issalarymax', criteria.salaryMax)) || ok;
    if (ok) console.log(`  [filled] salaryMax: ${criteria.salaryMax}`);
    await collapseOpenDropdowns(popover);
  }

  await confirmPopover(page);
  return ok;
}

async function fillAgePopover(page, criteria) {
  if (!criteria.ageMin && !criteria.ageMax) return false;
  const popover = await clickPopoverByTarget(page, 'age', 'อายุ');
  if (!popover) return false;

  const desktop = popover.locator('#age_lists_desktop');
  let ok = false;

  if (criteria.ageMin) {
    await openDesktopDropdown(desktop, '.ageMin-p');
    ok = (await selectRadioByValue(desktop, 'isagemin', criteria.ageMin)) || ok;
    await collapseOpenDropdowns(popover);
  }
  if (criteria.ageMax) {
    await openDesktopDropdown(desktop, '.ageMax-p');
    ok = (await selectRadioByValue(desktop, 'isagemax', criteria.ageMax)) || ok;
    await collapseOpenDropdowns(popover);
  }

  if (ok) console.log(`  [filled] age: ${criteria.ageMin || '-'} - ${criteria.ageMax || '-'}`);
  await confirmPopover(page);
  return ok;
}

function cleanText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

const CRITERIA_TO_POPOVER = {
  gender: { buttonText: 'เพศ', popoverTarget: 'sex' },
  workType: { buttonText: 'รูปแบบงาน', popoverTarget: 'work-format' },
  availableStart: { buttonText: 'ระยะเวลาเริ่มงาน', popoverTarget: 'date' },
  vehicle: { buttonText: 'ยานพาหนะส่วนตัว', popoverTarget: 'private-vehicles' },
  drivingLicense: { buttonText: 'ใบอนุญาตในการขับขี่', popoverTarget: 'license' },
  other: { buttonText: 'อื่นๆ', popoverTarget: 'graduates-disabled-persons' },
  resumeType: { buttonText: 'ประเภทเรซูเม่', popoverTarget: 'status-resume' },
  languageSkill: { buttonText: 'ทักษะภาษา', popoverTarget: 'language-skills' },
  businessType: { buttonText: 'ประเภทธุรกิจ', popoverTarget: 'business-type' },
  hasPhoto: { buttonText: 'รูปถ่าย', popoverTarget: 'picture-poprover' },
};

export async function applyPremiumSearchFilters(page, criteria) {
  console.log('Applying premium search filters on page...');
  await dismissCookieBanner(page);
  await waitForVisible(page, '#autoComplete-position, .popover-button', 20_000);
  await sleep(1000);

  const results = {};

  if (criteria.position) {
    results.position = await fillAutocompleteInput(page, '#autoComplete-position', parseLines(criteria.position), 'position');
  }
  if (criteria.keyword) {
    results.keyword = await fillAutocompleteInput(page, '#autoComplete-keyword', parseLines(criteria.keyword), 'keyword');
  }

  results.areas = await fillPopoverField(
    page,
    { key: 'areas', buttonText: 'พื้นที่ที่ต้องการทำงาน', checkboxIdPrefix: 'province_desktop_', popoverTarget: 'all-workplaces' },
    criteria,
  );
  results.jobTypes = await fillPopoverField(
    page,
    { key: 'jobTypes', buttonText: 'ประเภทงาน (สาขาอาชีพ)', checkboxIdPrefix: 'occupation_desktop_', popoverTarget: 'occupation' },
    criteria,
  );
  results.salaryMin = await fillSalaryPopover(page, criteria).catch((err) => {
    console.warn(`  [warn] salary filter: ${err.message}`);
    return false;
  });
  results.salaryMax = results.salaryMin;
  results.ageMin = await fillAgePopover(page, criteria).catch((err) => {
    console.warn(`  [warn] age filter: ${err.message}`);
    return false;
  });
  results.ageMax = results.ageMin;

  results.education = await fillEducationPopover(page, criteria).catch((err) => {
    console.warn(`  [warn] education filter: ${err.message}`);
    return false;
  });
  results.experience = await fillExperiencePopover(page, criteria).catch((err) => {
    console.warn(`  [warn] experience filter: ${err.message}`);
    return false;
  });

  for (const [key, fieldDef] of Object.entries(CRITERIA_TO_POPOVER)) {
    if (!hasValues(criteria[key])) continue;
    results[key] = await fillPopoverField(page, { key, ...fieldDef }, { [key]: criteria[key] });
  }

  console.log('Premium filter fill complete.');
  return results;
}

export async function clickPremiumSearchButton(page) {
  const desktopBtn = await firstTrulyVisibleLocator(page, 'button#btn-search');
  if (!desktopBtn) {
    throw new Error('Visible desktop search button #btn-search not found');
  }
  await desktopBtn.scrollIntoViewIfNeeded().catch(() => {});
  await desktopBtn.click();
  console.log('Clicked button#btn-search (desktop)');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(1500);
}

export async function waitForPremiumSearchResults(page, timeoutMs = 45_000) {
  const start = Date.now();
  const beforeUrl = page.url();
  let lastCount = null;

  while (Date.now() - start < timeoutMs) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const match = bodyText.match(/ผลการค้นหาพบ\s*:\s*([\d,]+)/);
    const articleCount = await page.locator('article.bg-resume a.clickShowDetail[data-id], article.bg-resume a.read-profile[data-id]').count();

    if (match) {
      const count = Number.parseInt(match[1].replace(/,/g, ''), 10);
      const urlChanged = page.url() !== beforeUrl;
      if (urlChanged || articleCount > 0 || lastCount !== count) {
        console.log(`Search results text found: ${count} resumes (${articleCount} cards on page)`);
        return count;
      }
      lastCount = count;
    }

    await sleep(800);
  }

  const fallbackCards = await page.locator('article.bg-resume a.clickShowDetail[data-id], article.bg-resume a.read-profile[data-id]').count();
  if (fallbackCards > 0) {
    console.log(`Using card count fallback: ${fallbackCards} resumes`);
    return fallbackCards;
  }

  console.warn('Timed out waiting for "ผลการค้นหาพบ" text');
  return null;
}

export async function showSearchCriteriaPopup(context, defaultMaxCandidates) {
  let settled = false;
  let resolveCriteria;
  let rejectCriteria;

  const criteriaPromise = new Promise((resolve, reject) => {
    resolveCriteria = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    rejectCriteria = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
  });

  await context.exposeFunction('submitSearchCriteria', async (criteria) => {
    console.log('Search criteria received:', criteria);
    resolveCriteria(criteria);
  });

  await context.exposeFunction('cancelSearchCriteria', async () => {
    rejectCriteria(new Error('User cancelled search criteria popup'));
  });

  const popupPage = await context.newPage();
  await popupPage.setContent(buildSearchCriteriaPopupHtml(defaultMaxCandidates), { waitUntil: 'load' });
  await popupPage.bringToFront();

  console.log('');
  console.log('=== เงื่อนไขการค้นหา (Popup) — ขั้นตอนแรก ===');
  console.log('กรอกเงื่อนไขในหน้าต่าง browser แล้วกด "ค้นหา"');
  console.log('หรือกด "ยกเลิก" เพื่อหยุด');
  console.log('ทางเลือก: กลับมากด Enter ใน terminal เพื่อใช้ค่าที่กรอกในฟอร์ม');
  console.log('');

  return { popupPage, criteriaPromise, readForm: () => readSearchCriteriaFromForm(popupPage) };
}

export async function readSearchCriteriaFromForm(popupPage) {
  return popupPage.evaluate(() => {
    const selectedValues = (id) =>
      Array.from(document.getElementById(id).selectedOptions).map((o) => o.value).filter(Boolean);
    const splitText = (id) =>
      document.getElementById(id).value.split(/[\n,|]/).map((s) => s.trim()).filter(Boolean);
    const val = (id) => document.getElementById(id).value.trim();
    const jobTypes = [...new Set([...selectedValues('jobTypes'), ...splitText('jobTypesText')])];
    const areas = [...new Set([...selectedValues('areas'), ...splitText('areasText')])];
    return {
      position: val('position'),
      keyword: val('keyword'),
      maxCandidates: Math.min(100, Math.max(1, parseInt(document.getElementById('maxCandidates').value, 10) || 1)),
      jobTypes,
      areas,
      education: val('education'),
      gender: val('gender'),
      salaryMin: val('salaryMin'),
      salaryMax: val('salaryMax'),
      ageMin: val('ageMin'),
      ageMax: val('ageMax'),
      workType: val('workType'),
      experience: val('experience'),
      availableStart: val('availableStart'),
      vehicle: val('vehicle'),
      drivingLicense: val('drivingLicense'),
      other: val('other'),
      resumeType: val('resumeType'),
      languageSkill: val('languageSkill'),
      businessType: val('businessType'),
      hasPhoto: val('hasPhoto'),
    };
  });
}

export async function resolveSearchCriteriaPopup({ popupPage, criteriaPromise }) {
  const criteria = await criteriaPromise;
  await popupPage.close().catch(() => {});
  return criteria;
}
