/**
 * แบบฟอร์มเรซูเม่ (PDF) ที่ตั้งได้จากหน้าจอ — ตั้งค่า → แบบฟอร์มเรซูเม่ (เจ้าของ 12 พ.ย. 2569)
 * ไฟล์นี้ไม่มีโค้ดฝั่งเซิร์ฟเวอร์ ใช้ได้ทั้งตอนสร้าง PDF และตัวอย่างสดในหน้าตั้งค่า
 */

export const RESUME_LAYOUTS = [
  { key: 'classic', label: 'มาตรฐาน', detail: 'คอลัมน์เดียว หัวข้อเรียงลงมา' },
  { key: 'sidebar', label: 'แถบข้าง', detail: 'แถบสีด้านซ้ายมีรูป ช่องทางติดต่อ ข้อมูลส่วนตัว ทักษะ' },
  { key: 'compact', label: 'กระชับ', detail: 'ตัวเล็กลง จัดสองคอลัมน์ ให้จบในหน้าเดียว' },
  // ตามรูปที่เจ้าของส่งมา 12 พ.ย. 2569
  { key: 'profile', label: 'แถบขวา', detail: 'รูปมุมขวาบน เส้นสีใต้หัว เนื้อหาหลักด้านซ้าย แถบเทาด้านขวามีภาษา ความเชี่ยวชาญ จุดเด่น' },
] as const;
export type ResumeLayout = (typeof RESUME_LAYOUTS)[number]['key'];

/** ฟอนต์จาก Google Fonts · Arimo = หน้าตาแบบ Arial ไม่มีตัวไทย ตัวไทยใช้ Noto Sans Thai (โหลดคู่กันเสมอ) */
export const RESUME_FONTS = ['Kanit', 'Sarabun', 'Prompt', 'Noto Sans Thai', 'IBM Plex Sans Thai', 'Bai Jamjuree', 'Arimo'] as const;

/** หัวข้อในเรซูเม่ ไทย/อังกฤษ */
const HEADINGS = {
  th: { intro: 'แนะนำตัว', work: 'ประสบการณ์ทำงาน', education: 'การศึกษา', languages: 'ภาษา', expertise: 'ความเชี่ยวชาญ', strengths: 'จุดเด่น', personal: 'ข้อมูลส่วนตัว', wanted: 'งานที่ต้องการ', classOf: 'จบปี' },
  en: { intro: 'Profile', work: 'Work Experience', education: 'Education', languages: 'Languages', expertise: 'Expertise', strengths: 'Strengths', personal: 'Personal Information', wanted: 'Job Preferences', classOf: 'Class of' },
} as const;

export const RESUME_SECTIONS = [
  { key: 'intro', label: 'แนะนำตัว' },
  { key: 'personal', label: 'ข้อมูลส่วนตัว' },
  { key: 'wanted', label: 'งานที่ต้องการ' },
  { key: 'work', label: 'ประสบการณ์ทำงาน' },
  { key: 'education', label: 'การศึกษา' },
  { key: 'skills', label: 'ทักษะและภาษา' },
] as const;
export type ResumeSectionKey = (typeof RESUME_SECTIONS)[number]['key'];

export type ResumeTemplateSettings = {
  layout: ResumeLayout;
  font: string;
  textColor: string;
  accentColor: string;
  /** รูปโลโก้หัวกระดาษแบบ data URL (ว่าง = ไม่มีโลโก้) */
  logo: string;
  /** logo = รูปลายน้ำกลางหน้า (watermarkImage) · both = ข้อความ + รูป */
  watermark: 'none' | 'text' | 'logo' | 'both';
  watermarkText: string;
  /** ข้อความลายน้ำซ้ำเต็มหน้าแบบเฉียง (ไม่ติ๊ก = คำเดียวใหญ่กลางหน้า) */
  watermarkTile: boolean;
  /** ความเข้มข้อความลายน้ำ 3–60 (%) */
  watermarkOpacity: number;
  /** รูปลายน้ำกลางหน้าแบบ data URL แยกจากโลโก้ */
  watermarkImage: string;
  /** ความกว้างรูปลายน้ำ 10–80 (% ของหน้า) */
  watermarkImageSize: number;
  /** ความเข้มรูปลายน้ำ 3–60 (%) */
  watermarkImageOpacity: number;
  headingLang: 'th' | 'en';
  showPhoto: boolean;
  showContacts: boolean;
  showSources: boolean;
  footerText: string;
  /** หัวข้อที่แสดง ตามลำดับ */
  sections: ResumeSectionKey[];
};

