import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runNormalSearch } from '../src/providers/jobbkk/strategies/normal-search.js';

const FIXTURE = `<!doctype html>
<html lang="th"><body>
  <button class="bg-Primary text-white">Normal Search</button>
  <button>AI SEARCH</button>

  <!-- Live JobBKK (20 Oct 2026): a banner dialog covers the page after Normal Search. -->
  <div role="dialog" data-state="open" id="promo"
       style="position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45)">
    <div class="icon-button" style="position:absolute;top:8px;right:8px">X</div>
  </div>

  <!-- Live JobBKK: resume cards repeat the province wording; never click these. -->
  <p>พื้นที่ที่ต้องการทำงาน : กรุงเทพฯ / ทั้งหมด</p>

  <!-- Live JobBKK: province is a readOnly input that opens an .ant-dropdown tree. -->
  <span class="ant-input-affix-wrapper ant-dropdown-trigger">
    <input id="province" name="province" class="ant-input" placeholder="สถานที่ทำงานทั้งหมด" readonly />
  </span>
  <div class="ant-dropdown" id="province-dropdown" style="display:none">
    <input placeholder="สถานที่ทำงานทั้งหมด" class="ant-input" />
    <div role="treeitem" class="ant-tree-treenode">
      <span class="ant-tree-checkbox" role="checkbox" aria-checked="false" style="display:inline-block;width:16px;height:16px;border:1px solid"></span>
      <span class="ant-tree-title">สมุทรปราการ</span>
    </div>
  </div>

  <!-- Live JobBKK Talent (seen 3 Nov 2026): the position box is an Ant AutoComplete whose text input sits in a
       DIV carrying the search-input class, with an "N/3" counter; chosen chips are drawn as red labels BESIDE the box
       (sibling .mt-3 container, p + "Remove keyword" button), not as .ant-select-selection-item. Suggestions load async. -->
  <div class="rounded-lg border-[1px] border-Border-color p-4">
    <div class="ant-select ant-select-outlined ant-select-auto-complete ant-select-single ant-select-customize-input ant-select-show-search" name="searchJobPosition" api_type="position">
      <div class="ant-select-selector">
        <span class="ant-select-selection-wrap">
          <span class="ant-select-selection-search">
            <div class="ant-select-selection-search-input flex items-center gap-2" role="combobox">
              <input maxlength="80" class="ant-input ant-input-outlined" type="text" value="" id="position-input" />
              <div class="shrink-0">0/80</div>
              <div class="shrink-0" id="position-counter">0/3</div>
            </div>
          </span>
          <span class="ant-select-selection-placeholder">ค้นหาชื่อตำแหน่งงาน</span>
        </span>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap gap-2" id="position-chips"></div>
  </div>
  <div class="ant-select-dropdown" id="position-dropdown" style="display:none">
    <div class="ant-select-item ant-select-item-option ant-select-item-option-active">
      <!-- The planner types the Thai part only ("เจ้าหน้าที่ IT" → "เจ้าหน้าที่"); the dropdown offers that exact chip. -->
      <div class="ant-select-item-option-content">เจ้าหน้าที่</div>
    </div>
  </div>

  <div class="ant-select-selection-wrap">
    <span>ค้นหา Keyword</span>
    <input placeholder="ค้นหา Keyword" />
  </div>
  <div class="ant-select-item-option-content">ขาย</div>

  <button>ประเภทงาน (สาขาอาชีพ)</button>
  <!-- Live JobBKK also tags this wrapper div with the search-input class. -->
  <div class="ant-select-selection-search-input">พิมพ์ค้นหา</div>
  <div>การขาย</div>

  <button>วุฒิการศึกษา</button>
  <span>ต่ำสุด</span>
  <span>สูงสุด</span>
  <div class="ant-select-item-option-content">ปริญญาตรี</div>
  <div class="ant-select-item-option-content">ปริญญาเอก</div>

  <button>เงินเดือน</button>
  <div>25,000</div>
  <div>25000</div>

  <!-- Live JobBKK (3 Nov 2026): the age row is a readonly input with only a placeholder; opening it shows an .ant-dropdown
       with two Ant selects (min/max) whose options are a virtual list of numbers; the chosen range lands in the input's value. -->
  <span class="ant-input-affix-wrapper"><input id="f-age" class="ant-input" placeholder="อายุ" readonly /></span>
  <div class="ant-dropdown" id="age-panel" style="display:none">
    <div>อายุ</div>
    <div class="ant-select" data-bound="min"><div class="ant-select-selector"><span class="ant-select-selection-item">อายุต่ำสุด</span></div></div>
    <div class="ant-select" data-bound="max"><div class="ant-select-selector"><span class="ant-select-selection-item">อายุมากสุด</span></div></div>
  </div>
  <div class="ant-select-dropdown" id="age-list" style="display:none"></div>

  <button id="search">ค้นหาผู้สมัครงาน</button>
  <div id="count">ผลการค้นหา 0 เรซูเม่</div>
  <!-- Live JobBKK: the sort is a custom dropdown showing the chosen order. -->
  <button type="button">เรียงลำดับตาม : อัปเดตล่าสุด</button>
  <div id="results"></div>
  <!-- Live JobBKK: results are paged by an Ant radio group of page numbers. -->
  <div class="ant-radio-group" id="pager" style="display:none">
    <label class="ant-radio-button-wrapper"><span class="ant-radio-button-label">1</span></label>
    <label class="ant-radio-button-wrapper" id="page-2"><span class="ant-radio-button-label">2</span></label>
  </div>
  <script>
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.getElementById('promo').remove?.();
      document.getElementById('province-dropdown').style.display = 'none';
    });
    document.getElementById('province').addEventListener('click', () => {
      document.getElementById('province-dropdown').style.display = 'block';
    });
    // Live JobBKK age row: input opens the panel; each select opens a number list drawn 8 rows at a time (virtual);
    // ArrowDown moves the active row, Enter picks it, and the input shows "min - max".
    const ageState = { min: 'อายุต่ำสุด', max: 'อายุมากสุด', bound: null, active: 0, start: 15, end: 60 };
    const ageInput = document.getElementById('f-age');
    const agePanel = document.getElementById('age-panel');
    const ageList = document.getElementById('age-list');
    const drawAge = () => {
      const from = Math.max(ageState.start, ageState.start + ageState.active - 4);
      let html = '';
      for (let v = from; v < from + 8 && v <= ageState.end; v += 1) {
        const idx = v - ageState.start;
        html += '<div class="ant-select-item ant-select-item-option' + (idx === ageState.active ? ' ant-select-item-option-active' : '') + '" title="' + v + '">'
          + '<div class="ant-select-item-option-content">' + v + '</div></div>';
      }
      ageList.innerHTML = html;
    };
    const pickAge = (value) => {
      ageState[ageState.bound] = String(value);
      agePanel.querySelector('[data-bound="' + ageState.bound + '"] .ant-select-selection-item').textContent = String(value);
      ageInput.value = ageState.min + ' - ' + ageState.max;
      ageList.style.display = 'none';
      ageState.bound = null;
    };
    ageInput.addEventListener('click', () => { agePanel.style.display = agePanel.style.display === 'none' ? 'block' : 'none'; });
    for (const sel of agePanel.querySelectorAll('.ant-select-selector')) {
      sel.addEventListener('click', () => {
        ageState.bound = sel.parentElement.getAttribute('data-bound');
        ageState.active = 0;
        ageList.style.display = 'block';
        drawAge();
      });
    }
    ageList.addEventListener('click', (event) => {
      const row = event.target.closest('.ant-select-item-option');
      if (row) pickAge(row.getAttribute('title'));
    });
    document.addEventListener('keydown', (event) => {
      if (ageList.style.display === 'none') return;
      if (event.key === 'ArrowDown') { ageState.active = Math.min(ageState.end - ageState.start, ageState.active + 1); drawAge(); }
      if (event.key === 'Enter') pickAge(ageState.start + ageState.active);
      if (event.key === 'Escape') { ageList.style.display = 'none'; agePanel.style.display = 'none'; }
    });
    // Live JobBKK: suggestions arrive from the server, so the dropdown opens ~600ms after typing; Enter picks the active one.
    document.getElementById('position-input').addEventListener('input', (event) => {
      if (!event.target.value) return;
      setTimeout(() => { document.getElementById('position-dropdown').style.display = 'block'; }, 600);
    });
    document.getElementById('position-input').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const active = document.querySelector('#position-dropdown .ant-select-item-option-active .ant-select-item-option-content');
      if (active && document.getElementById('position-dropdown').style.display !== 'none') active.click();
    });
    // Live JobBKK: picking a position/keyword option adds a chip for that box.
    for (const option of document.querySelectorAll('.ant-select-item-option-content')) {
      option.addEventListener('click', () => {
        const label = option.textContent.trim();
        if (!['เจ้าหน้าที่', 'ขาย'].includes(label)) return;
        const needle = label === 'ขาย' ? 'ค้นหา Keyword' : 'ค้นหาชื่อตำแหน่งงาน';
        const chip = document.createElement('span');
        chip.className = 'ant-select-selection-item';
        chip.textContent = label;
        if (needle === 'ค้นหาชื่อตำแหน่งงาน') {
          // JobBKK: chip drawn beside the box, counter steps up, dropdown closes.
          const item = document.createElement('div');
          item.className = 'flex max-w-full items-start gap-2 rounded-md bg-Old-ci-red';
          item.innerHTML = '<p class="!mb-0">' + label + '</p><button type="button" aria-label="Remove keyword">x</button>';
          document.getElementById('position-chips').appendChild(item);
          const counter = document.getElementById('position-counter');
          counter.textContent = (Number(counter.textContent.split('/')[0]) + 1) + '/3';
          document.getElementById('position-dropdown').style.display = 'none';
          document.getElementById('position-input').value = '';
          return;
        }
        const wrap = [...document.querySelectorAll('.ant-select-selection-wrap')]
          .find((el) => el.querySelector('input')?.placeholder === needle);
        wrap.appendChild(chip);
      });
    }
    document.querySelector('#province-dropdown .ant-tree-checkbox').addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-checked', 'true');
      document.getElementById('province').value = 'สมุทรปราการ ทั้งหมด';
    });
    document.getElementById('search').addEventListener('click', () => {
      document.getElementById('count').textContent = 'ผลการค้นหา 1 เรซูเม่';
      document.getElementById('results').innerHTML =
        '<a href="https://www.jobbkk.com/resumes/preview_new/100001">อ่านรายละเอียด</a>';
      document.getElementById('pager').style.display = 'block';
    });
    document.getElementById('page-2').addEventListener('click', () => {
      document.getElementById('results').innerHTML =
        '<a href="https://www.jobbkk.com/resumes/preview_new/100002">อ่านรายละเอียด</a>';
    });
  </script>
</body></html>`;

