/**
 * SO PEOPLE recruitment poster — single source of truth for Web preview and PNG export.
 * AI supplies only the occupational photograph. All Thai text, brand layout and facts
 * are deterministic SVG layers so the preview cannot drift from the exported file.
 */

export const POSTER_TEMPLATE_ID = 'so-people-recruitment';
export const POSTER_TEMPLATE_VERSION = 3;
export const POSTER_BRAND_RULE_VERSION = 1;
export const POSTER_CANVAS = 1080;
export const POSTER_LAYOUT_KEYS = ['photo', 'logo', 'title', 'salary', 'footer', 'cta'];
export const POSTER_LAYER_LABELS = {
  photo: 'รูปคน',
  logo: 'โลโก้',
  title: 'ชื่อตำแหน่ง',
  salary: 'รายได้',
  footer: 'สวัสดิการ',
  cta: 'ปุ่มสมัคร',
};
export const POSTER_CAMPAIGN_SOURCE = '__campaign_source__';
export const POSTER_MAX_EXTRAS = 6;
export const POSTER_EXTRA_ORIGINS = {
  operator_upload: 'รูปที่อัปโหลด',
  campaign_source: 'รูปจากใบงาน',
  operator_text: 'ข้อความที่เพิ่ม',
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

function splitThai(value, maxChars = 24, maxLines = 2) {
  const source = compact(value);
  if (!source) return [];
  if (!source.includes(' ')) {
    const lines = [];
    const total = maxChars * maxLines;
    for (let index = 0; index < source.length && lines.length < maxLines; index += maxChars) {
      const last = lines.length === maxLines - 1 && source.length > total;
      const size = last ? Math.max(1, maxChars - 1) : maxChars;
      lines.push(`${source.slice(index, index + size)}${last ? '…' : ''}`);
    }
    return lines;
  }
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
  if (index === 1) return `<path d="M${cx - 18} ${cy - 6}h36v28h-36z" ${common}/><path d="M${cx - 8} ${cy - 6}v-10a8 8 0 0 1 16 0v10" ${common}/>`;
  if (index === 2) return `<circle cx="${cx - 16}" cy="${cy - 12}" r="12" ${common}/><circle cx="${cx + 17}" cy="${cy - 12}" r="12" ${common}/><path d="M${cx - 39} ${cy + 29}c3-22 14-31 26-31s23 9 26 31M${cx + 3} ${cy + 29}c2-17 10-25 21-25 10 0 19 8 21 25" ${common}/>`;
  return `<circle cx="${cx}" cy="${cy}" r="31" ${common}/><path d="M${cx} ${cy - 18}v20l15 10" ${common}/>`;
}

function pinIcon(cx, cy) {
  return `<path d="M${cx} ${cy + 8}c-8-12-12-19-12-24a12 12 0 1 1 24 0c0 5-4 12-12 24z" fill="#ffffff"/><circle cx="${cx}" cy="${cy - 16}" r="4.5" fill="#082b62"/>`;
}

function bahtMark(cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="30" fill="#082b62"/><text x="${cx}" y="${cy + 11}" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="700">฿</text>`;
}

function personMark(cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="30" fill="#082b62"/><circle cx="${cx}" cy="${cy - 8}" r="9" fill="none" stroke="#ffffff" stroke-width="5"/><path d="M${cx - 16} ${cy + 18}c4-12 10-16 16-16s12 4 16 16" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`;
}

function salaryAmount(value) {
  return compact(value).replace(/\s*บาท\s*$/u, '').trim();
}

function quantityCount(value) {
  return compact(value).replace(/\s*อัตรา\s*$/u, '').trim();
}

function isDefaultBadge(value) {
  return !compact(value) || compact(value) === 'เปิดรับสมัครด่วน';
}

function clampOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-900, Math.min(900, Math.round(n)));
}

export function emptyPosterLayout() {
  return Object.fromEntries(POSTER_LAYOUT_KEYS.map((key) => [key, { x: 0, y: 0 }]));
}