/** หน้าตาเดิมก่อนมีหน้าตั้งค่า — ใช้เมื่อยังไม่ได้ตั้งแบบเริ่มต้น */
export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateSettings = {
  layout: 'classic',
  font: 'Kanit',
  textColor: '#1a1a1a',
  accentColor: '#1d4ed8',
  logo: '',
  watermark: 'none',
  watermarkText: '',
  watermarkTile: false,
  watermarkOpacity: 8,
  watermarkImage: '',
  watermarkImageSize: 38,
  watermarkImageOpacity: 8,
  headingLang: 'th',
  showPhoto: true,
  showContacts: true,
  showSources: true,
  footerText: 'สร้างโดย SO Recruitment',
  sections: ['intro', 'personal', 'wanted', 'education', 'work', 'skills'],
};

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,/;
const clamp = (v: unknown, min: number, max: number, d: number) => Math.min(max, Math.max(min, Number(v) || d));

/** ค่าที่อ่านจากฐาน/ฟอร์ม → ค่าที่ใช้ได้แน่นอน (ค่าแปลก ๆ กลับเป็นค่าเริ่มต้น) */
export function normalizeTemplateSettings(raw: unknown): ResumeTemplateSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_RESUME_TEMPLATE;
  const sectionKeys = RESUME_SECTIONS.map((s) => s.key) as string[];
  const sections = Array.isArray(r.sections)
    ? [...new Set(r.sections.map(String).filter((k) => sectionKeys.includes(k)))] as ResumeSectionKey[]
    : d.sections;
  const logo = typeof r.logo === 'string' && IMAGE_URL.test(r.logo) ? r.logo : '';
  const watermark = r.watermark === 'text' || r.watermark === 'logo' || r.watermark === 'both' ? r.watermark : 'none';
  // แบบที่บันทึกก่อนมีรูปลายน้ำแยก ใช้โลโก้เป็นลายน้ำ
  const watermarkImage = typeof r.watermarkImage === 'string' && IMAGE_URL.test(r.watermarkImage)
    ? r.watermarkImage
    : r.watermarkImage === undefined && (watermark === 'logo' || watermark === 'both') ? logo : '';
  const textOpacity = clamp(r.watermarkOpacity, 3, 60, d.watermarkOpacity);
  return {
    layout: RESUME_LAYOUTS.some((l) => l.key === r.layout) ? (r.layout as ResumeLayout) : d.layout,
    font: (RESUME_FONTS as readonly string[]).includes(String(r.font)) ? String(r.font) : d.font,
    textColor: HEX.test(String(r.textColor)) ? String(r.textColor) : d.textColor,
    accentColor: HEX.test(String(r.accentColor)) ? String(r.accentColor) : d.accentColor,
    logo,
    watermark: !watermarkImage && watermark === 'logo' ? 'none' : !watermarkImage && watermark === 'both' ? 'text' : watermark,
    watermarkText: String(r.watermarkText ?? '').slice(0, 60),
    watermarkTile: Boolean(r.watermarkTile),
    watermarkOpacity: textOpacity,
    watermarkImage,
    watermarkImageSize: clamp(r.watermarkImageSize, 10, 80, d.watermarkImageSize),
    watermarkImageOpacity: clamp(r.watermarkImageOpacity, 3, 60, textOpacity),
    headingLang: r.headingLang === 'en' ? 'en' : 'th',
    showPhoto: r.showPhoto === undefined ? d.showPhoto : Boolean(r.showPhoto),
    showContacts: r.showContacts === undefined ? d.showContacts : Boolean(r.showContacts),
    showSources: r.showSources === undefined ? d.showSources : Boolean(r.showSources),
    footerText: String(r.footerText ?? d.footerText).slice(0, 120),
    sections,
  };
}

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai', upload: 'อัปโหลด' };

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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function field(label: string, value: unknown): string {
  const v = txt(value);
  if (!v) return '';
  return `<div class="field"><div class="fl">${esc(label)}</div><div class="fv">${esc(v)}</div></div>`;
}

