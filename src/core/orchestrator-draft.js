import { query } from '../db/pool.js';
import { generateContent, generatePosterFields } from './content-gen.js';
import { researchContentAngles } from './content-research.js';
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

  // แนวที่ "ไม่เวิร์ค" (คนสนใจน้อย): เอาแคปชันที่คะแนนต่ำสุดมาเตือน AI ให้เลี่ยง
  // (ตำแหน่งใกล้เคียงก่อน แล้วคะแนนต่ำก่อน; ตาราง schema-014 ยังไม่ migrate = [] ไม่กระทบ gen)
  const losingExamples = await query(
    `SELECT cc.caption
       FROM content_losing_patterns lp
       JOIN campaign_contents cc ON cc.id = lp.sample_content_id
      WHERE cc.caption IS NOT NULL AND TRIM(cc.caption) <> ''
      ORDER BY (lp.position_family IS NOT NULL AND $1 <> '' AND lp.position_family ILIKE '%' || $1 || '%') DESC,
               lp.engagement_score ASC NULLS LAST
      LIMIT 2`,
    [String(c.title ?? '').trim()],
  ).then((r) => r.rows.map((x) => x.caption)).catch(() => []);

  // Research ก่อนคิด: แนว/ฮุก/สไตล์รูปที่ดึงคนตำแหน่งนี้ได้ (cold-start — ใช้ก่อนมีสถิติของเราเอง)
  // ground ด้วยแคปชันที่เคยเวิร์คของเรา; fail-soft = null (draft เดินต่อได้)
  const research = await researchContentAngles({
    title: c.title, province: c.province, snapshot: c.request_snapshot ?? {}, winningExamples,
  }).catch(() => null);
  if (research) console.log(`  [draft] research: ${research.angles.length} มุม · ${research.hooks.length} ฮุก · imageStyle=${research.imageStyle ? 'มี' : '-'}`);

  const base = {
    title: c.title,
    positions: c.positions,
    province: c.province,
    qty: c.qty,
    remaining_qty: c.remaining_qty,
    snapshot: c.request_snapshot ?? {},
    winningExamples,
    losingExamples,
    research,
  };

  // A/B: 2 เวอร์ชันคนละแนว — คนอนุมัติเลือกอันที่ชอบ (ผลชนะถูกเก็บเข้า winning patterns ต่อ)
  const AB_STYLES = [
    'A — ตรงไปตรงมา: พาดหัวเปิดรับสมัครชัด ๆ ข้อมูลครบ กระชับ',
    'B — เน้นจุดขาย: นำด้วยรายได้/สวัสดิการ/ความมั่นคง โทนชวนคุย',
  ];
  const content = await generateContent({ ...base, styleHint: AB_STYLES[0] });
  const contentB = content
    ? await generateContent({ ...base, styleHint: AB_STYLES[1] }).catch(() => null)
    : null;

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

  // บันทึกทั้ง 2 เวอร์ชัน (โปสเตอร์ใบเดียวกัน — ต่างกันที่แคปชัน) ให้คนเลือกตอนอนุมัติ
  // gen_notes = provenance ว่าแต่ละร่างคิดจากอะไร (โชว์บนหน้า campaign; schema-015 ยังไม่มี = ข้าม)
  const versions = [content, contentB].filter(Boolean);
  const genNotesBase = research
    ? { angles: research.angles, hooks: research.hooks, imageStyle: research.imageStyle, research_model: research.model }
    : {};
  for (let i = 0; i < versions.length; i += 1) {
    const v = versions[i];
    const genNotes = JSON.stringify({
      ...genNotesBase,
      style: AB_STYLES[i] ?? null,
      used_winning: winningExamples.length,
      used_losing: losingExamples.length,
    });
    try {
      await query(
        `INSERT INTO campaign_contents
           (campaign_id, version, platform, caption, image_bytes, image_mime, video_brief, gen_model, status, gen_notes)
         VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7, 'draft', $8::jsonb)`,
        [campaignId, version + i, v.caption, image?.bytes ?? null, image?.mime ?? null, v.videoBrief, v.model, genNotes],
      );
    } catch {
      // schema-015 (gen_notes) ยังไม่ migrate — บันทึกแบบไม่มีคอลัมน์นั้น
      await query(
        `INSERT INTO campaign_contents
           (campaign_id, version, platform, caption, image_bytes, image_mime, video_brief, gen_model, status)
         VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7, 'draft')`,
        [campaignId, version + i, v.caption, image?.bytes ?? null, image?.mime ?? null, v.videoBrief, v.model],
      );
    }
  }

  await query(`UPDATE recruit_campaigns SET status='pending_approval', status_note=NULL, updated_at=now() WHERE id=$1`, [campaignId]);

  return { campaignId, version, versions: versions.length, hasImage: !!image, model: content.model };
}
