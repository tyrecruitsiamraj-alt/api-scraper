const VERSION = 'quality-v1';
const MIN_SCORE = 70;

function normalized(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function countHashtags(value) {
  return (String(value ?? '').match(/#[^\s#]+/g) || []).length;
}

function dimension(score, max, notes = []) {
  return { score: Math.max(0, Math.min(max, score)), max, notes };
}

/** Pure deterministic scorecard. AI may propose work; this gate decides whether it can reach approval. */
export function scoreRecruitContent({ campaign = {}, jobSpec = {}, caption = '', poster = null, factualValidation = {}, research = null, hasImage = false } = {}) {
  const text = normalized(caption);
  const position = normalized(jobSpec.position || campaign.positions || campaign.title);
  const location = normalized(campaign.province || campaign.snapshot?.location || campaign.request_snapshot?.location);
  const blockers = [];
  const warnings = [];

  const identityNotes = [];
  let identityScore = 0;
  if (position && text.includes(position)) identityScore += 14;
  else {
    blockers.push('caption_missing_resolved_position');
    identityNotes.push('Caption ไม่มีตำแหน่งจริง');
  }
  if (poster && normalized(poster.title) === position) identityScore += 6;
  else {
    blockers.push('poster_position_mismatch');
    identityNotes.push('ตำแหน่งบนโปสเตอร์ไม่ตรง');
  }

  const factualErrors = Array.isArray(factualValidation.errors) ? factualValidation.errors : [];
  let factualScore = factualValidation.valid ? 24 : Math.max(0, 24 - factualErrors.length * 8);
  if (factualValidation.poster_validated) factualScore += 6;
  if (!factualValidation.valid) blockers.push(...factualErrors.map((e) => e.code || 'factual_error'));
  if (!factualValidation.poster_validated) blockers.push('poster_not_validated');

  const completenessNotes = [];
  let completenessScore = 6; // position is already mandatory
  if (!location || text.includes(location)) completenessScore += 3;
  else completenessNotes.push('มีสถานที่ในใบขอแต่ Caption ไม่กล่าวถึง');
  const qty = campaign.qty || campaign.remaining_qty;
  if (!qty || text.includes(String(qty))) completenessScore += 2;
  else completenessNotes.push('มีจำนวนรับแต่ Caption ไม่กล่าวถึง');
  if (/(?:สมัคร|สนใจ|ติดต่อ|ทัก|ทีมสรรหา)/iu.test(caption)) completenessScore += 4;
  else completenessNotes.push('ยังไม่มี CTA ชัดเจน');

  const copyNotes = [];
  let copyScore = 0;
  const length = String(caption).trim().length;
  if (length >= 80 && length <= 1200) copyScore += 6;
  else copyNotes.push(`ความยาว ${length} ตัวอักษรอยู่นอกช่วงแนะนำ`);
  const hashtags = countHashtags(caption);
  if (hashtags >= 2 && hashtags <= 8) copyScore += 3;
  else copyNotes.push(`Hashtag ${hashtags} รายการ`);
  if (String(caption).split(/\n+/).filter((line) => line.trim()).length >= 3) copyScore += 3;
  else copyNotes.push('ควรแบ่งข้อความให้อ่านบนมือถือได้ง่ายขึ้น');
  if (!/(.)\1{5,}/u.test(caption)) copyScore += 3;

  const visualNotes = [];
  let visualScore = 0;
  if (poster) visualScore += 6;
  else visualNotes.push('ไม่มี poster fields');
  if (hasImage) visualScore += 5;
  else visualNotes.push('ยังไม่มีภาพประกอบ');
  if (poster && (poster.qualifications || []).length <= 6 && (poster.benefits || []).length <= 4) visualScore += 4;
  else if (poster) visualNotes.push('ข้อมูลบนโปสเตอร์หนาแน่นเกินเกณฑ์');

  const evidenceNotes = [];
  let evidenceScore = 0;
  if (factualValidation.evidence_hash) evidenceScore += 3;
  else evidenceNotes.push('ไม่มี evidence hash');
  const observed = (research?.trendEvidence || research?.trends || []).some?.(
    (item) => item?.score_type === 'observed' || item?.observed_count || item?.observed_volume,
  );
  if (observed) evidenceScore += 2;
  else {
    evidenceScore += 1;
    warnings.push('trend_not_observed');
    evidenceNotes.push('Trend ยังไม่มี observed evidence');
  }

  const dimensions = {
    job_identity: dimension(identityScore, 20, identityNotes),
    factual: dimension(factualScore, 30, factualErrors.map((e) => e.message || e.code)),
    completeness: dimension(completenessScore, 15, completenessNotes),
    copy: dimension(copyScore, 15, copyNotes),
    visual: dimension(visualScore, 15, visualNotes),
    evidence: dimension(evidenceScore, 5, evidenceNotes),
  };
  const overallScore = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  const hardGatePassed = blockers.length === 0 && overallScore >= MIN_SCORE;
  if (overallScore < MIN_SCORE) blockers.push(`quality_below_${MIN_SCORE}`);

  return {
    overall_score: overallScore,
    hard_gate_passed: hardGatePassed,
    dimensions,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    evaluator_version: VERSION,
    minimum_score: MIN_SCORE,
  };
}

export const CONTENT_QUALITY_VERSION = VERSION;
export const CONTENT_QUALITY_MIN_SCORE = MIN_SCORE;