/** ส่วนเนื้อหาแต่ละหัวข้อ (ว่าง = ไม่มีข้อมูล ไม่แสดงหัวข้อ) */
function sectionHtml(key: ResumeSectionKey, c: any): string {
  const sec = (title: string, body: string) => (body ? `<section class="sec"><h2>${esc(title)}</h2>${body}</section>` : '');
  if (key === 'intro') return txt(c.intro) ? sec('แนะนำตัว', `<p class="para">${esc(txt(c.intro))}</p>`) : '';
  if (key === 'personal') {
    const grid = [
      field('คำนำหน้า', c.prefix), field('เพศ', c.gender), field('อายุ', c.age), field('วันเกิด', c.birth_date),
      field('สัญชาติ', c.nationality), field('ศาสนา', c.religion), field('ส่วนสูง', c.height), field('น้ำหนัก', c.weight),
      field('สถานภาพ', c.marital_status), field('สถานะทางทหาร', c.military_status), field('ยานพาหนะ', c.vehicle),
      field('ใบขับขี่', c.driving_license), field('จังหวัด', c.province),
    ].join('');
    const addr = txt(c.address) ? `<div class="addr"><div class="fl">ที่อยู่</div><div class="fv">${esc(txt(c.address))}</div></div>` : '';
    return grid || addr ? sec('ข้อมูลส่วนตัว', `<div class="grid">${grid}</div>${addr}`) : '';
  }
  if (key === 'wanted') {
    const grid = [
      field('ตำแหน่ง', c.desired_positions), field('เงินเดือนที่ต้องการ', c.expected_salary),
      field('พื้นที่ทำงาน', c.desired_work_area), field('ประเภทงาน', c.job_type), field('เริ่มงานได้', c.available_start),
    ].join('');
    return grid ? sec('งานที่ต้องการ', `<div class="grid">${grid}</div>`) : '';
  }
  if (key === 'education') {
    const rows = arr(c.education);
    return sec(
      `การศึกษา${rows.length ? ` (${rows.length})` : ''}`,
      rows
        .map((e) => {
          const meta = [txt(e.degree), txt(e.faculty), txt(e.major), txt(e.gpa) && `GPA ${txt(e.gpa)}`, txt(e.graduation_year)].filter(Boolean).join(' · ');
          return `<div class="entry"><div class="et">${esc(txt(e.institution) || '—')}</div><div class="em">${esc(meta)}</div></div>`;
        })
        .join(''),
    );
  }
  if (key === 'work') {
    const rows = arr(c.work_experience);
    return sec(
      `ประสบการณ์ทำงาน${rows.length ? ` (${rows.length})` : ''}`,
      rows
        .map((w) => {
          const title = [txt(w.position), txt(w.company)].filter(Boolean).join(' — ') || '—';
          const meta = [txt(w.period) || txt(w.year), salaryTxt(w.salary), txt(w.business_type)].filter(Boolean).join(' · ');
          const resp = txt(w.responsibilities) ? `<p class="para">${esc(txt(w.responsibilities))}</p>` : '';
          return `<div class="entry"><div class="et">${esc(title)}</div><div class="em">${esc(meta)}</div>${resp}</div>`;
        })
        .join(''),
    );
  }
  const chips = (label: string, list: string[]) =>
    list.length ? `<div class="skl"><span class="fl">${esc(label)}</span><div class="chips">${list.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>` : '';
  return sec(
    'ทักษะและภาษา',
    chips('ทักษะเฉพาะทาง', skills(c.hard_skills)) + chips('ทักษะทั่วไป', skills(c.soft_skills)) + chips('ภาษา', arr(c.language_skills).map(langLine).filter(Boolean)),
  );
}

function fontHref(font: string): string {
  const fam = (f: string) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700`;
  const families = font === 'Noto Sans Thai' ? [font] : [font, 'Noto Sans Thai'];
  return `https://fonts.googleapis.com/css2?${families.map(fam).join('&')}&display=swap`;
}