/** รับเฉพาะ offset ของ layer ที่ระบบรู้จัก กันค่าแปลกจากฟอร์มหรือร่างเก่า */
export function normalizePosterLayout(raw) {
  const layout = emptyPosterLayout();
  if (!raw || typeof raw !== 'object') return layout;
  for (const key of POSTER_LAYOUT_KEYS) {
    const item = raw[key];
    if (!item || typeof item !== 'object') continue;
    layout[key] = { x: clampOffset(item.x), y: clampOffset(item.y) };
  }
  return layout;
}

export function applyPosterLayoutDelta(layout, key, dx, dy) {
  const next = normalizePosterLayout(layout);
  if (!POSTER_LAYOUT_KEYS.includes(key)) return next;
  next[key] = {
    x: clampOffset(next[key].x + dx),
    y: clampOffset(next[key].y + dy),
  };
  return next;
}

function clampSize(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampOnCanvas(value, size) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-size + 40, Math.min(POSTER_CANVAS - 40, Math.round(n)));
}

function extraHandleId(id) {
  return `extra:${id}`;
}

function extraIdFromHandle(key) {
  return String(key || '').startsWith('extra:') ? String(key).slice(6) : '';
}

const DATA_URI_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i;

function sanitizeExtraSrc(raw, origin) {
  const src = String(raw ?? '').trim();
  if (origin === 'campaign_source' || src === POSTER_CAMPAIGN_SOURCE) return POSTER_CAMPAIGN_SOURCE;
  if (!DATA_URI_RE.test(src) || src.length > 450_000) return '';
  return src.replace(/\s+/g, '');
}

function normalizeExtraProvenance(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const origin = kind === 'text'
    ? 'operator_text'
    : raw.origin === 'campaign_source' ? 'campaign_source' : raw.origin === 'operator_upload' ? 'operator_upload' : '';
  if (!origin) return null;
  const addedAt = String(raw.addedAt || raw.added_at || '').trim();
  const addedBy = compact(raw.addedBy || raw.added_by).slice(0, 120);
  const filename = compact(raw.filename).slice(0, 120);
  return {
    origin,
    addedAt: addedAt || new Date().toISOString(),
    ...(addedBy ? { addedBy } : {}),
    ...(filename ? { filename } : {}),
  };
}

function extraLabel(item) {
  if (!item || typeof item !== 'object') return 'เลเยอร์ที่เพิ่ม';
  if (item.kind === 'text') return compact(item.text).slice(0, 16) || POSTER_EXTRA_ORIGINS.operator_text;
  return POSTER_EXTRA_ORIGINS[item.provenance?.origin] || 'รูปที่เพิ่ม';
}

export function emptyPosterExtras() {
  return [];
}

/** รับเฉพาะรูป/ข้อความที่คนเพิ่มเอง พร้อมที่มา ห้าม URL สต็อกหรือไฟล์ไม่มีที่มา */
export function normalizePosterExtras(raw) {
  if (!Array.isArray(raw)) return [];
  const extras = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || extras.length >= POSTER_MAX_EXTRAS) continue;
    const kind = item.kind === 'text' ? 'text' : item.kind === 'image' ? 'image' : '';
    if (!kind) continue;
    const provenance = normalizeExtraProvenance(item.provenance, kind);
    if (!provenance) continue;
    const id = compact(item.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `e${extras.length + 1}`;
    if (seen.has(id)) continue;
    const extra = {
      id,
      kind,
      x: clampOnCanvas(item.x, clampSize(item.w, 80, 720)),
      y: clampOnCanvas(item.y, clampSize(item.h, 48, 720)),
      w: clampSize(item.w, kind === 'text' ? 120 : 80, kind === 'text' ? 900 : 720),
      h: clampSize(item.h, kind === 'text' ? 48 : 80, kind === 'text' ? 420 : 720),
      provenance,
    };
    if (kind === 'image') {
      extra.src = sanitizeExtraSrc(item.src, provenance.origin);
      if (!extra.src) continue;
      if (provenance.origin === 'campaign_source' && extra.src !== POSTER_CAMPAIGN_SOURCE) continue;
      if (provenance.origin === 'operator_upload' && extra.src === POSTER_CAMPAIGN_SOURCE) continue;
    } else {
      extra.text = compact(item.text).slice(0, 180);
      if (!extra.text) continue;
    }
    seen.add(id);
    extras.push(extra);
  }
  return extras;
}

