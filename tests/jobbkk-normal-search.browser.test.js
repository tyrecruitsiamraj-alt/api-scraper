import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runNormalSearch } from '../src/providers/jobbkk/strategies/normal-search.js';

const FIXTURE = `<!doctype html>
<html lang="th"><body>
  <button class="bg-Primary text-white">Normal Search</button>
  <button>AI SEARCH</button>

  <div class="ant-select-selection-wrap">
    <span>ค้นหาชื่อตำแหน่งงาน</span>
    <input placeholder="ค้นหาชื่อตำแหน่งงาน" />
  </div>
  <div class="ant-select-item-option-content">เจ้าหน้าที่ IT</div>

  <div class="ant-select-selection-wrap">
    <span>ค้นหา Keyword</span>
    <input placeholder="ค้นหา Keyword" />
  </div>
  <div class="ant-select-item-option-content">ขาย</div>

  <button>ประเภทงาน (สาขาอาชีพ)</button>
  <div>การขาย</div>

  <button>สถานที่ทำงานทั้งหมด</button>
  <div>สมุทรปราการ</div>

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
