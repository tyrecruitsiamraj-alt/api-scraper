/**
 * ประกอบโปสเตอร์จากภาพต้นฉบับ + ข้อเท็จจริง ERP สำหรับร่างล่าสุดของใบขอ
 * ใช้ซ่อม Preview หรือทดสอบ template โดยไม่อนุมัติและไม่สร้างคิวโพสต์.
 *
 * Usage: node scripts/render-editable-poster.mjs <request-no>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { closePool, query, withTransaction } from '../src/db/pool.js';
import { extractCampaignFacts } from '../src/core/campaign-facts.js';
import { evaluateContentQuality } from '../src/core/content-quality.js';
import { renderPoster } from '../src/core/poster.js';

const requestNo = String(process.argv[2] || '').trim();
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : '';
if (!requestNo) throw new Error('กรุณาระบุเลขใบขอ');

try {
  const { rows } = await query(
    `SELECT cc.*, to_jsonb(c.*) AS campaign
       FROM campaign_contents cc
       JOIN recruit_campaigns c ON c.id=cc.campaign_id
      WHERE c.request_no=$1 AND cc.status='draft'
      ORDER BY cc.version DESC LIMIT 1`,
    [requestNo],
  );
  const content = rows[0];
  if (!content) throw new Error(`ไม่พบร่างของงาน ${requestNo}`);
  if (!content.source_image_bytes || !content.source_image_mime) {
    throw new Error('ร่างนี้ไม่มีภาพต้นฉบับสำหรับประกอบโปสเตอร์');
  }
  const facts = extractCampaignFacts(content.campaign);
  const fields = {
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
    imageSide: content.gen_notes?.generation_mode === 'preview' ? 'left' : 'right',
  };
  const sourceUri = `data:${content.source_image_mime};base64,${content.source_image_bytes.toString('base64')}`;
  const rendered = await renderPoster(fields, sourceUri);
  if (!rendered) throw new Error('ประกอบโปสเตอร์ไม่สำเร็จ');
  const quality = evaluateContentQuality({
    campaign: content.campaign,
    caption: content.caption,
    posterFields: fields,
    imageReady: true,
    researchGate: content.gen_notes?.research_gate ?? { ready: false, issues: ['ไม่มีหลักฐานสำรวจตลาด'] },
  });
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE campaign_contents
          SET image_bytes=$2, image_mime=$3, poster_fields=$4::jsonb,
              quality_status=$5, quality_score=$6, quality_checks=$7::jsonb, quality_checked_at=now()
        WHERE id=$1`,
      [content.id, rendered.bytes, rendered.mime, JSON.stringify(fields), quality.status, quality.score, JSON.stringify(quality)],
    );
  });
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rendered.bytes);
  }
  const posts = await query(
    `SELECT COUNT(*)::int AS count FROM campaign_posts WHERE content_id=$1`,
    [content.id],
  );
  console.log(JSON.stringify({
    requestNo,
    contentId: content.id,
    version: content.version,
    qualityStatus: quality.status,
    qualityScore: quality.score,
    imageBytes: rendered.bytes.length,
    campaignPostsCreated: posts.rows[0]?.count ?? 0,
    outputPath: outputPath || null,
  }, null, 2));
} finally {
  await closePool();
}