export function createPosterImageExtra({ src, origin, filename, addedBy, x = 64, y = 64, w = 240, h = 240 } = {}) {
  return normalizePosterExtras([{
    id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: 'image',
    x, y, w, h,
    src: origin === 'campaign_source' ? POSTER_CAMPAIGN_SOURCE : src,
    provenance: { origin, filename, addedBy, addedAt: new Date().toISOString() },
  }])[0] || null;
}

export function createPosterTextExtra({ text = 'ข้อความใหม่', addedBy, x = 72, y = 620, w = 360, h = 88 } = {}) {
  return normalizePosterExtras([{
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: 'text',
    x, y, w, h,
    text,
    provenance: { origin: 'operator_text', addedBy, addedAt: new Date().toISOString() },
  }])[0] || null;
}

/** ลากได้ทั้งเลเยอร์เทมเพลตและรูป/ข้อความที่คนเพิ่ม */
export function applyPosterFieldsDelta(rawFields, key, dx, dy) {
  const fields = withPosterTemplate(rawFields);
  if (POSTER_LAYOUT_KEYS.includes(key)) {
    return { ...fields, layout: applyPosterLayoutDelta(fields.layout, key, dx, dy) };
  }
  const extraId = extraIdFromHandle(key);
  if (!extraId) return fields;
  return {
    ...fields,
    extras: fields.extras.map((item) => {
      if (item.id !== extraId) return item;
      return {
        ...item,
        x: clampOnCanvas(item.x + dx, item.w),
        y: clampOnCanvas(item.y + dy, item.h),
      };
    }),
  };
}

/** ตัด data URI ออกก่อนตรวจคุณภาพ/เก็บผลตรวจ กันตัวเลขในไฟล์รูปไปปนกับเงินเดือน */
export function posterFieldsForQuality(rawFields = {}) {
  const fields = withPosterTemplate(rawFields);
  return {
    ...fields,
    extras: fields.extras.map((item) => (
      item.kind === 'image'
        ? { ...item, src: item.src === POSTER_CAMPAIGN_SOURCE ? POSTER_CAMPAIGN_SOURCE : '[operator-image]' }
        : item
    )),
  };
}

function posterLayerBases(fields) {
  const imageOnLeft = fields.imageSide === 'left';
  const contentX = imageOnLeft ? 584 : 56;
  const photoX = imageOnLeft ? 0 : 500;
  const logoX = imageOnLeft ? 800 : 56;
  const titleX = imageOnLeft ? 520 : 0;
  return {
    photo: { x: photoX, y: 0, w: 580, h: 760 },
    logo: { x: logoX, y: 24, w: 240, h: 112 },
    title: { x: titleX, y: 140, w: 560, h: 320 },
    salary: { x: contentX, y: 478, w: 430, h: 260 },
    footer: { x: 0, y: 760, w: 1080, h: 320 },
    cta: { x: 64, y: 1028, w: 952, h: 36 },
  };
}

/** กล่องเลเยอร์บนแคนวาส 1080 เพื่อให้พรีวิวลากกับไฟล์ PNG ใช้พิกัดชุดเดียวกัน */
export function getPosterLayerBoxes(rawFields = {}) {
  const fields = withPosterTemplate(rawFields);
  const layout = fields.layout;
  const bases = posterLayerBases(fields);
  const extras = Array.isArray(fields.extras) ? fields.extras.map((item) => ({
    id: extraHandleId(item.id),
    label: extraLabel(item),
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  })) : [];
  return [...POSTER_LAYOUT_KEYS.map((id) => {
    const base = bases[id];
    return {
      id,
      label: POSTER_LAYER_LABELS[id],
      x: base.x + layout[id].x,
      y: base.y + layout[id].y,
      w: base.w,
      h: base.h,
    };
  }), ...extras];
}

