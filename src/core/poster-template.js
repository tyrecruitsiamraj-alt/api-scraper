/**
 * SO PEOPLE recruitment poster — single source of truth for Web preview and PNG export.
 * AI supplies only the occupational photograph. All Thai text, brand layout and facts
 * are deterministic SVG layers so the preview cannot drift from the exported file.
 */

export const POSTER_TEMPLATE_ID = 'so-people-recruitment';
export const POSTER_TEMPLATE_VERSION = 2;
export const POSTER_BRAND_RULE_VERSION = 1;

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function splitThai(value, maxChars = 24, maxLines = 2) {
  const source = compact(value);
  if (!source) return [];
  const words = source.split(' ');
  const lines = [];
  let line = '';
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    if (lines.length === maxLines - 1) {
      line = words.slice(index).join(' ');
      break;
    }
    line = word;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length && lines[lines.length - 1].length > maxChars) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, maxChars - 1)).trim()}…`;
  }
  return lines;
}

function textLines(lines, x, y, lineHeight, attrs = '') {
  return lines.map((line, index) => `<text x="${x}" y="${y + (index * lineHeight)}" ${attrs}>${esc(line)}</text>`).join('');
}

function benefitIcon(index, cx, cy) {
  const stroke = '#ffffff';
  const common = `fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;
  if (index === 0) return `<path d="M${cx} ${cy - 29}l27 10v22c0 20-12 34-27 42-15-8-27-22-27-42v-22z" ${common}/><path d="M${cx - 12} ${cy + 2}l9 9 17-20" ${common}/>`;
  if (index === 1) return `<path d="M${cx - 28} ${cy + 29}h56M${cx - 22} ${cy + 22}v-24M${cx - 3} ${cy + 22}v-44M${cx + 16} ${cy + 22}v-34" ${common}/>`;
  if (index === 2) return `<circle cx="${cx - 16}" cy="${cy - 12}" r="12" ${common}/><circle cx="${cx + 17}" cy="${cy - 12}" r="12" ${common}/><path d="M${cx - 39} ${cy + 29}c3-22 14-31 26-31s23 9 26 31M${cx + 3} ${cy + 29}c2-17 10-25 21-25 10 0 19 8 21 25" ${common}/>`;
  return `<circle cx="${cx}" cy="${cy}" r="31" ${common}/><path d="M${cx} ${cy - 18}v20l15 10" ${common}/>`;
}

export function withPosterTemplate(fields = {}) {
  return {
    ...fields,
    logoVariant: fields.logoVariant === 'so-red' ? 'so-red' : 'people-navy',
    templateId: POSTER_TEMPLATE_ID,
    templateVersion: POSTER_TEMPLATE_VERSION,
    brandRuleVersion: POSTER_BRAND_RULE_VERSION,
  };
}

/**
 * @param {Record<string, any>} rawFields
 * @param {string|null} personUri data URI on the worker, API URL in the Web preview
 * @param {string|null} logoUri data URI on the worker, public URL in the Web preview
 */
