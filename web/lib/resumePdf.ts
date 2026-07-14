/** Shared resume HTML + Chromium PDF generation (Thai-safe via browser render). */

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}
function skills(v: unknown): string[] {
  return arr(v)
    .map((x) => (typeof x === 'string' ? x : txt(x?.name ?? x?.skill ?? x?.language ?? '')))
    .filter(Boolean);
}
function langLine(x: any): string {
  if (typeof x === 'string') return x;
  return [txt(x?.language ?? x?.name), txt(x?.level ?? x?.proficiency ?? x?.ability)].filter(Boolean).join(' · ');
}
function salaryTxt(v: unknown): string {
  const s = txt(v);
  if (!s) return '';
  return /บาท|฿/.test(s) ? s : `${s} บาท`;
}
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
html, body { background: #fff; margin: 0; font-family: 'Kanit', 'Sarabun', 'Noto Sans Thai', Tahoma, sans-serif; }
.sheet {
  max-width: 800px; margin: 0 auto; background: #fff; color: #1a1a1a;
  padding: 0; font-size: 13px; line-height: 1.5;
}
.head { display: flex; gap: 18px; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 18px; }
.avatar { width: 84px; height: 84px; border-radius: 10px; object-fit: cover; border: 1px solid #e5e7eb; flex-shrink: 0; }
.head-main { flex: 1; min-width: 0; }
.name { font-size: 26px; font-weight: 700; margin: 0; letter-spacing: -.3px; }
.role { color: #1d4ed8; font-size: 15px; margin-top: 3px; }
.contacts { color: #4b5563; font-size: 12.5px; margin-top: 7px; }
.sources { color: #6b7280; font-size: 11px; margin-top: 4px; }
.sec { margin-bottom: 16px; break-inside: avoid; }
.sec h2 { font-size: 12px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 9px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px 18px; }
.fl { font-size: 10px; color: #6b7280; margin-bottom: 1px; }
.fv { font-size: 13px; }
.addr { margin-top: 9px; }
.entry { padding-left: 11px; border-left: 2px solid #e5e7eb; margin-bottom: 10px; break-inside: avoid; }
.et { font-weight: 700; font-size: 13px; }
.em { color: #6b7280; font-size: 11.5px; margin-top: 1px; }
.para { color: #374151; font-size: 12.5px; margin: 4px 0 0; white-space: pre-line; }
.skl { margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.chip { background: #eef2ff; color: #1d4ed8; font-size: 11.5px; padding: 2px 8px; border-radius: 5px; }
.foot { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; text-align: center; }
`;

function field(label: string, value: unknown): string {
  const v = txt(value);
  if (!v) return '';
  return `<div class="field"><div class="fl">${esc(label)}</div><div class="fv">${esc(v)}</div></div>`;
}

/** Build a printable A4 resume HTML document from a candidate row. */
export function buildResumeHtml(c: any, profileDataUrl?: string | null): string {
  const education = arr(c.education);
  const work = arr(c.work_experience);
  const hard = skills(c.hard_skills);
  const soft = skills(c.soft_skills);
  const langs = arr(c.language_skills).map(langLine).filter(Boolean);
  const sources = arr(c.sources)
    .map((s: any) => PLATFORM[txt(s.platform)] ?? txt(s.platform))
    .filter(Boolean);
  const contacts = [
    c.phone && `โทร: ${txt(c.phone)}`,
    c.email && `อีเมล: ${txt(c.email)}`,
    c.line_id && `LINE: ${txt(c.line_id)}`,
    c.facebook && `FB: ${txt(c.facebook)}`,
  ].filter(Boolean) as string[];

  const name = txt(c.full_name) || '(ไม่ระบุชื่อ)';

  const eduHtml = education.length
    ? `<section class="sec"><h2>การศึกษา (${education.length})</h2>${education
        .map((e) => {
          const meta = [txt(e.degree), txt(e.faculty), txt(e.major), txt(e.gpa) && `GPA ${txt(e.gpa)}`, txt(e.graduation_year)]
            .filter(Boolean)
            .join(' · ');
          return `<div class="entry"><div class="et">${esc(txt(e.institution) || '—')}</div><div class="em">${esc(meta)}</div></div>`;
        })
        .join('')}</section>`
    : '';

  const workHtml = work.length
    ? `<section class="sec"><h2>ประสบการณ์ทำงาน (${work.length})</h2>${work
        .map((w) => {
          const title = [txt(w.position), txt(w.company)].filter(Boolean).join(' — ') || '—';
          const meta = [txt(w.period) || txt(w.year), salaryTxt(w.salary), txt(w.business_type)].filter(Boolean).join(' · ');
          const resp = txt(w.responsibilities) ? `<p class="para">${esc(txt(w.responsibilities))}</p>` : '';
          return `<div class="entry"><div class="et">${esc(title)}</div><div class="em">${esc(meta)}</div>${resp}</div>`;
        })
        .join('')}</section>`
    : '';

  const skillsHtml =
    hard.length || soft.length || langs.length
      ? `<section class="sec"><h2>ทักษะและภาษา</h2>${
          hard.length
            ? `<div class="skl"><span class="fl">ทักษะเฉพาะทาง</span><div class="chips">${hard.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`
            : ''
        }${
          soft.length
            ? `<div class="skl"><span class="fl">ทักษะทั่วไป</span><div class="chips">${soft.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`
            : ''
        }${
          langs.length
            ? `<div class="skl"><span class="fl">ภาษา</span><div class="chips">${langs.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`
            : ''
        }</section>`
      : '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>${CSS}</style>
</head>
<body>
<div class="sheet">
  <header class="head">
    ${profileDataUrl ? `<img class="avatar" src="${profileDataUrl}" alt=""/>` : ''}
    <div class="head-main">
      <h1 class="name">${esc(name)}</h1>
      ${txt(c.desired_positions) ? `<div class="role">${esc(txt(c.desired_positions))}</div>` : ''}
      ${contacts.length ? `<div class="contacts">${esc(contacts.join('  ·  '))}</div>` : ''}
      ${sources.length ? `<div class="sources">แหล่งข้อมูล: ${esc(sources.join(', '))}</div>` : ''}
    </div>
  </header>
  ${txt(c.intro) ? `<section class="sec"><h2>แนะนำตัว</h2><p class="para">${esc(txt(c.intro))}</p></section>` : ''}
  <section class="sec">
    <h2>ข้อมูลส่วนตัว</h2>
    <div class="grid">
      ${field('คำนำหน้า', c.prefix)}${field('เพศ', c.gender)}${field('อายุ', c.age)}
      ${field('วันเกิด', c.birth_date)}${field('สัญชาติ', c.nationality)}${field('ศาสนา', c.religion)}
      ${field('ส่วนสูง', c.height)}${field('น้ำหนัก', c.weight)}${field('สถานภาพ', c.marital_status)}
      ${field('สถานะทางทหาร', c.military_status)}${field('ยานพาหนะ', c.vehicle)}${field('ใบขับขี่', c.driving_license)}
      ${field('จังหวัด', c.province)}
    </div>
    ${txt(c.address) ? `<div class="addr"><div class="fl">ที่อยู่</div><div class="fv">${esc(txt(c.address))}</div></div>` : ''}
  </section>
  <section class="sec">
    <h2>งานที่ต้องการ</h2>
    <div class="grid">
      ${field('ตำแหน่ง', c.desired_positions)}${field('เงินเดือนที่ต้องการ', c.expected_salary)}
      ${field('พื้นที่ทำงาน', c.desired_work_area)}${field('ประเภทงาน', c.job_type)}${field('เริ่มงานได้', c.available_start)}
    </div>
  </section>
  ${eduHtml}
  ${workHtml}
  ${skillsHtml}
  <footer class="foot">สร้างโดย SO Recruitment · ${esc(name)}</footer>
</div>
</body>
</html>`;
}

export function resumeFileName(fullName: unknown): string {
  const base = txt(fullName)
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${base || 'resume'}.pdf`;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const puppeteer = await import('puppeteer-core');

  let browser;
  if (isServerless) {
    // chromium-min downloads the browser pack to /tmp (avoids Next.js bundler
    // stripping bin/). Pack URL may be overridden via CHROMIUM_PACK_URL.
    const chromiumMod = await import('@sparticuz/chromium-min');
    const chromium = chromiumMod.default;
    const packUrl =
      process.env.CHROMIUM_PACK_URL ||
      'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';
    browser = await puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(packUrl),
      headless: true,
    });
  } else {
    // Local: prefer system Chrome/Edge.
    const candidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean) as string[];

    let executablePath: string | undefined;
    const { existsSync } = await import('node:fs');
    for (const p of candidates) {
      if (existsSync(p)) {
        executablePath = p;
        break;
      }
    }
    if (!executablePath) {
      throw new Error('ไม่พบ Chrome/Edge สำหรับสร้าง PDF — ติดตั้ง Chrome หรือตั้ง CHROME_PATH');
    }
    browser = await puppeteer.default.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    // Wait for Google Fonts (Kanit) if network available; don't hang forever offline.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    // Extra beat for remote stylesheet images/fonts after first paint.
    await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 300));
    }).catch(() => {});
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