export function withPosterTemplate(fields = {}) {
  const storedVersion = Number(fields.templateVersion);
  const stale = Number.isFinite(storedVersion) && storedVersion > 0 && storedVersion < POSTER_TEMPLATE_VERSION;
  const extras = normalizePosterExtras(fields.extras);
  return {
    ...fields,
    logoVariant: fields.logoVariant === 'so-red' ? 'so-red' : 'people-navy',
    layout: stale ? emptyPosterLayout() : normalizePosterLayout(fields.layout),
    extras: stale ? [] : extras,
    templateId: POSTER_TEMPLATE_ID,
    templateVersion: POSTER_TEMPLATE_VERSION,
    brandRuleVersion: POSTER_BRAND_RULE_VERSION,
  };
}

/**
 * แบบมาตรฐานของชุดโปสเตอร์ (templateId) — เก็บการจัดวางและช่องข้อความ
 * ห้ามเก็บ data URI / ไฟล์รูปคนจากงานอื่น ห้ามย้ายข้อเท็จจริงใบขอ
 */
export function posterStandardFromFields(rawFields = {}) {
  const fields = withPosterTemplate(rawFields);
  const extras = [];
  for (const item of fields.extras) {
    if (extras.length >= POSTER_MAX_EXTRAS) break;
    const box = {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    };
    if (item.kind === 'text' && compact(item.text)) {
      extras.push({ kind: 'text', ...box, text: compact(item.text).slice(0, 180) });
      continue;
    }
    if (item.kind === 'image' && item.provenance?.origin === 'campaign_source') {
      extras.push({ kind: 'source_photo_slot', ...box });
      continue;
    }
    if (item.kind === 'image' && item.provenance?.origin === 'operator_upload') {
      extras.push({ kind: 'upload_slot', ...box });
    }
  }
  return normalizePosterStandard({
    templateId: fields.templateId,
    templateVersion: fields.templateVersion,
    layout: fields.layout,
    imageSide: fields.imageSide,
    logoVariant: fields.logoVariant,
    extras,
  }) ?? {
    templateId: POSTER_TEMPLATE_ID,
    templateVersion: POSTER_TEMPLATE_VERSION,
    layout: emptyPosterLayout(),
    imageSide: 'right',
    logoVariant: 'people-navy',
    extras: [],
  };
}

/** รับเฉพาะโครงเลเยอร์ ตัด src/data URI และของที่ไม่รู้จักออกทุกครั้งก่อนเก็บ */
export function normalizePosterStandard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const extras = [];
  if (Array.isArray(raw.extras)) {
    for (const item of raw.extras) {
      if (!item || typeof item !== 'object' || extras.length >= POSTER_MAX_EXTRAS) continue;
      const w = clampSize(item.w, item.kind === 'text' ? 120 : 80, item.kind === 'text' ? 900 : 720);
      const h = clampSize(item.h, item.kind === 'text' ? 48 : 80, item.kind === 'text' ? 420 : 720);
      const box = { x: clampOnCanvas(item.x, w), y: clampOnCanvas(item.y, h), w, h };
      if (item.kind === 'text') {
        const text = compact(item.text).slice(0, 180);
        if (!text || text === 'ข้อความใหม่' || /data:image/i.test(text)) continue;
        extras.push({ kind: 'text', ...box, text });
        continue;
      }
      if (item.kind === 'source_photo_slot' || (item.kind === 'image' && (item.src === POSTER_CAMPAIGN_SOURCE || item.provenance?.origin === 'campaign_source'))) {
        extras.push({ kind: 'source_photo_slot', ...box });
        continue;
      }
      if (item.kind === 'upload_slot' || (item.kind === 'image' && item.provenance?.origin === 'operator_upload')) {
        extras.push({ kind: 'upload_slot', ...box });
      }
    }
  }
  return {
    templateId: POSTER_TEMPLATE_ID,
    templateVersion: POSTER_TEMPLATE_VERSION,
    layout: normalizePosterLayout(raw.layout),
    imageSide: raw.imageSide === 'left' ? 'left' : 'right',
    logoVariant: raw.logoVariant === 'so-red' ? 'so-red' : 'people-navy',
    extras,
  };
}

