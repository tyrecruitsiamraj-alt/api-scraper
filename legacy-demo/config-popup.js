/**
 * Local config popup — shown before login. User clicks Start once.
 */

import { normalizePlatformMode, platformLabel, resolvePlatforms } from './core/platform-resolve.js';

const PLATFORM_BADGE = {
  jobthai: { label: 'JobThai', color: '#c2410c', bg: '#ffedd5', border: '#fdba74' },
  jobbkk: { label: 'JobBKK', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  both: { label: 'JobBKK + JobThai', color: '#0f766e', bg: '#ccfbf1', border: '#5eead4' },
};

function resolvePlatformBadge(platformMode) {
  const mode = normalizePlatformMode(platformMode);
  return PLATFORM_BADGE[mode] ?? PLATFORM_BADGE.jobbkk;
}

export function buildConfigPopupHtml(defaultMaxCandidates = 15, defaultPlatformMode = 'jobbkk') {
  const mode = normalizePlatformMode(defaultPlatformMode);
  const badge = resolvePlatformBadge(mode);
  const checked = (value) => (mode === value ? 'checked' : '');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>Talent Scrape — ตั้งค่าการค้นหา</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; background: #f1f5f9; padding-bottom: 88px; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 20px 16px; }
    h1 { margin: 0 0 6px; font-size: 1.4rem; color: #0f172a; }
    p.sub { color: #475569; margin: 0 0 18px; }
    .card { background: #fff; border-radius: 12px; padding: 18px; margin-bottom: 14px; box-shadow: 0 1px 8px rgba(0,0,0,0.06); }
    h2 { font-size: 1rem; margin: 0 0 12px; color: #1d4ed8; }
    label { display: block; margin: 10px 0 4px; font-weight: 600; font-size: 0.9rem; }
    input, select { width: 100%; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .hint { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    .footer {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
      background: #fff; border-top: 2px solid #16a34a; padding: 14px 16px;
      display: flex; justify-content: center; box-shadow: 0 -4px 16px rgba(0,0,0,0.1);
    }
    #btnStart {
      width: 100%; max-width: 420px; padding: 14px 20px; border: none; border-radius: 10px;
      background: #16a34a; color: #fff; font-size: 1.1rem; font-weight: 700; cursor: pointer;
    }
    #btnStart:disabled { opacity: 0.55; cursor: not-allowed; }
    #status { text-align: center; margin-top: 10px; font-weight: 600; color: #334155; }
    .platform-badge {
      display: inline-block; padding: 6px 14px; border-radius: 999px; font-weight: 700;
      font-size: 0.95rem; margin-bottom: 12px; border: 2px solid ${badge.border};
      color: ${badge.color}; background: ${badge.bg};
    }
    .platform-hint { font-size: 0.85rem; color: #64748b; margin: 0 0 14px; }
    .platform-option { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 0.95rem; }
    .platform-option input { width: auto; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="platform-badge">จะ Scrape: ${badge.label}</div>
    <p class="platform-hint">เลือก platform ด้านล่าง (ค่าเริ่มต้นจาก .env <strong>SCRAPE_PLATFORM=${mode}</strong>)</p>
    <h1>ตั้งค่าการค้นหา Resume</h1>
    <p class="sub">กรอกเงื่อนไขให้ครบก่อน แล้วกด <strong>Start</strong> — หลังจากกด Start ระบบจึงจะ login, กรอกฟิลเตอร์, ค้นหา, ดึงข้อมูล และดาวน์โหลดไฟล์ให้อัตโนมัติ</p>

    <div class="card">
      <h2>เลือก Platform</h2>
      <label class="platform-option"><input type="radio" name="platformMode" value="jobbkk" ${checked('jobbkk')}> JobBKK เท่านั้น</label>
      <label class="platform-option"><input type="radio" name="platformMode" value="jobthai" ${checked('jobthai')}> JobThai เท่านั้น</label>
      <label class="platform-option"><input type="radio" name="platformMode" value="both" ${checked('both')}> ทั้ง JobBKK และ JobThai (รันต่อเนื่อง)</label>
    </div>

    <div class="card">
      <h2>คำค้นหาหลัก</h2>
      <label for="position">ชื่อตำแหน่งงาน (position)</label>
      <input id="position" type="text" placeholder="เช่น นักจัดซื้อ, ประชาสัมพันธ์" />
      <label for="keyword">Keyword</label>
      <input id="keyword" type="text" placeholder="คำค้นเพิ่มเติม (ไม่บังคับ)" />
      <label for="maxCandidates">จำนวน Resume ที่ต้องการดึง</label>
      <input id="maxCandidates" type="number" min="1" max="100" value="${defaultMaxCandidates}" />
      <div class="hint">ค่าเริ่มต้น ${defaultMaxCandidates} — สูงสุด 100 รายการ</div>
    </div>

    <div class="card">
      <h2>ตัวกรองเพิ่มเติม (ไม่บังคับ)</h2>
      <label for="province">จังหวัด / พื้นที่</label>
      <input id="province" type="text" placeholder="เช่น กรุงเทพมหานคร" />
      <div class="grid">
        <div>
          <label for="salaryMin">เงินเดือนต่ำสุด (บาท)</label>
          <input id="salaryMin" type="text" />
        </div>
        <div>
          <label for="salaryMax">เงินเดือนสูงสุด (บาท)</label>
          <input id="salaryMax" type="text" />
        </div>
        <div>
          <label for="ageMin">อายุต่ำสุด</label>
          <input id="ageMin" type="text" />
        </div>
        <div>
          <label for="ageMax">อายุสูงสุด</label>
          <input id="ageMax" type="text" />
        </div>
      </div>
      <label for="gender">เพศ</label>
      <select id="gender">
        <option value="ไม่ระบุ">ไม่ระบุ</option>
        <option value="ชาย">ชาย</option>
        <option value="หญิง">หญิง</option>
      </select>
      <label for="education">ระดับการศึกษา / วุฒิ</label>
      <input id="education" type="text" placeholder="เช่น ปริญญาตรี" />
      <label for="experience">ประสบการณ์</label>
      <input id="experience" type="text" placeholder="เช่น 2 ปี" />
      <label for="availableStart">ระยะเวลาเริ่มงาน</label>
      <select id="availableStart">
        <option value="ไม่ระบุ">ไม่ระบุ</option>
        <option value="ทันที">ทันที</option>
        <option value="ภายใน 7 วัน">ภายใน 7 วัน</option>
        <option value="ภายใน 15 วัน">ภายใน 15 วัน</option>
        <option value="ภายใน 30 วัน">ภายใน 30 วัน</option>
      </select>
      <label for="drivingLicense">ใบขับขี่</label>
      <select id="drivingLicense">
        <option value="ไม่ระบุ">ไม่ระบุ</option>
        <option value="มี">มี</option>
        <option value="ไม่มี">ไม่มี</option>
      </select>
    </div>
    <p id="status"></p>
  </div>
  <div class="footer">
    <button type="button" id="btnStart">Start — เริ่มค้นหาและดึงข้อมูล</button>
  </div>
  <script>
    function val(id) { return document.getElementById(id).value.trim(); }
    function readConfig() {
      const platformMode = document.querySelector('input[name="platformMode"]:checked')?.value || 'jobbkk';
      return {
        platformMode,
        position: val('position'),
        keyword: val('keyword'),
        maxCandidates: Math.min(100, Math.max(1, parseInt(document.getElementById('maxCandidates').value, 10) || 1)),
        province: val('province'),
        salaryMin: val('salaryMin'),
        salaryMax: val('salaryMax'),
        ageMin: val('ageMin'),
        ageMax: val('ageMax'),
        gender: document.getElementById('gender').value,
        education: val('education'),
        experience: val('experience'),
        availableStart: document.getElementById('availableStart').value,
        drivingLicense: document.getElementById('drivingLicense').value,
      };
    }
    document.getElementById('btnStart').addEventListener('click', async () => {
      const status = document.getElementById('status');
      const btn = document.getElementById('btnStart');
      btn.disabled = true;
      try {
        if (typeof window.submitScrapeConfig !== 'function') throw new Error('Scraper bridge not ready');
        await window.submitScrapeConfig(readConfig());
        status.textContent = 'ส่งค่าแล้ว — บอทกำลังทำงาน...';
      } catch (e) {
        btn.disabled = false;
        status.textContent = e.message;
        alert(e.message);
      }
    });
  </script>
</body>
</html>`;
}

export function readConfigFromPopupForm(popupPage) {
  return popupPage.evaluate(() => {
    const val = (id) => document.getElementById(id).value.trim();
    const platformMode = document.querySelector('input[name="platformMode"]:checked')?.value || 'jobbkk';
    return {
      platformMode,
      position: val('position'),
      keyword: val('keyword'),
      maxCandidates: Math.min(100, Math.max(1, parseInt(document.getElementById('maxCandidates').value, 10) || 1)),
      province: val('province'),
      salaryMin: val('salaryMin'),
      salaryMax: val('salaryMax'),
      ageMin: val('ageMin'),
      ageMax: val('ageMax'),
      gender: document.getElementById('gender').value,
      education: val('education'),
      experience: val('experience'),
      availableStart: document.getElementById('availableStart').value,
      drivingLicense: document.getElementById('drivingLicense').value,
    };
  });
}

export async function showConfigPopup(context, defaultMaxCandidates, defaultPlatformMode = 'jobbkk') {
  let settled = null;

  await context.exposeFunction('submitScrapeConfig', async (config) => {
    settled = config;
  });

  const mode = normalizePlatformMode(defaultPlatformMode);
  const popupPage = await context.newPage();
  await popupPage.setContent(buildConfigPopupHtml(defaultMaxCandidates, mode), { waitUntil: 'load' });
  await popupPage.bringToFront();

  const platforms = resolvePlatforms(mode, mode);
  const badge = resolvePlatformBadge(mode);
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  SCRAPE PLATFORM (default): ${badge.label.padEnd(18)}║`);
  console.log(`║  .env SCRAPE_PLATFORM=${mode.padEnd(26)}║`);
  console.log(`║  จะรัน: ${platforms.map(platformLabel).join(' → ').padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('=== ตั้งค่าการค้นหา ===');
  console.log('เลือก platform + กรอกเงื่อนไข แล้วกดปุ่ม Start สีเขียว');
  console.log('(ยังไม่ login — จะเริ่ม login หลังกด Start เท่านั้น)');
  console.log('');

  return { popupPage, readForm: () => readConfigFromPopupForm(popupPage), getSettled: () => settled };
}

/** Popup once — returns criteria, workPage, and platform list to run. */
export async function collectSharedCriteria(context, defaultMaxCandidates, envPlatform = 'jobbkk') {
  const popupHandle = await showConfigPopup(context, defaultMaxCandidates, envPlatform);
  const { criteria, workPage } = await resolveConfigPopup(popupHandle, { reusePage: true });
  const platforms = resolvePlatforms(criteria.platformMode, envPlatform);
  const { platformMode, ...rest } = criteria;
  return { criteria: rest, workPage, platforms, platformMode };
}

export async function resolveConfigPopup({ popupPage, getSettled }, { reusePage = true } = {}) {
  const config = await new Promise((resolve, reject) => {
    const timeoutMs = 30 * 60 * 1000;
    const timeout = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('รอการกด Start นานเกิน 30 นาที'));
    }, timeoutMs);

    const poll = setInterval(() => {
      const cfg = getSettled();
      if (cfg) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve(cfg);
      }
    }, 200);
  });

  if (reusePage) {
    return { criteria: config, workPage: popupPage };
  }

  await popupPage.close().catch(() => {});
  return { criteria: config, workPage: null };
}
