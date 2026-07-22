import { chromium } from 'playwright';

/**
 * สร้างโปสเตอร์รับสมัครงาน SO WORK! (1080×1080) จากข้อมูล structured + รูปคน (AI, พื้นหลังใส)
 * โดยเรนเดอร์ HTML → PNG ด้วย Playwright chromium (worker มี playwright อยู่แล้ว).
 * ตัวหนังสือไทยคมชัด 100% เพราะเป็น text จริงบน template ไม่ใช่ AI วาด.
 *
 * ไม่มีรูปคน (personDataUri = null) ก็ได้ — เลย์เอาต์จะขยายข้อความเต็มแทน (fail-soft).
 * ต้องมีฟอนต์ไทยบนเครื่อง worker (Mac มี Thonburi/Sukhumvit; scraper เรนเดอร์หน้าไทยได้อยู่แล้ว).
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function buildHtml(f = {}, personDataUri = null) {
  const title = esc(f.title || 'เปิดรับสมัครงาน');
  const badge = esc(f.badge || 'เปิดรับสมัครด่วน');
  const meta = [f.location, f.worktime].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ');
  const salaryTotal = esc(f.salaryTotal || '');
  const salaryBreakdown = esc(f.salaryBreakdown || '');
  const quals = (Array.isArray(f.qualifications) ? f.qualifications : []).slice(0, 6);
  const benefits = (Array.isArray(f.benefits) ? f.benefits : []).slice(0, 4);
  const contactLine = esc(f.contactLine || '');

  const person = personDataUri
    ? `<img src="${personDataUri}" style="position:absolute;right:0;bottom:0;height:104%;object-fit:contain;object-position:bottom right;" alt=""/>`
    : '';

  const qualHtml = quals
    .map((q) => `<div style="display:flex;gap:10px;font-size:26px;color:#1d1d1f;line-height:1.35;"><span style="color:#e41c24;">✓</span><span>${esc(q)}</span></div>`)
    .join('');

  const benefitHtml = benefits
    .map((b) => `<span style="background:#fff0f0;color:#b0140f;font-size:22px;font-weight:500;padding:8px 20px;border-radius:999px;">${esc(b)}</span>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Kanit','Sukhumvit Set','Thonburi','Sarabun','Tahoma',sans-serif;}
    #poster{width:1080px;height:1080px;background:#fff;position:relative;overflow:hidden;}
  </style></head><body>
  <div id="poster">
    <div style="position:relative;height:500px;background:linear-gradient(120deg,#b0140f 0%,#e41c24 55%,#ff3b30 100%);overflow:hidden;">
      ${person}
      <div style="position:relative;padding:52px 56px 0;color:#fff;max-width:660px;">
        <div style="display:flex;align-items:center;gap:16px;font-weight:700;font-size:50px;letter-spacing:-1px;">
          <span style="background:#fff;color:#e41c24;padding:2px 20px;border-radius:16px;">SO</span> WORK!
        </div>
        <div style="margin-top:24px;display:inline-block;background:#1d1d1f;color:#fff;font-size:25px;font-weight:500;padding:9px 28px;border-radius:999px;">${badge}</div>
        <div style="margin-top:20px;font-size:66px;font-weight:700;line-height:1.03;text-shadow:0 2px 12px rgba(0,0,0,.15);">${title}</div>
        <div style="margin-top:18px;font-size:26px;opacity:.96;">📍 ${meta}</div>
      </div>
    </div>

    <div style="padding:0 56px;margin-top:-60px;position:relative;">
      <div style="background:#1d1d1f;color:#fff;border-radius:26px;padding:26px 38px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 16px 44px rgba(0,0,0,.22);">
        <div style="flex-shrink:0;">
          <div style="font-size:22px;opacity:.7;">รายได้รวม</div>
          <div style="font-size:66px;font-weight:700;line-height:1;color:#ff6b64;">${salaryTotal}</div>
        </div>
        <div style="text-align:right;font-size:22px;line-height:1.45;opacity:.92;max-width:520px;">${salaryBreakdown}</div>
      </div>
    </div>

    <div style="padding:32px 56px 0;">
      <div style="font-size:25px;font-weight:600;color:#e41c24;letter-spacing:1px;">คุณสมบัติ</div>
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px 36px;">${qualHtml}</div>
      <div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap;">${benefitHtml}</div>
    </div>

    <div style="position:absolute;left:56px;right:56px;bottom:40px;background:#f7f7f8;border:1px solid #e6e6eb;border-radius:22px;padding:22px 38px;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:25px;color:#6e6e73;">สนใจสมัคร ทักเลย</div>
      <div style="display:flex;align-items:center;gap:14px;font-weight:600;font-size:32px;color:#1d1d1f;"><span style="background:#06c755;color:#fff;font-size:21px;padding:6px 15px;border-radius:10px;">LINE</span> ${contactLine}</div>
    </div>
  </div>
  </body></html>`;
}

/**
 * @param {object} fields ข้อมูลโปสเตอร์ (title, salaryTotal, qualifications[], ...)
 * @param {string|null} personDataUri  data:image/png;base64,... (พื้นหลังใส) หรือ null
 * @returns {Promise<{bytes: Buffer, mime: string} | null>}
 */
export async function renderPoster(fields, personDataUri = null) {
  if (!fields || !fields.title) return null;
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    await page.setContent(buildHtml(fields, personDataUri), { waitUntil: 'networkidle', timeout: 30_000 });
    const el = await page.$('#poster');
    const bytes = await el.screenshot({ type: 'png' });
    return { bytes, mime: 'image/png' };
  } catch (e) {
    console.warn(`  [poster] เรนเดอร์ไม่สำเร็จ: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
