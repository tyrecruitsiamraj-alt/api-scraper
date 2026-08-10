import { query } from '../db/pool.js';
import { activeContentTrends } from '../db/repositories.js';
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

  // งานที่คนอนุมัติคือสัญญาณด้านคุณภาพก่อนโพสต์ แยกจาก "ผู้ชนะ" ที่ต้องมีผลลัพธ์จริง.
  const preferredExamples = await query(
    `SELECT cc.caption, cf.reason_codes, cf.note
       FROM content_feedback cf
       JOIN campaign_contents cc ON cc.id=cf.content_id
       JOIN recruit_campaigns rc ON rc.id=cf.campaign_id
      WHERE cf.decision='approved' AND cc.caption IS NOT NULL AND TRIM(cc.caption) <> ''
      ORDER BY (rc.title IS NOT NULL AND $1 <> '' AND rc.title ILIKE '%' || $1 || '%') DESC,
               cf.created_at DESC
      LIMIT 2`,
    [String(c.title ?? '').trim()],
  ).then((r) => r.rows.map((x) => {
    const why = [...(x.reason_codes || []), x.note].filter(Boolean).join(', ');
    return `${x.caption}${why ? `\n[เหตุผลที่อนุมัติ: ${why}]` : ''}`;
  })).catch(() => []);

  // แนวที่ "ไม่เวิร์ค" (คนสนใจน้อย): เอาแคปชันที่คะแนนต่ำสุดมาเตือน AI ให้เลี่ยง
  // (ตำแหน่งใกล้เคียงก่อน แล้วคะแนนต่ำก่อน; ตาราง schema-014 ยังไม่ migrate = [] ไม่กระทบ gen)
  const losingExamples = await query(
    `SELECT cc.caption, lp.reason
       FROM content_losing_patterns lp
       JOIN campaign_contents cc ON cc.id = lp.sample_content_id
      WHERE cc.caption IS NOT NULL AND TRIM(cc.caption) <> ''
      ORDER BY (lp.position_family IS NOT NULL AND $1 <> '' AND lp.position_family ILIKE '%' || $1 || '%') DESC,
               (lp.source = 'human_feedback') DESC, lp.engagement_score ASC NULLS LAST, lp.created_at DESC
      LIMIT 2`,
    [String(c.title ?? '').trim()],
  ).then((r) => r.rows.map((x) => `${x.caption}${x.reason ? `\n[เหตุผลที่ไม่ผ่าน: ${x.reason}]` : ''}`)).catch(() => []);

  // เทรนด์ที่กำลังมา (คนเปิดไว้บนเว็บ) — เกาะเทรนด์/มีมให้ทัน (ไอติมอัลตร้าสมูท ฯลฯ)
  const trends = await activeContentTrends().catch(() => []);
  if (trends.length) console.log(`  [draft] เกาะเทรนด์: ${trends.map((t) => t.label).join(', ')}`);

  // Research ก่อนคิด: แนว/ฮุก/สไตล์รูปที่ดึงคนตำแหน่งนี้ได้ (cold-start — ใช้ก่อนมีสถิติของเราเอง)
  // ground ด้วยแคปชันที่เคยเวิร์คของเรา + เทรนด์ที่กำลังมา; fail-soft = null (draft เดินต่อได้)
  const research = await researchContentAngles({
    title: c.title, province: c.province, snapshot: c.request_snapshot ?? {}, winningExamples, trends,
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
    preferredExamples,
    losingExamples,
    research,
    trends,
  };

  // A/B: 2 เวอร์ชันคนละแนว — คนอนุมัติเลือกอันที่ชอบ (ผลชนะถูกเก็บเข้า winning patterns ต่อ)
  const AB_STYLES = [
    'A — ตรงไปตรงมา: พาดหัวเปิดรับสมัครชัด ๆ ข้อมูลครบ กระชับ',
    'B — เน้นจุดขาย: นำด้วยรายได้/สวัสดิการ/ความมั่นคง โทนชวนคุย',
  ];
  // A/B รูป: 2 สไตล์รูปคนละแบบ (จาก research — เปลี่ยนตามเทรนด์ ไม่ล็อกตายตัว) เวอร์ชัน A ใช้สไตล์ 1, B ใช้สไตล์ 2
  const styles = research?.imageStyles?.length ? research.imageStyles : (research?.imageStyle ? [research.imageStyle] : []);
  const content = await generateContent({ ...base, styleHint: AB_STYLES[0], imageStyle: styles[0] });
  const contentB = content
    ? await generateContent({ ...base, styleHint: AB_STYLES[1], imageStyle: styles[1] ?? styles[0] }).catch(() => null)
    : null;

  if (!content) {
    // อย่ารายงาน queue ว่าสำเร็จ เพราะจะทำให้ campaign ค้างแบบไม่มีทางไปต่อ
    const note = 'คิด content ไม่ได้ — ตรวจ ANTHROPIC_API_KEY บนเครื่อง worker';
    await query(`UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    throw new Error(note);
  }

  const versions = [content, contentB].filter(Boolean);

  // รูป+โปสเตอร์ต่อเวอร์ชัน (A/B คนละสไตล์รูป) — โปสเตอร์ text-layout ใบเดียวกัน แต่รูปคน/โทนต่างกัน
  // รูปเป็น optional — ไม่มี OPENAI_API_KEY ก็ยังบันทึก draft (caption/brief) ได้
  let posterFields = await generatePosterFields({
    title: c.title, positions: c.positions, province: c.province,
    qty: c.qty, remaining_qty: c.remaining_qty, snapshot: c.request_snapshot ?? {},
  }).catch((e) => {
    console.warn(`  [draft] poster fields โยน error: ${e.message}`);
    return null;
  });
  if (!posterFields) {
    // การันตีโปสเตอร์: AI สรุปไม่ได้ → ใช้ข้อมูลใบขอตรง ๆ (deterministic, ไม่แต่งเอง)
    posterFields = fallbackPosterFields(c);
    if (posterFields) console.warn('  [draft] ⚠️ AI สรุปข้อมูลโปสเตอร์ไม่ได้ — ใช้ข้อมูลใบขอตรง ๆ ทำโปสเตอร์แทน');
    else console.warn('  [draft] ⚠️ ไม่มีข้อมูลพอทำโปสเตอร์ (ไม่มีชื่อตำแหน่ง) — ร่างนี้จะได้รูปคนเดี่ยว');
  }
  const contactLine = process.env.CONTENT_CONTACT_LINE || '';
  const images = [];
  for (const v of versions) {
    const person = await generateImage({ prompt: v.imagePrompt, transparent: true }).catch(() => null);
    let img = null;
    if (posterFields) {
      const personUri = person ? `data:${person.mime};base64,${person.bytes.toString('base64')}` : null;
      img = await renderPoster({ ...posterFields, contactLine }, personUri).catch(() => null);
    }
    if (!img) img = person; // fallback: อย่างน้อยได้รูปคน (หรือ null = ไม่มีรูป)
    images.push(img);
  }
  const madeImages = images.filter(Boolean).length;
  if (madeImages) console.log(`  [draft] A/B รูป: ${madeImages}/${versions.length} ใบ (สไตล์ต่างกันตาม research/เทรนด์)`);

  const [{ v: version }] = (
    await query(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM campaign_contents WHERE campaign_id = $1`, [campaignId])
  ).rows;

  // gen_notes = provenance ว่าแต่ละร่างคิดจากอะไร (โชว์บนหน้า campaign; schema-015 ยังไม่มี = ข้าม)
  const genNotesBase = {
    ...(research ? { angles: research.angles, hooks: research.hooks, research_model: research.model } : {}),
    ...(trends.length ? { trends: trends.map((t) => t.label) } : {}),
  };
  for (let i = 0; i < versions.length; i += 1) {
    const v = versions[i];
    const image = images[i];
    const genNotes = JSON.stringify({
      ...genNotesBase,
      style: AB_STYLES[i] ?? null,
      imageStyle: styles[i] ?? styles[0] ?? research?.imageStyle ?? null, // สไตล์รูปของเวอร์ชันนี้ (ไว้เรียนรู้ว่าอันไหนชนะ)
      visual_brief: v.visualBrief ?? null,
      used_winning: winningExamples.length,
      used_feedback: preferredExamples.length,
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

  return { campaignId, version, versions: versions.length, hasImage: madeImages > 0, model: content.model };
}

/**
 * โปสเตอร์ fallback จากใบขอตรง ๆ (deterministic) — AI สรุปไม่ได้ก็ยังได้โปสเตอร์ SO WORK!
 * ใช้เฉพาะข้อมูลที่มีจริงในใบขอ ไม่แต่งเอง (ช่องไหนไม่มี = เว้นว่าง)
 */
function fallbackPosterFields(c) {
  const snap = c.request_snapshot ?? {};
  const s = (k) => String(snap[k] ?? '').trim();
  const title = String(c.title || s('request_name') || '').trim();
  if (!title) return null;
  const quals = [];
  if (s('gender')) quals.push(`เพศ${s('gender')}`);
  if (snap.age_min || snap.age_max) quals.push(`อายุ ${snap.age_min ?? ''}–${snap.age_max ?? ''} ปี`);
  if (s('education')) quals.push(s('education').slice(0, 40));
  if (s('note')) quals.push(s('note').slice(0, 40));
  if (quals.length === 0) quals.push('สอบถามรายละเอียดทางแชทได้เลย');
  const income = s('income');
  return {
    title,
    badge: 'เปิดรับสมัครด่วน',
    location: String(c.province || s('location') || '').trim(),
    worktime: s('work_schedule'),
    salaryTotal: (income.match(/[\d]{1,3}(?:,\d{3})*\s*\+{0,2}/)?.[0] ?? '').trim(),
    salaryBreakdown: income,
    qualifications: quals.slice(0, 6),
    benefits: [],
  };
}