export function buildPosterSvg(rawFields = {}, personUri = null, logoUri = null) {
  const f = withPosterTemplate(rawFields);
  const imageOnLeft = f.imageSide === 'left';
  const contentX = imageOnLeft ? 584 : 64;
  const photoX = imageOnLeft ? 0 : 500;
  const titleLines = splitThai(f.title || 'เปิดรับสมัครงาน', 19, 2);
  const locationLines = splitThai(f.location, 31, 2);
  const salaryLines = splitThai(f.salaryTotal || 'ตามโครงสร้างบริษัท', 18, 2);
  const quantity = compact(f.quantity);
  const badge = compact(f.badge || 'เปิดรับสมัครด่วน');
  const contact = compact(f.contactLine) || 'ส่งข้อความผ่านโพสต์นี้ได้เลย';
  const footerItems = (Array.isArray(f.benefits) ? f.benefits : [])
    .map(compact).filter(Boolean).slice(0, 4);
  for (const qualification of (Array.isArray(f.qualifications) ? f.qualifications : []).map(compact).filter(Boolean)) {
    if (footerItems.length >= 4) break;
    footerItems.push(qualification);
  }
  if (footerItems.length < 4 && compact(f.worktime)) footerItems.push(compact(f.worktime));
  const displayItems = footerItems.slice(0, 4);
  const itemWidth = displayItems.length ? 920 / displayItems.length : 920;
  const titlePath = imageOnLeft
    ? 'M510 150 H1080 V475 H510 Q450 315 510 150Z'
    : 'M0 150 H570 Q630 315 570 475 H0Z';
  const logoX = imageOnLeft ? 824 : 64;
  const roleSize = titleLines.join('').length > 24 ? 58 : titleLines.length > 1 ? 68 : 78;

  const benefits = displayItems.map((item, index) => {
    const x = 80 + (index * itemWidth);
    const cx = x + (itemWidth / 2);
    const lines = splitThai(item, displayItems.length >= 4 ? 15 : 24, 2);
    return `<g>${benefitIcon(index, cx, 887)}${textLines(lines, cx, 955, 28, 'text-anchor="middle" class="footerText"')}</g>`;
  }).join('');

  const noBenefits = displayItems.length === 0
    ? `<text x="540" y="900" text-anchor="middle" class="footerLead">สนใจร่วมงานกับเรา</text>
       <text x="540" y="950" text-anchor="middle" class="footerText">${esc(contact)}</text>`
    : '';

  return `<svg id="poster" xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="โปสเตอร์รับสมัคร ${esc(f.title || '')}">
    <defs>
      <clipPath id="photoClip"><rect x="${photoX}" y="0" width="580" height="810"/></clipPath>
      <linearGradient id="photoFade" x1="${imageOnLeft ? '1' : '0'}" y1="0" x2="${imageOnLeft ? '0' : '1'}" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/><stop offset="0.26" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#05244c" flood-opacity="0.18"/></filter>
      <style>
        text{font-family:'Kanit','Leelawadee UI','Tahoma',sans-serif}
        .footerText{fill:#fff;font-size:24px;font-weight:500}
        .footerLead{fill:#fff;font-size:38px;font-weight:700}
      </style>
    </defs>
    <rect width="1080" height="1080" fill="#ffffff"/>
    ${personUri ? `<image href="${esc(personUri)}" x="${photoX}" y="0" width="580" height="810" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>` : `<rect x="${photoX}" width="580" height="810" fill="#e8eff6"/>`}
    <rect x="${photoX}" y="0" width="580" height="810" fill="url(#photoFade)"/>

    <rect x="${imageOnLeft ? 520 : 0}" y="0" width="560" height="150" fill="#fff"/>
    ${f.logoVariant === 'so-red' && logoUri
      ? `<image href="${esc(logoUri)}" x="${logoX}" y="34" width="190" height="88" preserveAspectRatio="xMinYMid meet"/>`
      : `<text x="${logoX}" y="86" fill="#082b62" font-size="64" font-weight="800">SO</text><text x="${logoX + 5}" y="116" fill="#082b62" font-size="18" font-weight="700" letter-spacing="6">PEOPLE</text>`}

    <path d="${titlePath}" fill="#082b62"/>
    <rect x="${contentX}" y="182" width="220" height="46" rx="23" fill="#ffffff" fill-opacity="0.13"/>
    <text x="${contentX + 110}" y="213" text-anchor="middle" fill="#ffffff" font-size="23" font-weight="600">${esc(badge)}</text>
    ${textLines(titleLines, contentX, 302, 76, `fill="#ffffff" font-size="${roleSize}" font-weight="800" letter-spacing="-2"`)}
    ${locationLines.length ? `<circle cx="${contentX + 15}" cy="429" r="13" fill="#ffffff"/><circle cx="${contentX + 15}" cy="429" r="5" fill="#082b62"/>${textLines(locationLines, contentX + 42, 421, 31, 'fill="#ffffff" font-size="26" font-weight="500"')}` : ''}

    <g transform="translate(${contentX} 520)">
      <text x="0" y="0" fill="#58708a" font-size="23" font-weight="600">รายได้</text>
      ${textLines(salaryLines, 0, 66, 58, 'fill="#082b62" font-size="58" font-weight="800" letter-spacing="-1"')}
      ${quantity ? `<line x1="0" y1="165" x2="390" y2="165" stroke="#cad6e2" stroke-width="3"/><circle cx="28" cy="216" r="28" fill="#0d5fb8"/><path d="M15 216h26M28 203v26" stroke="#fff" stroke-width="5" stroke-linecap="round"/><text x="75" y="229" fill="#082b62" font-size="39" font-weight="800">${esc(quantity)}</text>` : ''}
    </g>

    <rect y="810" width="1080" height="270" fill="#082b62"/>
    <rect y="810" width="1080" height="8" fill="#0d5fb8"/>
    ${benefits}${noBenefits}
    <rect x="64" y="1018" width="952" height="44" rx="22" fill="#ffffff"/>
    <text x="88" y="1048" fill="#082b62" font-size="22" font-weight="600">สนใจสมัคร ทักเลย</text>
    <text x="992" y="1048" text-anchor="end" fill="#082b62" font-size="22" font-weight="700">${esc(contact)}</text>
    <metadata>${esc(JSON.stringify({ templateId: f.templateId, templateVersion: f.templateVersion, brandRuleVersion: f.brandRuleVersion }))}</metadata>
  </svg>`;
}

export function evaluatePosterVisual(fields = {}) {
  const f = fields ?? {};
  const checks = [
    { code: 'visual_template', label: 'Template งานออกแบบ', status: f.templateId === POSTER_TEMPLATE_ID && Number(f.templateVersion) === POSTER_TEMPLATE_VERSION ? 'pass' : 'fail', message: `ใช้ ${POSTER_TEMPLATE_ID} v${POSTER_TEMPLATE_VERSION}` },
    { code: 'visual_title_fit', label: 'ขนาดชื่อตำแหน่ง', status: compact(f.title).length <= 38 ? 'pass' : 'fail', message: compact(f.title).length <= 38 ? 'อยู่ในพื้นที่ปลอดภัย' : 'ชื่อตำแหน่งยาวเกินพื้นที่บนภาพ' },
    { code: 'visual_location_fit', label: 'ขนาดสถานที่', status: compact(f.location).length <= 62 ? 'pass' : 'warning', message: compact(f.location).length <= 62 ? 'อยู่ในพื้นที่ปลอดภัย' : 'สถานที่ยาว อาจถูกย่อบนภาพ' },
    { code: 'visual_layers', label: 'Layer ที่แก้ไขได้', status: 'pass', message: 'ภาพคนและข้อความถูกแยกคนละ Layer' },
  ];
  return checks;
}