/** งานใหม่ได้ตำแหน่งเลเยอร์และกล่องข้อความ — รูปคนยังเป็นภาพต้นฉบับของงานนั้นเอง */
export function applyPosterStandard(rawFields = {}, rawStandard) {
  const fields = withPosterTemplate(rawFields);
  if (Number(rawStandard?.templateVersion) !== POSTER_TEMPLATE_VERSION) {
    return fields;
  }
  const standard = normalizePosterStandard(rawStandard);
  if (!standard) return fields;
  const extras = [];
  for (const item of standard.extras) {
    if (item.kind === 'text') {
      extras.push({
        id: `stdt${extras.length + 1}`,
        kind: 'text',
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        text: item.text,
        provenance: { origin: 'operator_text', addedAt: new Date().toISOString() },
      });
      continue;
    }
    if (item.kind === 'source_photo_slot') {
      extras.push({
        id: `stds${extras.length + 1}`,
        kind: 'image',
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        src: POSTER_CAMPAIGN_SOURCE,
        provenance: { origin: 'campaign_source', addedAt: new Date().toISOString() },
      });
    }
  }
  return withPosterTemplate({
    ...fields,
    layout: standard.layout,
    imageSide: standard.imageSide,
    logoVariant: standard.logoVariant,
    extras: normalizePosterExtras(extras),
  });
}

export function posterStandardFingerprint(standard) {
  const normalized = normalizePosterStandard(standard);
  if (!normalized) return '';
  return JSON.stringify(normalized);
}

function layerGroup(id, offset, inner) {
  return `<g data-poster-layer="${id}" transform="translate(${offset.x} ${offset.y})">${inner}</g>`;
}

/**
 * @param {Record<string, any>} rawFields
 * @param {string|null} personUri data URI on the worker, API URL in the Web preview
 * @param {string|null} logoUri data URI on the worker, public URL in the Web preview
 */
