import { query } from '../db/pool.js';
import { generateContent, generatePosterFields } from './content-gen.js';
import { generateImage } from './ai-image.js';
import { renderPoster } from './poster.js';

/**
 * สร้างร่างคอนเทนต์ 1 version ให้ campaign หนึ่ง (งานเบื้องหลังของ work_queue
 * type='draft' module='orchestrator'). ขั้นตอน:
 *   1. โหลด campaign → ตั้งสถานะ 'drafting'
 *   2. Claude คิด caption + video_brief + image_prompt (content-gen.js)
 *   3. OpenAI สร้างรูปจาก image_prompt (ai-image.js) — ไม่มี key = ไม่มีรูป (ยังทำต่อ)
 *   4. insert campaign_contents (version ถัดไป, status='draft')
 *   5. ตั้ง campaign 'pending_approval' ให้คนอนุมัติในแดชบอร์ด
 *
 * ไม่มี ANTHROPIC_API_KEY/สร้างผลไม่ได้ = campaign เป็น draft_error พร้อมเหตุผล
 * และโยน error ให้ work_queue บันทึกว่าไม่สำเร็จ (ผู้ใช้กด Retry ได้จาก Work Center).
 */
export async function generateDraftForCampaign(campaignId) {
  if (!campaignId) throw new Error('generateDraftForCampaign: missing campaignId');

  const { rows } = await query(`SELECT * FROM recruit_campaigns WHERE id = $1`, [campaignId]);
  const c = rows[0];
  if (!c) throw new Error(`campaign not found: ${campaignId}`);

  await query(`UPDATE recruit_campaigns SET status='drafting', status_note=NULL, updated_at=now() WHERE id=$1`, [campaignId]);

  // แนวที่เคยเวิร์ค: เอาแคปชันจริงของ content ที่ engagement สูงสุด มาเป็นแรงบันดาลใจ
  // (เรียงให้ตำแหน่งใกล้เคียงมาก่อน แล้วค่อยตามคะแนน; ตารางว่าง = [] ไม่กระทบ gen)
  const winningExamples = await query(
    `SELECT cc.caption
       FROM content_winning_patterns wp
       JOIN campaign_contents cc ON cc.id = wp.sample_content_id
      WHERE cc.caption IS NOT NULL AND TRIM(cc.caption) <> ''
      ORDER BY (wp.position_family IS NOT NULL AND $1 <> '' AND wp.position_family ILIKE '%' || $1 || '%') DESC,
               wp.engagement_score DESC NULLS LAST
      LIMIT 2`,
    [String(c.title ?? '').trim()],
  ).then((r) => r.rows.map((x) => x.caption)).catch(() => []);

  const content = await generateContent({
    title: c.title,
    positions: c.positions,
    province: c.province,
    qty: c.qty,
    remaining_qty: c.remaining_qty,
    snapshot: c.request_snapshot ?? {},
    winningExamples,
  });

  if (!content) {
    // อย่ารายงาน queue ว่าสำเร็จ เพราะจะทำให้ campaign ค้างแบบไม่มีทางไปต่อ
    const note = 'คิด content ไม่ได้ — ตรวจ ANTHROPIC_API_KEY บนเครื่อง worker';
    await query(`UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    throw new Error(note);
  }

  // รูปเป็น optional — ไม่มี OPENAI_API_KEY ก็ยังบันทึก draft (caption/brief) ได้
  // ลำดับ: (1) รูปคนพื้นหลังใส → (2) ประกอบโปสเตอร์ SO WORK! (ตัวหนังสือไทยคมชัด) →
  // ถ้าโปสเตอร์ทำไม่ได้ ใช้รูปคน/รูปเดิมแทน — คนอนุมัติเห็นรูปจริงบนศูนย์งานก่อนกดเสมอ
  let image = null;
  const [person, posterFields] = await Promise.all([
    generateImage({ prompt: content.imagePrompt, transparent: true }).catch(() => null),
    generatePosterFields({
      title: c.title, positions: c.positions, province: c.province,
      qty: c.qty, remaining_qty: c.remaining_qty, snapshot: c.request_snapshot ?? {},
    }).catch(() => null),
  ]);
  if (posterFields) {
    const contactLine = process.env.CONTENT_CONTACT_LINE || '';
    const personUri = person ? `data:${person.mime};base64,${person.bytes.toString('base64')}` : null;
    image = await renderPoster({ ...posterFields, contactLine }, personUri).catch(() => null);
    if (image) console.log(`  [draft] โปสเตอร์ SO WORK! สำเร็จ (${Math.round(image.bytes.length / 1024)} KB${person ? ' + รูปคน AI' : ''})`);
  }
  if (!image) image = person; // fallback: อย่างน้อยได้รูปคน (หรือ null = ไม่มีรูป)

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