test('Talent Normal Search fills every requested filter then reads a Resume ID', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage();
  await page.setContent(FIXTURE, { waitUntil: 'domcontentloaded' });

  const result = await runNormalSearch(page, {
    position: 'เจ้าหน้าที่ IT',
    keyword: 'ขาย',
    industry: 'การขาย',
    province: 'สมุทรปราการ',
    education: 'ปริญญาตรี',
    salaryMin: '25000',
    salaryMax: '25000',
    ageMin: '25',
    ageMax: '50',
    maxCandidates: 5,
  }, { need: 5 });

  assert.deepEqual(result.report.applied.sort(), [
    'age', 'education', 'jobTypes', 'keyword', 'position', 'province', 'salary',
  ].sort());
  assert.equal(result.report.ageSeen, '25 - 50', 'age row shows the chosen range');
  assert.deepEqual(result.pool.map((item) => item.id), ['100001', '100002']);
  assert.equal(result.pagesScanned, 2);
  assert.equal(result.latest.method, 'talent_sort_label');
  assert.equal(result.strategy, 'normal');
});

// Live JobBKK (1 Nov 2026): the province tree draws only the ~10 rows in view.
// Provinces outside Bangkok sit under a closed region; after expanding it the
// wanted province is still below the fold until the inner list scrolls.
const VIRTUAL_TREE = `<div class="ant-dropdown" id="province-dropdown" style="display:none">
    <input placeholder="สถานที่ทำงานทั้งหมด" class="ant-input" />
    <div class="ant-tree"><div class="ant-tree-list">
      <div class="ant-tree-list-holder" id="holder" style="height:240px;overflow-y:hidden">
        <div id="spacer" style="position:relative"><div id="rows" style="position:absolute;left:0;right:0"></div></div>
      </div>
    </div></div>
  </div>`;
