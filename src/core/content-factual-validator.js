import { createHash } from 'node:crypto';
import { resolveContentJobSpec } from './content-job-spec.js';

const UNSUPPORTED_CLAIMS = [
  'ด่วน',
  'เริ่มงานได้ทันที',
  'เริ่มงานทันที',
  'งานมั่นคง',
  'โอกาสเติบโต',
  'รายได้ดี',
  'โบนัส',
  'ประกันสุขภาพ',
  'เบี้ยขยัน',
  'ค่าคอมมิชชั่น',
];

function text(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function flattenEvidence(value, out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenEvidence(item, out);
  } else if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenEvidence(item, out);
  } else if (typeof value === 'string' || typeof value === 'number') {
    const normalized = text(value);
    if (normalized) out.push(normalized);
  }
  return out;
}

function numberTokens(value) {
  return [...text(value).matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => m[0].replace(/,/g, '').replace(/^0+(?=\d)/, ''))
    .filter(Boolean);
}

function posterText(poster = {}) {
  poster = poster || {};
  return [
    poster.title,
    poster.badge,
    poster.location,
    poster.worktime,
    poster.salaryTotal,
    poster.salaryBreakdown,
    ...(poster.qualifications || []),
    ...(poster.benefits || []),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Deterministic gate after generation. It intentionally checks high-risk facts,
 * while leaving tone/wording to the reviewer and experiment loop.
 */
export function validateRecruitContent({
  campaign = {},
  caption = '',
  poster = null,
  requireCaption = true,
} = {}) {
  const snapshot = campaign.snapshot ?? campaign.request_snapshot ?? {};
  const spec = campaign.jobSpec ?? resolveContentJobSpec({
    title: campaign.title,
    positions: campaign.positions,
    snapshot,
  });
  const position = text(spec.position);
  const evidenceParts = flattenEvidence({
    title: campaign.title,
    positions: campaign.positions,
    province: campaign.province,
    qty: campaign.qty,
    remaining_qty: campaign.remaining_qty,
    snapshot,
  });
  const evidence = evidenceParts.join('\n');
  const generated = [caption, posterText(poster)].filter(Boolean).join('\n');
  const generatedNorm = text(generated);
  const errors = [];
  const warnings = [];

  if (!position) errors.push({ code: 'missing_position', message: 'ใบขอไม่มีตำแหน่งงานจริง' });
  if (requireCaption && !text(caption)) {
    errors.push({ code: 'missing_caption', message: 'แคปชันว่าง' });
  }
  if (requireCaption && position && !text(caption).includes(position)) {
    errors.push({
      code: 'position_not_in_caption',
      message: `แคปชันไม่ได้ระบุตำแหน่งจริง “${spec.position}”`,
    });
  }

  if (poster) {
    if (position && text(poster.title) !== position) {
      errors.push({
        code: 'poster_position_mismatch',
        message: `ตำแหน่งบนโปสเตอร์ “${poster.title || ''}” ไม่ตรงกับ “${spec.position}”`,
      });
    }
    const location = text(poster.location);
    if (location && !evidence.includes(location)) {
      errors.push({
        code: 'unsupported_location',
        message: `สถานที่บนโปสเตอร์ไม่มีในใบขอ: ${poster.location}`,
      });
    }
    for (const benefit of poster.benefits || []) {
      const b = text(benefit);
      if (b && !evidence.includes(b)) {
        errors.push({
          code: 'unsupported_benefit',
          message: `สวัสดิการไม่มีในใบขอ: ${benefit}`,
        });
      }
    }
  }

  const allowedNumbers = new Set(numberTokens(evidence));
  for (const token of new Set(numberTokens(generated))) {
    if (!allowedNumbers.has(token)) {
      errors.push({
        code: 'unsupported_number',
        message: `พบตัวเลขที่ไม่มีในใบขอ: ${token}`,
      });
    }
  }

  for (const claim of UNSUPPORTED_CLAIMS) {
    const normalizedClaim = text(claim);
    if (generatedNorm.includes(normalizedClaim) && !evidence.includes(normalizedClaim)) {
      errors.push({
        code: 'unsupported_claim',
        message: `พบคำกล่าวอ้างที่ไม่มีในใบขอ: ${claim}`,
      });
    }
  }

  if (!poster) warnings.push({ code: 'no_poster_fields', message: 'ไม่มีข้อมูลโปสเตอร์ให้ตรวจ' });
  const evidenceHash = createHash('sha256').update(evidence, 'utf8').digest('hex');
  const contentHash = createHash('sha256').update(text(caption), 'utf8').digest('hex');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    evidence_hash: evidenceHash,
    content_hash: contentHash,
    poster_validated: !!poster,
    checked_at: new Date().toISOString(),
    resolved_position: spec.position || null,
  };
}
