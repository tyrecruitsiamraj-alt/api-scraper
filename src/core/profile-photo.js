/**
 * Careful profile-photo helpers — reject site placeholders and pick the
 * current face for a candidate (newest successful download).
 */

/** JobBKK / generic default avatars that must never be stored as a person. */
export function isRejectedProfileUrl(url) {
  const value = String(url || '').trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  if (lower.startsWith('data:')) return true;
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
  return '';
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
