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

  <div class="ant-row ant-form-item-row" multiple readOnly placeholder="ค้นหาชื่อตำแหน่งงาน">
    <div class="ant-select">
      <div class="ant-select-selection-wrap">
        <span>ค้นหาชื่อตำแหน่งงาน</span>
        <input class="ant-select-selection-search-input" placeholder="ค้นหาชื่อตำแหน่งงาน" />
      </div>
    </div>
  </div>
  <div class="ant-select-item-option-content">เจ้าหน้าที่ IT</div>

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

  <button>อายุ</button>
  <div>25</div>

  <button id="search">ค้นหาผู้สมัครงาน</button>
  <div id="count">ผลการค้นหา 0 เรซูเม่</div>
  <div id="results"></div>
  <script>
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.getElementById('promo').remove?.();
      document.getElementById('province-dropdown').style.display = 'none';
    });
    document.getElementById('province').addEventListener('click', () => {
      document.getElementById('province-dropdown').style.display = 'block';
    });
    document.querySelector('#province-dropdown .ant-tree-checkbox').addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-checked', 'true');
      document.getElementById('province').value = 'สมุทรปราการ ทั้งหมด';
    });
    document.getElementById('search').addEventListener('click', () => {
      document.getElementById('count').textContent = 'ผลการค้นหา 1 เรซูเม่';
      document.getElementById('results').innerHTML =
        '<a href="https://www.jobbkk.com/resumes/preview_new/100001">อ่านรายละเอียด</a>';
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
    maxCandidates: 5,
  }, { need: 5 });

  assert.deepEqual(result.report.applied.sort(), [
    'age', 'education', 'jobTypes', 'keyword', 'position', 'province', 'salary',
  ].sort());
  assert.deepEqual(result.pool.map((item) => item.id), ['100001']);
  assert.equal(result.strategy, 'normal');
});
