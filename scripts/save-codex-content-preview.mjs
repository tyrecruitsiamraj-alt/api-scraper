/**
 * บันทึกรูปที่สร้างจาก Codex + Caption ที่ยึด ERP เป็น Preview บนหน้า Web
 * Preview ถูกติดป้าย generation_mode=preview และฝั่ง Server ห้ามนำไปโพสต์จริง
 *
 * Usage: node scripts/save-codex-content-preview.mjs <request-no> <image-path>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { closePool, query, withTransaction } from '../src/db/pool.js';
import { extractCampaignFacts } from '../src/core/campaign-facts.js';
import { buildGroundedCaption } from '../src/core/content-gen.js';
import { evaluateContentQuality } from '../src/core/content-quality.js';
import { assessMarketResearch, loadCampaignMarketResearch } from '../src/core/market-research.js';

const requestNo = String(process.argv[2] || '').trim();
const imagePath = path.resolve(String(process.argv[3] || '').trim());
if (!requestNo || !process.argv[3]) {
  throw new Error('Usage: node scripts/save-codex-content-preview.mjs <request-no> <image-path>');
}

try {
  const { rows } = await query(
    `SELECT * FROM recruit_campaigns WHERE request_no=$1 ORDER BY updated_at DESC LIMIT 1`,
    [requestNo],
  );
  const campaign = rows[0];
  if (!campaign) throw new Error(`ไม่พบงาน ${requestNo}`);

  const facts = extractCampaignFacts(campaign);
  const caption = buildGroundedCaption(campaign);
  const imageBytes = await fs.readFile(imagePath);
  const imageMime = path.extname(imagePath).toLowerCase() === '.jpg' || path.extname(imagePath).toLowerCase() === '.jpeg'
    ? 'image/jpeg'
    : 'image/png';
  const evidence = await loadCampaignMarketResearch(campaign.id);
  const researchGate = assessMarketResearch({ evidence }, { requireFacebook: false });
  const quality = evaluateContentQuality({
    campaign,
    caption,
    imageReady: imageBytes.length > 0,
    researchGate,
  });
  if (quality.blocking) throw new Error(quality.summary);

  const posterFields = {
    title: facts.position,
    badge: 'เปิดรับสมัครด่วน',
    location: facts.location,
    worktime: facts.workSchedule,
    salaryTotal: /^\d+$/.test(String(facts.income || '').trim())
      ? Number(facts.income).toLocaleString('th-TH')
      : facts.income,
    salaryBreakdown: '',
    quantity: facts.qty ? `${facts.qty} อัตรา` : '',
    qualifications: [
      facts.gender ? (['o', 'all', 'any', 'a', 'ไม่จำกัด'].includes(String(facts.gender).toLowerCase()) ? 'ไม่จำกัดเพศ' : `เพศ ${facts.gender}`) : '',
      facts.ageMin || facts.ageMax ? `อายุ ${facts.ageMin || ''}–${facts.ageMax || ''} ปี` : '',
      facts.education ? `วุฒิการศึกษา ${facts.education}` : '',
    ].filter(Boolean),
    benefits: [],
    contactLine: facts.contactPhone || '',
  };

  const genNotes = {
    generation_mode: 'preview',
    preview_notice: 'สร้างบน Codex ชั่วคราว ห้ามโพสต์จนกว่า Worker จะสร้าง Production ใหม่',
    research_evidence: evidence.length,
    research_gate: researchGate,
    research_sources: evidence.slice(0, 12).map((item) => ({
      type: item.source_type,
      url: item.source_url,
      query: item.query_term,
      reactions: Number(item.reactions) || 0,
      comments: Number(item.comments) || 0,
      shares: Number(item.shares) || 0,
    })),
    imageStyle: `ภาพถ่ายสมจริงของ ${facts.position} ในบริบท ${facts.roleEvidence || facts.location}`,
    image_generation: {
      ok: true,
      provider: 'codex-imagegen-preview',
      model: 'codex-imagegen',
      prompt: `ตำแหน่ง ${facts.position} · สถานที่ ${facts.location} · ไม่มีข้อความหรือตราสินค้า`,
    },
  };

  const saved = await withTransaction(async (client) => {
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version),0)::int + 1 AS version FROM campaign_contents WHERE campaign_id=$1`,
      [campaign.id],
    );
    const version = versionResult.rows[0].version;
    const inserted = await client.query(
      `INSERT INTO campaign_contents
         (campaign_id, version, platform, caption, image_bytes, image_mime,
          source_image_bytes, source_image_mime, poster_fields, gen_model, status, gen_notes,
          quality_status, quality_score, quality_checks, quality_checked_at)
       VALUES ($1, $2, 'facebook', $3, $4, $5, $4, $5, $6::jsonb,
               'codex-imagegen-preview', 'draft', $7::jsonb, $8, $9, $10::jsonb, now())
       RETURNING id, version`,
      [campaign.id, version, caption, imageBytes, imageMime, JSON.stringify(posterFields), JSON.stringify(genNotes),
        quality.status, quality.score, JSON.stringify(quality)],
    );
    await client.query(
      `UPDATE recruit_campaigns
          SET status='pending_approval',
              status_note='Preview ชั่วคราวจาก Codex — ตรวจรูปและแคปชันได้ แต่ต้องให้ Worker สร้าง Production ใหม่ก่อนโพสต์',
              updated_at=now()
        WHERE id=$1`,
      [campaign.id],
    );
    return inserted.rows[0];
  });

  const postCount = await query(
    `SELECT COUNT(*)::int AS count FROM campaign_posts WHERE campaign_id=$1 AND content_id=$2`,
    [campaign.id, saved.id],
  );
  console.log(JSON.stringify({
    requestNo,
    campaignId: campaign.id,
    contentId: saved.id,
    version: saved.version,
    qualityStatus: quality.status,
    qualityScore: quality.score,
    imageBytes: imageBytes.length,
    campaignPostsCreated: postCount.rows[0]?.count ?? 0,
  }, null, 2));
} finally {
  await closePool();
}