export function buildPosterSvg(rawFields = {}, personUri = null, logoUri = null) {
  const f = withPosterTemplate(rawFields);
  const imageOnLeft = f.imageSide === 'left';
  const bases = posterLayerBases(f);
  const contentX = bases.salary.x;
  const photoX = bases.photo.x;
  const titleLines = splitThai(f.title || 'เปิดรับสมัครงาน', 14, 2);
  const locationLines = splitThai(f.location, 28, 2);
  const amount = salaryAmount(f.salaryTotal);
  const salaryLines = splitThai(amount || 'ตามโครงสร้างบริษัท', 14, 2);
  const qtyCount = quantityCount(f.quantity);
  const badge = compact(f.badge);
  const showBadge = Boolean(badge) && !isDefaultBadge(badge);
  const contact = compact(f.contactLine);
  const footerItems = (Array.isArray(f.benefits) ? f.benefits : [])
    .map(compact).filter(Boolean).slice(0, 4);
  if (footerItems.length <= 2 && compact(f.worktime)) footerItems.push(compact(f.worktime));
  const displayItems = footerItems.slice(0, 4);
  const itemWidth = displayItems.length ? 920 / displayItems.length : 920;
  const titlePath = imageOnLeft
    ? 'M510 140 H1080 V460 H510 Q450 300 510 140Z'
    : 'M0 140 H570 Q630 300 570 460 H0Z';
  const logoX = bases.logo.x;
  const roleSize = titleLines.join('').length > 18 ? 56 : titleLines.length > 1 ? 64 : 76;
  const layout = f.layout;
  const titleY = showBadge ? 286 : 248;

  const benefits = displayItems.map((item, index) => {
    const x = 80 + (index * itemWidth);
    const cx = x + (itemWidth / 2);
    const lines = splitThai(item, displayItems.length <= 1 ? 40 : displayItems.length === 2 ? 18 : displayItems.length === 3 ? 12 : 8, 2);
    return `<g>${benefitIcon(index, cx, 848)}${textLines(lines, cx, 918, 28, 'text-anchor="middle" class="footerText"')}</g>`;
  }).join('');

  const noBenefits = displayItems.length === 0
    ? `<text x="540" y="870" text-anchor="middle" class="footerLead">สนใจร่วมงานกับเรา</text>
       ${contact ? `<text x="540" y="930" text-anchor="middle" class="footerText">${esc(contact)}</text>` : ''}`
    : '';

  const photoInner = `<clipPath id="photoClip"><rect x="${photoX}" y="0" width="580" height="760"/></clipPath>
    ${personUri
    ? `<image href="${esc(personUri)}" x="${photoX}" y="0" width="580" height="760" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>`
    : `<rect x="${photoX}" width="580" height="760" fill="#e8eff6"/>`}
    <rect x="${photoX}" y="0" width="580" height="760" fill="url(#photoFade)"/>`;

  const logoInner = f.logoVariant === 'so-red' && logoUri
    ? `<image href="${esc(logoUri)}" x="${logoX}" y="28" width="190" height="88" preserveAspectRatio="xMinYMid meet"/>`
    : `<text x="${logoX}" y="78" fill="#082b62" font-size="62" font-weight="800">SO</text>
       <text x="${logoX + 2}" y="104" fill="#082b62" font-size="16" font-weight="700" letter-spacing="5.5">PEOPLE</text>
       <text x="${logoX + 2}" y="126" fill="#082b62" font-size="11" font-weight="600" letter-spacing="1.6">WE MAKE IT EASY</text>`;

  const titleInner = `<path d="${titlePath}" fill="#082b62"/>
    ${showBadge ? `<rect x="${contentX}" y="168" width="220" height="42" rx="21" fill="#ffffff" fill-opacity="0.13"/><text x="${contentX + 110}" y="197" text-anchor="middle" fill="#ffffff" font-size="21" font-weight="600">${esc(badge)}</text>` : ''}
    ${textLines(titleLines, contentX, titleY, 72, `fill="#ffffff" font-size="${roleSize}" font-weight="800" letter-spacing="-2"`)}
    ${locationLines.length ? `${pinIcon(contentX + 14, 404)}${textLines(locationLines, contentX + 38, 400, 30, 'fill="#ffffff" font-size="24" font-weight="500"')}` : ''}`;

  const salaryEndY = 86 + ((salaryLines.length - 1) * 56);
  const salaryInner = `${bahtMark(30, 36)}
      <text x="78" y="28" fill="#5b738c" font-size="22" font-weight="600">รายได้</text>
      ${textLines(salaryLines, 78, 86, 56, 'fill="#082b62" font-size="56" font-weight="800" letter-spacing="-1"')}
      <text x="78" y="${salaryEndY + 34}" fill="#082b62" font-size="24" font-weight="600">บาท</text>
      ${qtyCount ? `${personMark(30, salaryEndY + 102)}<text x="78" y="${salaryEndY + 96}" fill="#082b62" font-size="48" font-weight="800">${esc(qtyCount)}</text><text x="${78 + Math.min(48, qtyCount.length * 28) + 18}" y="${salaryEndY + 96}" fill="#082b62" font-size="24" font-weight="600">อัตรา</text>` : ''}`;

  let extrasSvg = '';
  try {
    extrasSvg = (Array.isArray(f.extras) ? f.extras : []).map((item) => {
    if (item.kind === 'image') {
      const fromBrief = item.src === POSTER_CAMPAIGN_SOURCE || item.provenance?.origin === 'campaign_source';
      const href = fromBrief ? personUri : item.src;
      const inner = href
        ? `<svg width="${item.w}" height="${item.h}" viewBox="0 0 ${item.w} ${item.h}" overflow="hidden">
             <image href="${esc(href)}" width="${item.w}" height="${item.h}" preserveAspectRatio="xMidYMid slice"/>
           </svg>
           <rect width="${item.w}" height="${item.h}" fill="none" stroke="#ffffff" stroke-width="6"/>`
        : `<rect width="${item.w}" height="${item.h}" fill="#dbe7f3"/>`;
      return layerGroup(extraHandleId(item.id), { x: item.x, y: item.y }, inner);
    }
    const maxChars = Math.max(8, Math.floor(item.w / 18));
    const lines = splitThai(item.text, maxChars, 4);
    const lineHeight = lines.length > 2 ? 28 : 34;
    const inner = `<rect width="${item.w}" height="${item.h}" rx="14" fill="#ffffff" fill-opacity="0.94" stroke="#082b62" stroke-width="4"/>
      ${textLines(lines, item.w / 2, 36, lineHeight, 'text-anchor="middle" fill="#082b62" font-size="28" font-weight="800"')}`;
    return layerGroup(extraHandleId(item.id), { x: item.x, y: item.y }, inner);
    }).join('');
  } catch {
    extrasSvg = '';
  }

  return `<svg id="poster" xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="โปสเตอร์รับสมัคร ${esc(f.title || '')}">
    <defs>
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
    ${layerGroup('photo', layout.photo, photoInner)}
    <rect x="${imageOnLeft ? 520 : 0}" y="0" width="560" height="150" fill="#fff"/>
    ${layerGroup('logo', layout.logo, logoInner)}
    ${layerGroup('title', layout.title, titleInner)}
    <g data-poster-layer="salary" transform="translate(${bases.salary.x + layout.salary.x} ${bases.salary.y + layout.salary.y})">
      ${salaryInner}
    </g>
    ${layerGroup('footer', layout.footer, `<rect y="760" width="1080" height="320" fill="#082b62"/><rect y="760" width="1080" height="8" fill="#0d5fb8"/>${benefits}${noBenefits}`)}
    ${layerGroup('cta', layout.cta, '')}
    ${extrasSvg}
    <metadata>${esc(JSON.stringify({
      templateId: f.templateId,
      templateVersion: f.templateVersion,
      brandRuleVersion: f.brandRuleVersion,
      layout,
      extras: (f.extras || []).map((item) => ({
        id: item.id,
        kind: item.kind,
        origin: item.provenance?.origin || null,
      })),
    }))}</metadata>
  </svg>`;
}