const VIRTUAL_TREE_SCRIPT = `
    const ROW = 24;
    const nearBangkok = ['กรุงเทพและปริมณฑล', 'กรุงเทพมหานคร', 'นครปฐม', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร'];
    const central = ['กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครสวรรค์', 'ลพบุรี', 'สระบุรี', 'สิงห์บุรี', 'อ่างทอง',
      'อุทัยธานี', 'เพชรบูรณ์', 'พิจิตร', 'พิษณุโลก', 'สุโขทัย', 'อุตรดิตถ์', 'พระนครศรีอยุธยา'];
    let expanded = false;
    const holder = document.getElementById('holder');
    function render() {
      const names = expanded ? [...nearBangkok, 'ภาคกลาง', ...central] : [...nearBangkok, 'ภาคกลาง'];
      document.getElementById('spacer').style.height = names.length * ROW + 'px';
      const start = Math.floor(holder.scrollTop / ROW);
      const rows = document.getElementById('rows');
      rows.style.top = start * ROW + 'px';
      rows.innerHTML = names.slice(start, start + 10).map((name) => {
        const switcher = name === 'ภาคกลาง'
          ? '<span class="ant-tree-switcher ant-tree-switcher_' + (expanded ? 'open' : 'close') + '" style="display:inline-block;width:12px;height:12px">▸</span>'
          : '';
        return '<div role="treeitem" class="ant-tree-treenode" style="height:' + ROW + 'px">' + switcher
          + '<span class="ant-tree-checkbox" role="checkbox" aria-checked="false" style="display:inline-block;width:16px;height:16px;border:1px solid"></span>'
          + '<span class="ant-tree-title">' + name + '</span></div>';
      }).join('');
    }
    holder.addEventListener('scroll', render);
    document.getElementById('rows').addEventListener('click', (event) => {
      if (event.target.classList.contains('ant-tree-switcher_close')) { expanded = true; render(); return; }
      if (!event.target.classList.contains('ant-tree-checkbox')) return;
      event.target.setAttribute('aria-checked', 'true');
      const name = event.target.parentElement.querySelector('.ant-tree-title').textContent;
      document.getElementById('province').value = name + ' ทั้งหมด';
    });
    render();`;

