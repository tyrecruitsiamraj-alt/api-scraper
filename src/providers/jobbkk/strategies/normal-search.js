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
  // The banner dialog opens right after Normal Search is active.
  await dismissJobbkkOverlays(page);
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

/**
 * ชิปที่กล่องตำแหน่ง/Keyword ถืออยู่จริง — อ่านจากกล่อง Ant Select ที่ครอบช่องพิมพ์
 * ต้องเทียบชื่อคลาสทั้งคำ ("ant-select" ไม่ใช่ "contains") เพราะบนเว็บจริงช่องพิมพ์อยู่ใน
 * .ant-select-selection-search ซึ่งเป็นพี่น้องของชิป ไม่ได้ครอบชิป — ถ้าจับตัวนั้นจะเห็นว่างเสมอ (3 พ.ย. 2569)
 * คืน { tags, box } · box = โครงกล่องที่เห็น (คลาสของ ancestor + จำนวนชิปในแต่ละชั้น) ไว้ใส่ใน error
 */
async function readChipTags(input) {
  const info = await input.evaluate((el) => {
    const hasClass = (node, name) => node.classList && node.classList.contains(name);
    const chain = [];
    let node = el.parentElement;
    let depth = 0;
    let box = null;
    while (node && depth < 8) {
      const chips = [...node.querySelectorAll('.ant-select-selection-item')]
        .map((c) => (c.getAttribute('title') || c.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      chain.push(`${node.tagName.toLowerCase()}.${[...node.classList].slice(0, 3).join('.') || '-'}[${chips.length}]`);
      if (!box && (hasClass(node, 'ant-select') || hasClass(node, 'ant-form-item') || hasClass(node, 'ant-form-item-row') || hasClass(node, 'ant-select-selection-wrap'))) {
        // กล่องแรกที่เป็น Ant Select ทั้งก้อน (ไม่ใช่ .ant-select-selection-search ที่ครอบแค่ช่องพิมพ์)
        if (!hasClass(node, 'ant-select-selection-search')) box = { chips, label: chain[chain.length - 1] };
      }
      node = node.parentElement;
      depth += 1;
    }
    return { tags: box?.chips ?? [], box: chain.join(' > ') };
  }).catch(() => ({ tags: [], box: 'อ่านโครงกล่องไม่ได้' }));
  return info;
}

/**
 * พิมพ์ชื่อตำแหน่ง/Keyword แล้วเลือกจากรายการ — นับว่า "ติด" ก็ต่อเมื่อเห็นชิปในกล่องจริง
 * เดิมนับว่าติดทันทีที่พิมพ์เสร็จ ทั้งที่เว็บไม่รับ ผลค้นเลยเป็นเรซูเม่ล่าสุดทั้งจังหวัดไม่กรองตำแหน่ง:
 * ใบคนขับรถ 2 ใบ เปิดดู 119 คน ไม่มีคนขับรถเลย เสียโควตาวันนั้นเปล่า (3 พ.ย. 2569)
 */
async function applyChipField(page, field, terms, report) {
  const seenKey = field === 'position' ? 'positionSeen' : 'keywordSeen';
  let verified = false;
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
    const { tags, box } = await readChipTags(input);
    report[seenKey] = tags.join(', ');
    report[`${field}Box`] = box;
    if (tagsMatchRequested(tags, [term])) verified = true;
  }
  if (verified) {
    if (!report.applied.includes(field)) report.applied.push(field);
  } else if (!report.skipped.includes(field)) {
    report.skipped.push(field);
  }
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
  // JobBKK's Ant Design build also puts .ant-select-selection-search-input on a
  // wrapper div; fill() on that throws, so only accept real typeable controls.
  const search = await firstEditableLocator([
    page.locator('.ant-select-dropdown:visible input'),
    page.locator('.ant-tree-select-dropdown:visible input'),
    page.locator('input.ant-select-selection-search-input:visible'),
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

/**
 * Live JobBKK (20 Oct 2026): province is a readOnly input#province that opens an
 * .ant-dropdown with a search box and an .ant-tree of checkboxes. After ticking,
 * the input value reads e.g. "สมุทรปราการ ทั้งหมด" — that value is the proof.
 * Returns null when this control is absent so the caller can use the older path.
 */
async function applyProvinceTree(page, aliases, report) {
  const opener = await firstVisibleLocator([
    page.locator('input[name="province"]'),
    page.locator('input#province'),
  ]);
  if (!opener) return null;
  const debug = process.env.JOBBKK_DEBUG_FILTERS === '1' ? (...args) => console.log('  [province]', ...args) : () => {};
  const bareNames = [...new Set(aliases.map((alias) => String(alias).replace(/^จังหวัด\s*/u, '').trim()).filter(Boolean))];
  for (const name of bareNames) {
    const layer = page.locator('.ant-dropdown:visible').first();
    // A popup left open by the previous filter swallows the first click, so
    // retry: close leftovers with Escape, then click the dropdown trigger wrapper.
    const triggers = [opener, opener.locator('xpath=ancestor::*[contains(@class,"ant-dropdown-trigger")][1]')];
    let layerOpen = false;
    for (let attempt = 0; attempt < 3 && !layerOpen; attempt += 1) {
      await dismissJobbkkOverlays(page);
      if (attempt > 0) {
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(300);
      }
      await clickWithoutNavigationWait(triggers[Math.min(attempt, 1)]).catch(() => {});
      await layer.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      layerOpen = await layer.isVisible().catch(() => false);
    }
    debug(name, 'dropdown open:', layerOpen);
    if (!layerOpen) {
      report.provinceSeen = `กดช่องจังหวัดแล้วรายการไม่เปิด · ช่องขึ้นว่า "${await opener.inputValue().catch(() => '')}"`;
      break;
    }
    const search = await firstEditableLocator([layer.locator('input[placeholder]'), layer.locator('input.ant-input')]);
    debug('search box:', Boolean(search));
    if (search) {
      await search.fill('');
      await search.fill(name);
      await sleep(400);
    }
    const findNode = () => firstVisibleLocator([
      layer.locator('[role="treeitem"]').filter({
        has: page.locator('.ant-tree-title', { hasText: provinceTitlePattern(name) }),
      }),
    ]);
    let node = await findNode();
    let scrollTries = 0;
    let scrollMoves = 0;
    if (!node) {
      // จังหวัดนอกกรุงเทพอาจซ่อนอยู่ใต้ภาค (กิ่งปิด) — กางกิ่งที่ปิดอยู่แล้วหาใหม่
      for (let i = 0; i < 12; i += 1) {
        const closed = layer.locator('.ant-tree-switcher_close').first();
        if (!(await closed.isVisible().catch(() => false))) break;
        await clickWithoutNavigationWait(closed).catch(() => {});
        await sleep(200);
      }
      node = await findNode();
    }
    if (!node) {
      // ต้นไม้ของ JobBKK วาดเฉพาะแถวที่อยู่ในกรอบ — จังหวัดใต้ภาคที่กางแล้วอาจยังไม่ถูกวาดจนกว่าจะเลื่อนลง
      // หน้าจริง (1 พ.ย. 2569): กล่องที่เลื่อนคือ .ant-tree-list-holder ตั้ง overflow hidden (ใช้แถบเลื่อนของตัวเอง)
      // ห้ามกรองด้วย overflow auto/scroll — ตั้ง scrollTop ตรงแล้วส่ง scroll event ต้นไม้วาดแถวถัดไปให้เอง
      for (let i = 0; i < 30 && !node; i += 1) {
        scrollTries += 1;
        const moved = await layer.evaluate((root) => {
          const boxes = [root, ...root.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 5);
          const box = root.querySelector('.ant-tree-list-holder')
            || boxes.find((el) => el.querySelector('.ant-tree-treenode, [role="treeitem"]')) || boxes[0];
          if (!box) return false;
          const before = box.scrollTop;
          box.scrollTop = before + Math.max(80, box.clientHeight - 40);
          box.dispatchEvent(new Event('scroll', { bubbles: true }));
          return box.scrollTop > before;
        }).catch(() => false);
        if (!moved) break;
        scrollMoves += 1;
        await sleep(150);
        node = await findNode();
      }
    }
    debug('tree node:', Boolean(node));
    let checked = false;
    if (node) {
      const box = node.locator('.ant-tree-checkbox').first();
      if ((await box.getAttribute('aria-checked').catch(() => null)) !== 'true') {
        await clickWithoutNavigationWait(box);
        await sleep(250);
      }
      checked = (await box.getAttribute('aria-checked').catch(() => null)) === 'true'
        || /ant-tree-checkbox-checked/.test((await box.getAttribute('class').catch(() => '')) || '');
      debug('checked:', checked);
    }
    // จดสิ่งที่เห็นในรายการไว้ในข้อความ error ถ้าเลือกไม่ติด — ครั้งหน้าดูจากบันทึกรอบได้เลยว่าหน้าเว็บเปลี่ยนตรงไหน
    const allTitles = (await layer.locator('.ant-tree-title').allTextContents().catch(() => []))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const near = allTitles.filter((t) => t.includes(name) || name.includes(t.replace(/^(?:จ\.|จังหวัด)\s*/u, '').replace(/\s*\(.*$/u, '')));
    const seenTitles = [...new Set([...near, ...allTitles.slice(-6)])].slice(0, 10);
    const layout = node ? '' : await describeProvinceLayer(layer, search);
    await closeOpenLayer(page);
    await page.keyboard.press('Escape').catch(() => {});
    await layer.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
    const shown = await opener.inputValue().catch(() => '');
    debug('input value:', JSON.stringify(shown));
    // ช่องจังหวัดบางแบบโชว์จำนวนแทนชื่อ ("1 จังหวัด") — ติ๊กติดแล้วช่องไม่ว่าง ถือว่าเลือกแล้ว
    if (shown.includes(name) || (checked && shown.trim())) {
      report.applied.push('province');
      return true;
    }
    report.provinceSeen = `ค้น "${name}" · ช่องค้น${search ? 'มี' : 'ไม่มี'} · ในรายการ ${allTitles.length} แถว เช่น ${seenTitles.join(', ') || 'ไม่มี'} · ชื่อตรง${node ? 'เจอ' : 'ไม่เจอ'} ติ๊ก${checked ? 'ติด' : 'ไม่ติด'} · ช่องจังหวัดขึ้นว่า "${shown}"${node ? '' : ` · เลื่อน ${scrollMoves}/${scrollTries} ครั้ง · โครงรายการ: ${layout}`}`;
  }
  report.skipped.push('province');
  return false;
}

/**
 * โครงของกล่องรายการจังหวัดตอนหาไม่เจอ (คลาส ขนาดที่เลื่อนได้ ตัวกางกิ่ง) — มีแต่ชื่อจังหวัด/ภาค ไม่มีข้อมูลผู้สมัคร
 * ไว้ดูจากบันทึกรอบว่าต้นไม้ของ JobBKK เลื่อนด้วยกล่องไหน โดยไม่ต้องเปิดหน้าเว็บเอง
 */
async function describeProvinceLayer(layer, search) {
  const seen = await layer.evaluate((root) => {
    const name = (el) => `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join('')}`;
    const boxes = [root, ...root.querySelectorAll('*')]
      .filter((el) => el.scrollHeight > el.clientHeight + 5 || /auto|scroll/.test(getComputedStyle(el).overflowY))
      .slice(0, 5)
      .map((el) => `${name(el)} ${getComputedStyle(el).overflowY} ${el.scrollHeight}/${el.clientHeight} บน=${Math.round(el.scrollTop)}`);
    const rows = [...root.querySelectorAll('.ant-tree-treenode')];
    const rowText = (el) => (el.querySelector('.ant-tree-title')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      boxes,
      rows: rows.length,
      first: rows[0] ? rowText(rows[0]) : '',
      last: rows.length ? rowText(rows[rows.length - 1]) : '',
      closed: root.querySelectorAll('.ant-tree-switcher_close').length,
      open: [...root.querySelectorAll('.ant-tree-switcher_open')]
        .map((sw) => rowText(sw.closest('.ant-tree-treenode') || sw)).filter(Boolean).slice(0, 6),
      virtual: Boolean(root.querySelector('.rc-virtual-list, .ant-tree-list-holder')),
      scrollbar: Boolean(root.querySelector('.rc-virtual-list-scrollbar, .ant-tree-list-scrollbar')),
    };
  }).catch((error) => ({ error: String(error?.message || error).slice(0, 80) }));
  if (seen.error) return `อ่านไม่ได้ (${seen.error})`;
  const typed = search
    ? `ช่องค้น "${await search.getAttribute('placeholder').catch(() => '')}" ค่า "${await search.inputValue().catch(() => '')}"`
    : 'ไม่มีช่องค้น';
  return [
    typed,
    `แถว ${seen.rows} (${seen.first} → ${seen.last})`,
    `กิ่งปิด ${seen.closed} กิ่งเปิด ${seen.open.join('/') || 'ไม่มี'}`,
    `virtual ${seen.virtual ? 'มี' : 'ไม่มี'} แถบเลื่อน ${seen.scrollbar ? 'มี' : 'ไม่มี'}`,
    `กล่อง ${seen.boxes.join(' | ') || 'ไม่มี'}`,
  ].join(' · ');
}

/** ช่องกรอก/ป้ายที่เกี่ยวกับสถานที่ที่เห็นบนหน้า (ข้อความหน้าเว็บ ไม่มีข้อมูลผู้สมัคร) ไว้แก้ตัวเลือกเมื่อ JobBKK เปลี่ยนหน้า */
async function describeLocationControls(page) {
  const seen = await page.evaluate(() => {
    const visible = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const inputs = [...document.querySelectorAll('input')].filter(visible)
      .map((el) => [el.name && `name=${el.name}`, el.id && `id=${el.id}`, el.placeholder && `"${el.placeholder}"`].filter(Boolean).join(' '))
      .filter((text) => /province|location|area|จังหวัด|สถานที่|พื้นที่/i.test(text));
    const labels = [...document.querySelectorAll('label, span, div')].filter(visible)
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length <= 40 && /จังหวัด|สถานที่|พื้นที่/.test(text));
    return { inputs: [...new Set(inputs)].slice(0, 5), labels: [...new Set(labels)].slice(0, 6) };
  }).catch(() => ({ inputs: [], labels: [] }));
  return `ช่องที่เห็น: ${seen.inputs.join(', ') || 'ไม่มี'} · ป้ายที่เห็น: ${seen.labels.join(', ') || 'ไม่มี'}`;
}

/** ชื่อจังหวัดในต้นไม้ของ JobBKK อาจมี "จ." / "จังหวัด" นำหน้า หรือจำนวนต่อท้าย เช่น "สมุทรปราการ (12)" */
function provinceTitlePattern(name) {
  return new RegExp(`^\\s*(?:จ\\.\\s*|จังหวัด\\s*)?${escapeRegExp(name)}(?:\\s*\\(.*\\))?\\s*(?:ทั้งหมด)?\\s*$`, 'u');
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
      if ((await applyProvinceTree(page, aliases, report)) !== null) return;
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
      if (!report.applied.includes('province') && !report.provinceSeen) {
        report.provinceSeen = `ไม่เจอช่องจังหวัดแบบเดิม · ${await describeLocationControls(page)}`;
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
    // Live JobBKK (Oct 2026) pages results with an Ant radio group of page numbers
    // plus arrow icons, not links. Click the next page number.
    const pager = page.locator('.ant-radio-group').filter({
      has: page.locator('.ant-radio-button-label', { hasText: /^\s*2\s*$/u }),
    }).last();
    const nextNumber = pager.locator('label.ant-radio-button-wrapper').filter({
      has: page.locator('.ant-radio-button-label', { hasText: new RegExp(`^\\s*${pagesScanned + 1}\\s*$`, 'u') }),
    });
    const next = await firstVisibleLocator([
      nextNumber,
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
    await dismissJobbkkOverlays(page);
    await applyPlannedFilter(page, step, report);
    await dismissJobbkkOverlays(page);
  }
  const missing = missingRequiredNormalFilters(plan, report);
  if (missing.includes('position')) {
    const seen = [report.positionSeen, report.keywordSeen].filter(Boolean).join(' / ');
    const box = report.positionBox || report.keywordBox || '';
    throw new Error(`JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันตำแหน่งหรือ Keyword จึงไม่รับผลค้นหาแบบกว้าง${seen ? ` (ชิปที่เห็น: ${seen})` : ' (กล่องตำแหน่งว่าง ไม่มีชิป)'}${box ? ` · โครงกล่อง: ${box}` : ''}`);
  }
  if (missing.includes('province')) {
    throw new Error(`JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันจังหวัดตามใบขอ จึงไม่รับผลค้นหาทั้งประเทศ${report.provinceSeen ? ` (${report.provinceSeen})` : ''}`);
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