export function evaluatePosterVisual(fields = {}) {
  const storedVersion = Number(fields.templateVersion);
  const f = withPosterTemplate(fields ?? {});
  const extras = f.extras;
  const unlabeled = extras.filter((item) => !item.provenance?.origin);
  const extraNote = extras.length
    ? extras.map((item) => extraLabel(item)).join(' · ')
    : 'ยังไม่มีรูปหรือข้อความเพิ่มนอกเทมเพลต';
  const versionOk = storedVersion === POSTER_TEMPLATE_VERSION;
  const checks = [
    { code: 'visual_template', label: 'Template งานออกแบบ', status: f.templateId === POSTER_TEMPLATE_ID && versionOk ? 'pass' : 'fail', message: versionOk ? `ใช้ ${POSTER_TEMPLATE_ID} v${POSTER_TEMPLATE_VERSION}` : 'โปสเตอร์ยังเป็นรุ่นเก่า ต้องประกอบใหม่ก่อนอนุมัติ' },
    { code: 'visual_title_fit', label: 'ขนาดชื่อตำแหน่ง', status: compact(f.title).length <= 38 ? 'pass' : 'fail', message: compact(f.title).length <= 38 ? 'อยู่ในพื้นที่ปลอดภัย' : 'ชื่อตำแหน่งยาวเกินพื้นที่บนภาพ' },
    { code: 'visual_location_fit', label: 'ขนาดสถานที่', status: compact(f.location).length <= 62 ? 'pass' : 'warning', message: compact(f.location).length <= 62 ? 'อยู่ในพื้นที่ปลอดภัย' : 'สถานที่ยาว อาจถูกย่อบนภาพ' },
    { code: 'visual_layers', label: 'Layer ที่แก้ไขได้', status: 'pass', message: 'รูปคน โลโก้ ข้อความ และสวัสดิการแยกเลเยอร์ ลากย้ายตำแหน่งได้โดยไม่เปลี่ยนภาพต้นฉบับ' },
    { code: 'visual_extra_layers', label: 'รูปและข้อความที่เพิ่ม', status: unlabeled.length ? 'fail' : 'pass', message: unlabeled.length ? 'พบรูปหรือข้อความที่ไม่มีที่มา ห้ามใช้รูปสต็อกโดยไม่ระบุแหล่ง' : extraNote },
  ];
  return checks;
}