test('Province under a closed region is found by scrolling the drawn-in-view tree', async (t) => {
  const fixture = FIXTURE
    .replace(/<div class="ant-dropdown" id="province-dropdown"[\s\S]*?<\/div>\n  <\/div>/, VIRTUAL_TREE)
    .replace(/document\.querySelector\('#province-dropdown \.ant-tree-checkbox'\)[\s\S]*?\}\);\n/, VIRTUAL_TREE_SCRIPT + '\n');
  assert.ok(fixture.includes('id="holder"') && fixture.includes('const central'), 'fixture rewrite applied');
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage();
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' });

  const result = await runNormalSearch(page, { position: 'เจ้าหน้าที่ IT', province: 'พระนครศรีอยุธยา', maxCandidates: 5 }, { need: 5 });

  assert.ok(result.report.applied.includes('province'), result.report.provinceSeen);
  assert.equal(await page.inputValue('#province'), 'พระนครศรีอยุธยา ทั้งหมด');
});

test('Province not in the tree records how the dropdown is built', async (t) => {
  const fixture = FIXTURE
    .replace(/<div class="ant-dropdown" id="province-dropdown"[\s\S]*?<\/div>\n  <\/div>/, VIRTUAL_TREE)
    .replace(/document\.querySelector\('#province-dropdown \.ant-tree-checkbox'\)[\s\S]*?\}\);\n/, VIRTUAL_TREE_SCRIPT + '\n');
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage();
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' });

  await assert.rejects(
    runNormalSearch(page, { position: 'เจ้าหน้าที่ IT', province: 'บึงกาฬ', maxCandidates: 5 }, { need: 5 }),
    (error) => {
      assert.match(error.message, /เลื่อน \d+\/\d+ ครั้ง · โครงรายการ: ช่องค้น .* · แถว 10 .*virtual มี.*กล่อง div\.ant-tree-list-holder hidden \d+\/\d+/);
      return true;
    },
  );
});

