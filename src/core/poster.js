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

const POSTER_DIRECTIONS = new Set(['bold-local', 'human-editorial', 'tech-signal']);

/**
 * เลือก visual direction จากเทรนด์ที่เปิดอยู่ก่อน แล้ว fallback ตาม Job Family:
 * A งานบริการ/ภาพลักษณ์ → human editorial
 * B งานเทคนิค          → tech signal
 * C-F งาน volume/frontline → bold local (อ่านเร็วใน feed)
 */
export function resolvePosterDirection(f = {}) {
  const requested = String(f.visualDirection ?? '').trim();
  if (POSTER_DIRECTIONS.has(requested)) return requested;

  const trendText = (Array.isArray(f.trendLabels) ? f.trendLabels : [])
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (/(?:human|authentic|อบอุ่น|เป็นกันเอง|คนจริง|connection|สัมผัส|employer brand)/iu.test(trendText)) {
    return 'human-editorial';
  }
  if (/(?:tech|digital|future|industrial|grid|เทคโนโลยี|อนาคต|อุตสาหกรรม)/iu.test(trendText)) {
    return 'tech-signal';
  }
  if (/(?:local|ท้องถิ่น|ชุมชน|ไทย|สีจัด|bold|สนุก|playful)/iu.test(trendText)) {
    return 'bold-local';
  }

  const family = String(f.jobFamily ?? '').trim().toUpperCase();
  if (family === 'A') return 'human-editorial';
  if (family === 'B') return 'tech-signal';
  return 'bold-local';
}