/** สีอ่อนของสีหลัก (พื้นแถบข้าง/ป้ายทักษะ) */
function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function css(t: ResumeTemplateSettings): string {
  const small = t.layout === 'compact';
  const margin = t.layout === 'sidebar' ? '0' : t.layout === 'profile' ? '10mm 11mm 12mm 9mm' : '14mm';
  return `
@page { size: A4; margin: ${margin}; }
@media screen { body { padding: ${margin}; } }
* { box-sizing: border-box; }
html, body { background: #fff; margin: 0; font-family: '${t.font}', 'Noto Sans Thai', Tahoma, sans-serif; color: ${t.textColor}; }
.sheet { max-width: 800px; margin: 0 auto; font-size: ${small ? '11.5px' : '13px'}; line-height: 1.5; position: relative; z-index: 1; }
.head { display: flex; gap: 18px; align-items: flex-start; border-bottom: 2px solid ${t.accentColor}; padding-bottom: ${small ? '10px' : '16px'}; margin-bottom: ${small ? '12px' : '18px'}; }
.avatar { width: ${small ? '64px' : '84px'}; height: ${small ? '64px' : '84px'}; border-radius: 10px; object-fit: cover; border: 1px solid #e5e7eb; flex-shrink: 0; }
.head-main { flex: 1; min-width: 0; }
.logo { max-height: 56px; max-width: 160px; object-fit: contain; flex-shrink: 0; }
.name { font-size: ${small ? '21px' : '26px'}; font-weight: 700; margin: 0; letter-spacing: -.3px; }
.role { color: ${t.accentColor}; font-size: ${small ? '13px' : '15px'}; margin-top: 3px; }
.contacts { opacity: .8; font-size: 12.5px; margin-top: 7px; }
.sources { opacity: .6; font-size: 11px; margin-top: 4px; }
.sec { margin-bottom: ${small ? '10px' : '16px'}; break-inside: avoid; }
.sec h2 { font-size: 12px; font-weight: 700; color: ${t.accentColor}; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 ${small ? '6px' : '9px'}; padding-bottom: 4px; border-bottom: 1px solid ${tint(t.accentColor, 0.25)}; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${small ? '6px 14px' : '9px 18px'}; }
.fl { font-size: 10px; opacity: .65; margin-bottom: 1px; }
.fv { font-size: ${small ? '12px' : '13px'}; }
.addr { margin-top: 9px; }
.entry { padding-left: 11px; border-left: 2px solid ${tint(t.accentColor, 0.3)}; margin-bottom: ${small ? '7px' : '10px'}; break-inside: avoid; }
.et { font-weight: 700; }
.em { opacity: .7; font-size: 11.5px; margin-top: 1px; }
.para { opacity: .9; font-size: 12.5px; margin: 4px 0 0; white-space: pre-line; }
.skl { margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.chip { background: ${tint(t.accentColor, 0.1)}; color: ${t.accentColor}; font-size: 11.5px; padding: 2px 8px; border-radius: 5px; }
.foot { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e5e7eb; opacity: .55; font-size: 10px; text-align: center; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
.wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
.wm-text { opacity: ${t.watermarkOpacity / 100}; }
.wm-text span { font-size: 72px; font-weight: 700; color: ${t.accentColor}; transform: rotate(-30deg); white-space: nowrap; }
.wm-img { opacity: ${t.watermarkImageOpacity / 100}; }
.wm-img img { width: ${t.watermarkImageSize}%; max-height: ${t.watermarkImageSize}%; object-fit: contain; }
.side-wrap { display: grid; grid-template-columns: 34% 1fr; min-height: 297mm; max-width: none; }
.side { background: ${tint(t.accentColor, 0.1)}; padding: 16mm 7mm 12mm 9mm; }
.side .avatar { width: 110px; height: 110px; border-radius: 50%; display: block; margin: 0 auto 12px; }
.side .logo { display: block; margin: 0 auto 14px; }
.side .grid { grid-template-columns: 1fr; gap: 7px; }
.side-contact { font-size: 12px; margin-bottom: 14px; word-break: break-word; }
.side-contact div { margin-bottom: 3px; }
.main { padding: 16mm 10mm 12mm 9mm; }
.main .name { margin-bottom: 2px; }
.main .head-line { border-bottom: 2px solid ${t.accentColor}; padding-bottom: 12px; margin-bottom: 16px; }
.wm-tile { display: block; overflow: hidden; }
.wm-tile span { position: absolute; font-size: 14px; font-weight: 400; letter-spacing: .5px; color: #555; transform: translate(-50%, -50%) rotate(-40deg); }
.pf { font-size: 12px; line-height: 1.36; max-width: none; }
.pf-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; border-bottom: 2px solid ${t.accentColor}; padding: 76px 0 34px; }
.pf-head .name { font-size: 23px; font-weight: 700; letter-spacing: 0; line-height: 1.15; }
.pf-sub { opacity: .8; font-size: 12px; margin-top: 3px; }
.pf-tags { color: ${t.accentColor}; font-weight: 700; font-size: 12px; text-transform: uppercase; margin-top: 2px; white-space: pre; }
.pf-contacts { opacity: .7; font-size: 11px; margin-top: 3px; }
.pf-photo { width: 34mm; height: 45.5mm; object-fit: cover; flex-shrink: 0; margin-bottom: 13px; }
.pf-cols { display: grid; grid-template-columns: 1fr 30.4%; gap: 0 18px; }
.pf-cols > main { padding-top: 15px; }
.pf-side { background: rgba(0, 0, 0, .065); margin-top: 6px; padding: 10px 13px 14px; }
.pf h2 { font-size: 16px; font-weight: 700; color: ${t.accentColor}; margin: 0 0 2px; padding: 0; border: 0; text-transform: none; letter-spacing: 0; line-height: 1.25; }
.pf .sec { margin-bottom: 6px; break-inside: auto; }
.pf .entry { border-left: 0; padding-left: 0; margin-bottom: 3px; }
.pf .et { font-weight: 700; }
.pf .et .co { font-weight: 400; opacity: .85; }
.pf .em { font-style: italic; font-size: 12px; opacity: .65; margin-top: 0; }
.pf ul { margin: 0; padding: 0; list-style: none; }
.pf main li { padding-left: 9px; text-indent: -9px; }
.pf main li::before { content: '•'; display: inline-block; width: 9px; text-indent: 0; }
.pf-side li::before { content: '•'; color: ${t.accentColor}; margin-right: 2px; }
.pf .para { margin: 0; opacity: .85; font-size: 12px; }
.pf li { opacity: .85; }
`;
}