// 3 พ.ย. 2569: เว็บไม่รับชื่อตำแหน่ง (พิมพ์แล้วไม่มีชิปขึ้นในกล่อง) → ต้องหยุด ไม่รับผลค้นทั้งจังหวัด
// เดิมนับว่า "ติด" ทันทีที่พิมพ์เสร็จ ใบคนขับรถ 2 ใบเปิดดู 119 คน ไม่มีคนขับรถเลย
test('Normal Search refuses to search when the position chip never appears', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage();
  const fixture = FIXTURE.replace("['เจ้าหน้าที่', 'ขาย']", '[]');
  assert.notEqual(fixture, FIXTURE, 'fixture rewrite applied');
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' });

  await assert.rejects(
    runNormalSearch(page, { position: 'พนักงานขับรถ', province: 'สมุทรปราการ', maxCandidates: 5 }, { need: 5 }),
    /JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันตำแหน่ง.*กล่องตำแหน่งว่าง/u,
  );
});

// 4 พ.ย. 2569 (รันจริงบน RM009): รายการแนะนำขึ้น เลือกแล้ว แต่บอทรายงาน "ตัวนับ 0 · ปุ่มลบข้างกล่อง 0"
// สาเหตุ 1: ในกล่องมีตัวนับตัวอักษร "0/80" อยู่ก่อนตัวนับชิป "0/3" — โค้ดเดิมอ่านตัวนับตัวอักษร (ช่องถูกล้างหลังเลือก จึงเป็น 0 ตลอด)
// สาเหตุ 2: ชิปอาจวาดไว้นอกกรอบที่ครอบกล่องชั้นเดียว — โค้ดเดิมไม่ไล่หาขึ้นไป
test('Position chip drawn one level further out is still seen', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage();
  await page.setContent(FIXTURE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const chips = document.getElementById('position-chips');
    const frame = chips.parentElement;
    const section = document.createElement('section');
    frame.replaceWith(section);
    section.append(frame, chips);
  });

  const result = await runNormalSearch(page, { position: 'เจ้าหน้าที่ IT', province: 'สมุทรปราการ', maxCandidates: 5 }, { need: 5 });
  assert.ok(result.report.applied.includes('position'), result.report.positionBox);
});

test('Position counts as applied when only the chip counter moves', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close().catch(() => {});
  });
  const page = await browser.newPage();
  await page.setContent(FIXTURE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    // ไม่มีป้ายชิปให้เห็นเลย เหลือแต่ตัวนับ "N/3" ที่ขยับ
    const hidden = document.createElement('div');
    const original = document.getElementById.bind(document);
    document.getElementById = (id) => (id === 'position-chips' ? hidden : original(id));
  });

  const result = await runNormalSearch(page, { position: 'เจ้าหน้าที่ IT', province: 'สมุทรปราการ', maxCandidates: 5 }, { need: 5 });
  assert.ok(result.report.applied.includes('position'), result.report.positionBox);
});