function buildHtml(f = {}, personDataUri = null) {
  const title = esc(f.title || 'เปิดรับสมัครงาน');
  const badge = esc(f.badge || 'เปิดรับสมัคร');
  const location = esc(f.location || '');
  const worktime = esc(f.worktime || '');
  const salaryTotal = esc(f.salaryTotal || '');
  const salaryBreakdown = esc(f.salaryBreakdown || '');
  const quals = (Array.isArray(f.qualifications) ? f.qualifications : []).slice(0, 6);
  const benefits = (Array.isArray(f.benefits) ? f.benefits : []).slice(0, 4);
  const contactLine = esc(f.contactLine || '');
  const titleSize = title.length > 28 ? 59 : title.length > 18 ? 68 : 78;
  const direction = resolvePosterDirection(f);

  const person = personDataUri
    ? `<div class="portrait">
        <div class="portrait-arch"></div>
        <img src="${personDataUri}" alt=""/>
      </div>`
    : '';

  const qualHtml = quals
    .map((q, i) => `<div class="qual">
        <span class="qual-no">${String(i + 1).padStart(2, '0')}</span>
        <span>${esc(q)}</span>
      </div>`)
    .join('');

  const benefitHtml = benefits
    .map((b) => `<span class="benefit">${esc(b)}</span>`)
    .join('');

  const metaHtml = [
    location ? `<div class="meta"><span class="meta-icon">⌖</span><span>${location}</span></div>` : '',
    worktime ? `<div class="meta"><span class="meta-icon">◷</span><span>${worktime}</span></div>` : '',
  ].filter(Boolean).join('');

  const salaryHtml = salaryTotal || salaryBreakdown
    ? `<div class="salary-card">
        <div>
          <div class="eyebrow">รายได้รวม</div>
          ${salaryTotal ? `<div class="salary">${salaryTotal}</div>` : ''}
        </div>
        ${salaryBreakdown ? `<div class="salary-note">${salaryBreakdown}</div>` : ''}
      </div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Kanit','Sukhumvit Set','Thonburi','Sarabun','Tahoma',sans-serif;}
    body{background:#ddd;}
    #poster{width:1080px;height:1080px;background:#f6f5f2;position:relative;overflow:hidden;color:#17171a;}
    .hero{height:605px;position:relative;overflow:hidden;background:linear-gradient(132deg,#a90f17 0%,#e51d28 61%,#ff4545 100%);}
    .hero:before{content:'';position:absolute;width:560px;height:560px;border:1px solid rgba(255,255,255,.18);border-radius:50%;right:-160px;top:-210px;}
    .hero:after{content:'';position:absolute;width:310px;height:310px;border:70px solid rgba(255,255,255,.055);border-radius:50%;left:-180px;bottom:-190px;}
    .brand{position:absolute;left:56px;top:44px;z-index:3;display:flex;align-items:center;gap:14px;color:#fff;font-size:38px;font-weight:750;letter-spacing:-1px;}
    .brand-mark{display:inline-flex;align-items:center;justify-content:center;width:82px;height:60px;border-radius:18px;background:#fff;color:#e51d28;font-size:36px;letter-spacing:-2px;}
    .brand-sub{font-size:14px;font-weight:500;letter-spacing:2.6px;opacity:.72;margin-left:8px;margin-top:7px;}
    .hero-copy{position:absolute;left:56px;top:142px;width:600px;color:#fff;z-index:3;}
    .badge{display:inline-flex;align-items:center;gap:10px;padding:9px 18px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:rgba(72,0,5,.22);font-size:19px;font-weight:600;letter-spacing:.2px;}
    .badge-dot{width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 0 5px rgba(255,255,255,.14);}
    .title{margin-top:20px;max-width:590px;font-size:${titleSize}px;font-weight:760;line-height:.98;letter-spacing:-2px;text-wrap:balance;text-shadow:0 4px 22px rgba(89,0,5,.18);}
    .meta-list{margin-top:22px;display:flex;flex-direction:column;gap:7px;max-width:580px;}
    .meta{display:flex;align-items:flex-start;gap:10px;font-size:21px;line-height:1.25;color:rgba(255,255,255,.92);}
    .meta-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 24px;border-radius:50%;background:rgba(255,255,255,.15);font-size:16px;}
    .portrait{position:absolute;right:0;top:0;width:480px;height:605px;z-index:2;overflow:hidden;}
    .portrait-arch{position:absolute;right:40px;bottom:0;width:370px;height:500px;border-radius:200px 200px 0 0;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.18);}
    .portrait img{position:absolute;right:-52px;bottom:-278px;height:850px;width:auto;object-fit:contain;filter:drop-shadow(-16px 20px 24px rgba(80,0,5,.24));}
    .salary-card{position:absolute;left:56px;bottom:28px;z-index:4;width:570px;min-height:124px;border-radius:24px;background:#fff;color:#17171a;padding:22px 26px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:28px;box-shadow:0 20px 48px rgba(81,0,4,.22);}
    .eyebrow{font-size:16px;font-weight:650;letter-spacing:1.5px;color:#8a8a8f;text-transform:uppercase;}
    .salary{font-size:52px;line-height:1;font-weight:800;letter-spacing:-1px;color:#e51d28;margin-top:3px;white-space:nowrap;}
    .salary-note{font-size:18px;line-height:1.38;color:#535358;border-left:1px solid #e5e5e7;padding-left:26px;}
    .content{height:475px;padding:42px 56px 34px;background:#f6f5f2;display:grid;grid-template-columns:1fr 274px;gap:38px;}
    .section-kicker{font-size:15px;font-weight:750;letter-spacing:2px;color:#e51d28;}
    .section-title{font-size:32px;font-weight:750;letter-spacing:-.7px;margin-top:2px;}
    .qual-grid{margin-top:23px;display:grid;grid-template-columns:1fr 1fr;column-gap:30px;row-gap:20px;}
    .qual{display:grid;grid-template-columns:37px 1fr;gap:12px;align-items:start;font-size:20px;line-height:1.3;color:#29292d;}
    .qual-no{display:flex;align-items:center;justify-content:center;width:37px;height:28px;border-radius:9px;background:#ffe3e4;color:#c91520;font-size:13px;font-weight:800;letter-spacing:.4px;}
    .benefits{margin-top:27px;display:flex;gap:10px;flex-wrap:wrap;min-height:38px;}
    .benefit{padding:8px 15px;border-radius:999px;background:#fff;border:1px solid #e6e3df;color:#4b4b50;font-size:16px;font-weight:600;box-shadow:0 4px 16px rgba(25,25,28,.035);}
    .cta{position:relative;border-radius:28px;background:#18181b;color:#fff;padding:30px 27px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;}
    .cta:after{content:'';position:absolute;width:160px;height:160px;border-radius:50%;background:#e51d28;right:-72px;bottom:-72px;}
    .cta-kicker{font-size:14px;letter-spacing:1.7px;color:#ff777d;font-weight:700;}
    .cta-title{font-size:29px;font-weight:750;line-height:1.12;margin-top:8px;letter-spacing:-.4px;}
    .cta-copy{font-size:16px;line-height:1.45;color:#b8b8bd;margin-top:12px;}
    .contact{position:relative;z-index:2;padding:14px 15px;border-radius:15px;background:#fff;color:#17171a;font-size:20px;font-weight:750;text-align:center;word-break:break-word;}
    .contact-label{display:block;font-size:11px;letter-spacing:1.4px;color:#08a84f;margin-bottom:2px;}
    .footer-line{position:absolute;left:56px;right:56px;bottom:17px;height:3px;border-radius:3px;background:linear-gradient(90deg,#e51d28 0 24%,#d8d5d1 24% 100%);}
    .hero.no-person{height:470px;}
    .hero.no-person + .content{height:610px;padding-top:48px;}
    .no-person .hero-copy{width:900px;top:132px;}
    .no-person .title{max-width:900px;}
    .no-person .salary-card{width:720px;}

    /* 2026 direction: human, tactile, authentic — งานบริการ/ภาพลักษณ์ */
    #poster.human-editorial{background:#fff9f4;}
    .human-editorial .hero{background:linear-gradient(128deg,#f6e9df 0%,#fff8f1 57%,#f2cfc8 100%);}
    .human-editorial .hero:before{border-color:rgba(177,20,30,.16);right:-105px;top:-260px;}
    .human-editorial .hero:after{border-color:rgba(229,29,40,.055);}
    .human-editorial .brand{color:#211b1c;}
    .human-editorial .brand-mark{background:#e51d28;color:#fff;}
    .human-editorial .brand-sub{color:#7b6668;opacity:1;}
    .human-editorial .hero-copy{width:550px;}
    .human-editorial .badge{color:#b20f19;border-color:rgba(178,15,25,.28);background:rgba(255,255,255,.72);}
    .human-editorial .badge-dot{background:#e51d28;box-shadow:0 0 0 5px rgba(229,29,40,.12);}
    .human-editorial .title{max-width:525px;color:#211b1c;text-shadow:none;letter-spacing:-2.6px;}
    .human-editorial .meta{color:#57484a;}
    .human-editorial .meta-icon{background:#e51d28;color:#fff;}
    .human-editorial .portrait{width:500px;}
    .human-editorial .portrait-arch{right:26px;width:400px;height:500px;border-radius:50% 50% 0 0;background:linear-gradient(180deg,#e51d28 0%,#bd121b 100%);border:0;}
    .human-editorial .portrait img{right:-34px;}
    .human-editorial .salary-card{width:545px;background:#211b1c;color:#fff;box-shadow:0 20px 45px rgba(65,35,38,.18);}
    .human-editorial .eyebrow{color:#d5c8c9;}
    .human-editorial .salary{color:#ff777f;}
    .human-editorial .salary-note{color:#e5dcdd;border-left-color:#514447;}
    .human-editorial .content{background:#fff9f4;}
    .human-editorial .qual-no{background:#f2d7d4;color:#a60e18;border-radius:50%;}
    .human-editorial .benefit{background:#fff;border-color:#edddd6;}
    .human-editorial .cta{background:#e51d28;}
    .human-editorial .cta:after{background:#94101a;}
    .human-editorial .cta-kicker{color:#ffd1d4;}
    .human-editorial .cta-copy{color:#ffe0e2;}
    .human-editorial .footer-line{background:linear-gradient(90deg,#e51d28 0 24%,#eaded8 24% 100%);}

    /* 2026 direction: functional futurism — งานเทคนิค/ช่าง/IT */
    #poster.tech-signal{background:#eef1f3;}
    .tech-signal .hero{background-color:#151d29;background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(128deg,#101722 0%,#202d3d 100%);background-size:44px 44px,44px 44px,100% 100%;}
    .tech-signal .hero:before{border:2px solid rgba(255,193,46,.32);right:-120px;top:-230px;}
    .tech-signal .hero:after{border-color:rgba(255,193,46,.07);}
    .tech-signal .brand-mark{background:#ffc12e;color:#151d29;border-radius:7px;}
    .tech-signal .brand-sub{color:#ffc12e;opacity:1;}
    .tech-signal .badge{border-color:rgba(255,193,46,.52);background:rgba(255,193,46,.08);color:#ffe3a0;border-radius:7px;}
    .tech-signal .badge-dot{background:#ffc12e;box-shadow:0 0 0 5px rgba(255,193,46,.12);border-radius:2px;}
    .tech-signal .title{letter-spacing:-1.2px;}
    .tech-signal .meta-icon{background:#ffc12e;color:#151d29;border-radius:5px;}
    .tech-signal .portrait-arch{right:28px;width:390px;height:510px;border-radius:8px;background:linear-gradient(160deg,rgba(255,193,46,.31),rgba(255,193,46,.055));border:1px solid rgba(255,193,46,.4);clip-path:polygon(14% 0,100% 0,86% 100%,0 100%);}
    .tech-signal .salary-card{background:#ffc12e;border-radius:8px;color:#151d29;box-shadow:12px 12px 0 rgba(3,8,14,.28);}
    .tech-signal .eyebrow{color:#67500f;}
    .tech-signal .salary{color:#151d29;}
    .tech-signal .salary-note{color:#43370f;border-left-color:rgba(21,29,41,.24);}
    .tech-signal .content{background:#eef1f3;border-top:7px solid #ffc12e;}
    .tech-signal .section-kicker{color:#9a6700;}
    .tech-signal .qual-no{background:#151d29;color:#ffc12e;border-radius:4px;}
    .tech-signal .benefit{background:#f8fafb;border-color:#cdd3d8;border-radius:5px;box-shadow:4px 4px 0 #d9dee2;}
    .tech-signal .cta{background:#151d29;border-radius:8px;}
    .tech-signal .cta:after{background:#ffc12e;}
    .tech-signal .cta-kicker{color:#ffc12e;}
    .tech-signal .contact{border-radius:5px;}
    .tech-signal .contact-label{color:#9a6700;}
    .tech-signal .footer-line{border-radius:0;background:linear-gradient(90deg,#ffc12e 0 24%,#cbd1d6 24% 100%);}
  </style></head><body>
  <div id="poster" class="${direction}">
    <section class="hero ${person ? 'has-person' : 'no-person'}">
      <div class="brand"><span class="brand-mark">SO</span><span>WORK!</span><span class="brand-sub">RECRUITMENT</span></div>
      <div class="hero-copy">
        <div class="badge"><span class="badge-dot"></span>${badge}</div>
        <div class="title">${title}</div>
        <div class="meta-list">${metaHtml}</div>
      </div>
      ${salaryHtml}
      ${person}
    </section>
    <section class="content">
      <div>
        <div class="section-kicker">WE ARE HIRING</div>
        <div class="section-title">คุณสมบัติที่กำลังมองหา</div>
        <div class="qual-grid">${qualHtml}</div>
        ${benefitHtml ? `<div class="benefits">${benefitHtml}</div>` : ''}
      </div>
      <aside class="cta">
        <div>
          <div class="cta-kicker">JOIN OUR TEAM</div>
          <div class="cta-title">สนใจตำแหน่งนี้?</div>
          <div class="cta-copy">ส่งข้อมูลสมัครงานและสอบถามรายละเอียดกับทีมสรรหา</div>
        </div>
        <div class="contact">
          ${contactLine ? `<span class="contact-label">LINE</span>${contactLine}` : 'ติดต่อทีมสรรหา'}
        </div>
      </aside>
    </section>
    <div class="footer-line"></div>
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
