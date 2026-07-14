import { query } from '../db/pool.js';
import { generateContent } from './content-gen.js';
import { generateImage } from './ai-image.js';

/**
 * สร้างร่างคอนเทนต์ 1 version ให้ campaign หนึ่ง (งานเบื้องหลังของ work_queue
 * type='draft' module='orchestrator'). ขั้นตอน:
 *   1. โหลด campaign → ตั้งสถานะ 'drafting'
 *   2. Claude คิด caption + video_brief + image_prompt (content-gen.js)
 *   3. OpenAI สร้างรูปจาก image_prompt (ai-image.js) — ไม่มี key = ไม่มีรูป (ยังทำต่อ)
 *   4. insert campaign_contents (version ถัดไป, status='draft')
 *   5. ตั้ง campaign 'pending_approval' ให้คนอนุมัติในแดชบอร์ด
 *
 * ไม่มี ANTHROPIC_API_KEY = คิด content ไม่ได้ → คืน campaign กลับ 'new' + note
 * (feature ปิดตัวเอง งานอื่นไม่พัง). โยน error เฉพาะกรณีผิดจริง (campaign ไม่พบ).
 */
export async function generateDraftForCampaign(campaignId) {
  if (!campaignId) throw new Error('generateDraftForCampaign: missing campaignId');

  const { rows } = await query(`SELECT * FROM recruit_campaigns WHERE id = $1`, [campaignId]);
  const c = rows[0];
  if (!c) throw new Error(`campaign not found: ${campaignId}`);

  await query(`UPDATE recruit_campaigns SET status='drafting', status_note=NULL, updated_at=now() WHERE id=$1`, [campaignId]);

  const content = await generateContent({
    title: c.title,
    positions: c.positions,
    province: c.province,
    qty: c.qty,
    remaining_qty: c.remaining_qty,
    snapshot: c.request_snapshot ?? {},
  });

  if (!content) {
    // ไม่มี ANTHROPIC_API_KEY (หรือคืนผลไม่ได้) — คืน campaign ไปสถานะ new พร้อมโน้ต
    const note = 'คิด content ไม่ได้ — ตรวจ ANTHROPIC_API_KEY บนเครื่อง worker';
    await query(`UPDATE recruit_campaigns SET status='new', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    return { campaignId, skipped: true, reason: 'no content (missing ANTHROPIC_API_KEY?)' };
  }

  // รูปเป็น optional — ไม่มี OPENAI_API_KEY ก็ยังบันทึก draft (caption/brief) ได้
  const image = await generateImage({ prompt: content.imagePrompt }).catch(() => null);

  const [{ v: version }] = (
    await query(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM campaign_contents WHERE campaign_id = $1`, [campaignId])
  ).rows;

  await query(
    `INSERT INTO campaign_contents
       (campaign_id, version, platform, caption, image_bytes, image_mime, video_brief, gen_model, status)
     VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7, 'draft')`,
    [campaignId, version, content.caption, image?.bytes ?? null, image?.mime ?? null, content.videoBrief, content.model],
  );

  await query(`UPDATE recruit_campaigns SET status='pending_approval', status_note=NULL, updated_at=now() WHERE id=$1`, [campaignId]);

  return { campaignId, version, hasImage: !!image, model: content.model };
}