/**
 * แบบแถบขวา (ตามรูปที่เจ้าของส่งมา 13 พ.ย. 2569)
 * หัว: ชื่อ · ตำแหน่งล่าสุด · แท็กตำแหน่งที่ต้องการตัวใหญ่สีหลัก · รูปมุมขวา
 * ซ้าย = แนะนำตัว/งาน/การศึกษา · ขวา (เทา) = ภาษา ความเชี่ยวชาญ (ทักษะทั่วไป) จุดเด่น (ทักษะเฉพาะทาง) ข้อมูลส่วนตัว งานที่ต้องการ
 */
function profileLayout(
  c: any,
  t: ResumeTemplateSettings,
  p: { name: string; photo: string; contactList: string[]; sources: string[]; footer: string },
): string {
  const h = HEADINGS[t.headingLang];
  const sec = (title: string, body: string) => (body ? `<section class="sec"><h2>${esc(title)}</h2>${body}</section>` : '');
  const bullets = (title: string, items: string[]) => sec(title, items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const kv = (pairs: [string, unknown][]) => pairs.filter(([, v]) => txt(v)).map(([k, v]) => `${k}: ${txt(v)}`);
  const co = (v: unknown) => (txt(v) ? ` <span class="co">&nbsp;—&nbsp; ${esc(txt(v))}</span>` : '');
  const work = arr(c.work_experience);
  const main: Record<string, () => string> = {
    intro: () => sec(h.intro, txt(c.intro) ? `<p class="para">${esc(txt(c.intro))}</p>` : ''),
    work: () =>
      sec(h.work, work
        .map((w) => {
          const resp = txt(w.responsibilities) ? `<ul><li>${esc(txt(w.responsibilities))}</li></ul>` : '';
          const meta = [txt(w.period) || txt(w.year), salaryTxt(w.salary)].filter(Boolean).join(' · ');
          return `<div class="entry"><div class="et">${esc(txt(w.position) || '—')}${co(w.company)}</div>${meta ? `<div class="em">${esc(meta)}</div>` : ''}${resp}</div>`;
        })
        .join('')),
    education: () =>
      sec(h.education, arr(c.education)
        .map((e) => {
          const what = [txt(e.degree), txt(e.major)].filter(Boolean).join(' ') + (txt(e.gpa) ? ` (GPA ${txt(e.gpa)})` : '');
          return `<div class="entry"><div class="et">${esc(what || '—')}${co(e.institution)}</div>${txt(e.graduation_year) ? `<div class="em">${h.classOf} ${esc(txt(e.graduation_year))}</div>` : ''}</div>`;
        })
        .join('')),
  };
  const side: Record<string, () => string> = {
    skills: () =>
      bullets(h.languages, arr(c.language_skills).map(langLine).filter(Boolean)) +
      bullets(h.expertise, skills(c.soft_skills)) +
      bullets(h.strengths, skills(c.hard_skills)),
    personal: () =>
      bullets(h.personal, kv([
        ['เพศ', c.gender], ['อายุ', c.age && `${txt(c.age)} ปี`], ['สัญชาติ', c.nationality], ['ศาสนา', c.religion],
        ['ส่วนสูง', c.height], ['น้ำหนัก', c.weight], ['สถานภาพ', c.marital_status], ['ทหาร', c.military_status],
        ['ใบขับขี่', c.driving_license], ['จังหวัด', c.province],
      ])),
    wanted: () =>
      bullets(h.wanted, kv([
        ['เงินเดือน', salaryTxt(c.expected_salary)], ['พื้นที่', c.desired_work_area], ['ประเภทงาน', c.job_type], ['เริ่มงานได้', c.available_start],
      ])),
  };
  const mainHtml = t.sections.filter((k) => k in main).map((k) => main[k]()).join('');
  const sideHtml = t.sections.filter((k) => k in side).map((k) => side[k]()).join('');
  const current = txt(work[0]?.position);
  const roles = txt(c.desired_positions).split(/\s*[,/|]\s*/).filter(Boolean);
  return `<div class="sheet pf">
  <header class="pf-head">
    <div>
      <h1 class="name">${esc(p.name)}</h1>
      ${current ? `<div class="pf-sub">${esc(current)}</div>` : ''}
      ${roles.length ? `<div class="pf-tags">${roles.map(esc).join('  |  ')}</div>` : ''}
      ${p.contactList.length ? `<div class="pf-contacts">${esc(p.contactList.join('  ·  '))}</div>` : ''}
      ${p.sources.length ? `<div class="sources">แหล่งข้อมูล: ${esc(p.sources.join(', '))}</div>` : ''}
    </div>
    ${p.photo}
  </header>
  <div class="pf-cols"><main>${mainHtml}</main>${sideHtml ? `<aside class="pf-side">${sideHtml}</aside>` : '<aside></aside>'}</div>
  ${p.footer}
</div>`;
}

/** ตำแหน่งข้อความลายน้ำแบบซ้ำเต็มหน้า: 6 แถว แถวเว้นแถวเยื้องครึ่งช่อง (ตามรูปตัวอย่าง) */
const TILE_SPOTS = Array.from({ length: 6 }, (_, row) =>
  (row % 2 ? [22, 57, 92] : [5, 40, 75]).map((x) => [x, 7 + row * 17.5] as const),
).flat();

/**
 * HTML เรซูเม่หน้า A4 ของผู้สมัครหนึ่งคนตามแบบฟอร์ม
 * @param c แถวผู้สมัคร (มี sources ถ้าต้องการโชว์แหล่งที่มา)
 * @param profileDataUrl รูปผู้สมัครแบบ data URL
 */
export function buildResumeHtml(c: any, profileDataUrl?: string | null, template?: Partial<ResumeTemplateSettings> | null): string {
  const t = normalizeTemplateSettings({ ...DEFAULT_RESUME_TEMPLATE, ...(template ?? {}) });
  const name = txt(c.full_name) || '(ไม่ระบุชื่อ)';
  const photo = t.showPhoto && profileDataUrl ? `<img class="avatar" src="${profileDataUrl}" alt=""/>` : '';
  const logo = t.logo ? `<img class="logo" src="${t.logo}" alt=""/>` : '';
  const contactList = t.showContacts
    ? ([
        c.phone && `โทร: ${txt(c.phone)}`,
        c.email && `อีเมล: ${txt(c.email)}`,
        c.line_id && `LINE: ${txt(c.line_id)}`,
        c.facebook && `FB: ${txt(c.facebook)}`,
      ].filter(Boolean) as string[])
    : [];
  const sources = t.showSources ? arr(c.sources).map((s: any) => PLATFORM[txt(s.platform)] ?? txt(s.platform)).filter(Boolean) : [];
  const role = txt(c.desired_positions) ? `<div class="role">${esc(txt(c.desired_positions))}</div>` : '';
  const footer = t.footerText ? `<footer class="foot">${esc(t.footerText)} · ${esc(name)}</footer>` : '';
  const wmText = (t.watermark === 'text' || t.watermark === 'both') && t.watermarkText
    ? t.watermarkTile
      ? `<div class="wm wm-text wm-tile">${TILE_SPOTS.map(([x, y]) => `<span style="left:${x}%;top:${y}%">${esc(t.watermarkText)}</span>`).join('')}</div>`
      : `<div class="wm wm-text"><span>${esc(t.watermarkText)}</span></div>`
    : '';
  const wmLogo = (t.watermark === 'logo' || t.watermark === 'both') && t.watermarkImage ? `<div class="wm wm-img"><img src="${t.watermarkImage}" alt=""/></div>` : '';
  const wm = wmText + wmLogo;
  const html = (key: ResumeSectionKey) => sectionHtml(key, c);

  let body: string;
  if (t.layout === 'profile') {
    const pfPhoto = t.showPhoto && profileDataUrl ? `<img class="pf-photo" src="${profileDataUrl}" alt=""/>` : '';
    body = profileLayout(c, t, { name, photo: pfPhoto, contactList, sources, footer });
  } else if (t.layout === 'sidebar') {
    const sideKeys: ResumeSectionKey[] = ['personal', 'skills'];
    const side = t.sections.filter((k) => sideKeys.includes(k)).map(html).join('');
    const main = t.sections.filter((k) => !sideKeys.includes(k)).map(html).join('');
    body = `<div class="sheet side-wrap">
  <aside class="side">
    ${logo}${photo}
    ${contactList.length ? `<div class="side-contact">${contactList.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
    ${side}
  </aside>
  <main class="main">
    <div class="head-line"><h1 class="name">${esc(name)}</h1>${role}
      ${sources.length ? `<div class="sources">แหล่งข้อมูล: ${esc(sources.join(', '))}</div>` : ''}</div>
    ${main}
    ${footer}
  </main>
</div>`;
  } else {
    const head = `<header class="head">
    ${photo}
    <div class="head-main">
      <h1 class="name">${esc(name)}</h1>
      ${role}
      ${contactList.length ? `<div class="contacts">${esc(contactList.join('  ·  '))}</div>` : ''}
      ${sources.length ? `<div class="sources">แหล่งข้อมูล: ${esc(sources.join(', '))}</div>` : ''}
    </div>
    ${logo}
  </header>`;
    const parts = t.sections.map(html).filter(Boolean);
    // กระชับ: หัวข้อสั้น (ข้อมูลส่วนตัว/งานที่ต้องการ/ทักษะ) วางคู่กันสองคอลัมน์
    const content =
      t.layout === 'compact'
        ? `<div class="cols">${parts.map((p) => `<div>${p}</div>`).join('')}</div>`
        : parts.join('');
    body = `<div class="sheet">${head}${content}${footer}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontHref(t.font)}" rel="stylesheet"/>
<style>${css(t)}</style>
</head>
<body>
${wm}
${body}
</body>
</html>`;
}

/** ผู้สมัครตัวอย่างสำหรับดูหน้าตาในหน้าตั้งค่า (ไม่ใช่คนจริง) */
export const SAMPLE_CANDIDATE = {
  full_name: 'นางสาวตัวอย่าง ใจดี',
  prefix: 'นางสาว',
  gender: 'หญิง',
  age: '27',
  nationality: 'ไทย',
  province: 'กรุงเทพมหานคร',
  address: '99/9 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร',
  phone: '080-000-0000',
  email: 'sample@example.com',
  line_id: 'sample.line',
  desired_positions: 'เจ้าหน้าที่ธุรการ, แอดมิน',
  expected_salary: '18,000',
  available_start: 'ทันที',
  intro: 'ทำงานธุรการมา 3 ปี ถนัดงานเอกสารและประสานงาน',
  education: [
    { degree: 'ปริญญาตรี', major: 'บริหารธุรกิจ', institution: 'มหาวิทยาลัยตัวอย่าง', graduation_year: '2564', gpa: '3.10' },
  ],
  work_experience: [
    { position: 'เจ้าหน้าที่ธุรการ', company: 'บริษัท ตัวอย่าง จำกัด', period: '2565 - ปัจจุบัน', responsibilities: 'คีย์ข้อมูล จัดเอกสาร ประสานงานจัดซื้อ' },
    { position: 'พนักงานขาย', company: 'ร้านตัวอย่างมาร์ท', period: '2564 - 2565' },
  ],
  hard_skills: ['Microsoft Excel', 'Word', 'พิมพ์ดีดไทย'],
  soft_skills: ['ทำงานเป็นทีม'],
  language_skills: [{ language: 'อังกฤษ', level: 'พอใช้' }],
  sources: [{ platform: 'upload' }],
};
