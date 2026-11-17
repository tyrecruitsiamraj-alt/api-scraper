/**
 * Careful profile-photo helpers — reject site placeholders and pick the
 * current face for a candidate (newest successful download).
 */

/**
 * รูปแทนของเว็บที่ส่งมาแทนรูปคน (ตรวจจากไบต์ของรูปในฐาน 17 พ.ย. 2569):
 * JobThai resume_image.php ส่งรูปเงาคนเมื่อไม่มีรูป และรูป "ปกปิดโดยผู้สมัคร" — ลิงก์ต่างกันทุกคนแต่ไบต์เหมือนกัน
 * เคยถูกเก็บเป็นรูปผู้สมัคร 122 คน
 */
export const PLACEHOLDER_PHOTO_SHA256 = new Set([
  '7350a994afbe0bd7f780a7fb2c5d938a7e8a8f8b987f774a2b88afe6ade3b132', // JobThai เงาคน
  '774804b5c60d0d3ae47ffaa006277a623c201a1971700918981c976adc16779e', // JobThai เงาคน
  '9d7d318164bbf45e1d9bf920c93aa998449349e6b0262712e565fc2de4d3aebf', // JobThai "ปกปิดโดยผู้สมัคร"
]);

export function isPlaceholderPhotoHash(sha) {
  return PLACEHOLDER_PHOTO_SHA256.has(String(sha || '').toLowerCase());
}

/** รูปผู้สมัครจริงของ JobBKK อยู่ที่ store.jobbkk.com/upload/jobseeker/ (ตรงหรือห่อด้วย _next/image) */
const JOBBKK_FACE_RE = /store\.jobbkk\.com\/upload\/jobseeker\//i;

function decodedUrl(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** JobBKK / generic default avatars that must never be stored as a person. */
export function isRejectedProfileUrl(url) {
  const value = String(url || '').trim();
  if (!value) return true;
  const lower = decodedUrl(value).toLowerCase();
  if (lower.startsWith('data:')) return true;
  // รูปในโฟลเดอร์ธีมของ JobBKK เป็นของหน้าเว็บทั้งหมด: mem_prof_pic, default_user, protected_th_men/women (17 พ.ย. 2569)
  if (/\/assets\/template\/|default_user|mem_prof_pic|protected_th_(?:men|women)/i.test(lower)) return true;
  if (/\/img\/profile(?:_default)?\.(?:jpg|jpeg|png|gif|webp)/i.test(lower)) return true;
  if (/default[-_]?profile|no[-_]?photo|no[-_]?image|avatar[-_]?default|placeholder|anonymous/i.test(lower)) return true;
  if (/\/logo|\/favicon|employer[_-]?login|register_page/i.test(lower)) return true;
  return false;
}

/**
 * Prefer explicit profile nodes; never fall back to random page images
 * (e.g. `.main-name img` which can be chrome/ads).
 */
export function pickJobbkkProfileImageUrl($) {
  const selectors = [
    '.img-profile',
    'img.img-profile',
    '.pic-profile img',
    '.profile-image img',
    '#rsm-profile img',
  ];
  for (const selector of selectors) {
    const node = $(selector).first();
    if (!node.length) continue;
    const src = String(node.attr('src') || node.attr('data-src') || '').trim();
    if (src && !isRejectedProfileUrl(src)) return src;
  }
  // หน้าใหม่ไม่มีคลาสข้างบน (พ.ย. 2569 ได้รูปแค่ 30 จาก 137 คน) — หา <img> ที่ชี้ไปที่เก็บรูปผู้สมัครเท่านั้น ไม่หยิบรูปอื่นของหน้า
  let face = '';
  $('img').each((_, el) => {
    if (face) return;
    for (const attr of ['src', 'data-src', 'srcset']) {
      const raw = String($(el).attr(attr) || '').trim().split(/\s+/)[0];
      if (raw && JOBBKK_FACE_RE.test(decodedUrl(raw)) && !isRejectedProfileUrl(raw)) {
        face = raw;
        return;
      }
    }
  });
  return face;
}

/** Newest successful profile asset — shared by list/detail/PDF. */
export function pickCurrentProfileAsset(assets = []) {
  const rows = Array.isArray(assets) ? assets : [];
  const ok = rows.filter((asset) => (
    asset
    && asset.kind === 'profile'
    && asset.download_status === 'success'
    && asset.id
  ));
  if (!ok.length) return null;
  return [...ok].sort((a, b) => {
    const ta = Date.parse(a.created_at || '') || 0;
    const tb = Date.parse(b.created_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  })[0];
}
