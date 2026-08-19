import { query } from '../db/pool.js';
import { activeContentTrends } from '../db/repositories.js';
import { buildGroundedCaption, generateContent, generatePosterFields } from './content-gen.js';
import { researchContentAngles } from './content-research.js';
import { generateImage } from './ai-image.js';
import { renderPoster } from './poster.js';
import { evaluateContentQuality } from './content-quality.js';
import { applyTrustedPosterFacts, preflightCampaign, visualBriefFromFacts } from './campaign-facts.js';
import { assessMarketResearch, collectCampaignMarketResearch } from './market-research.js';
import { formatPerformanceInsight, patternDecision } from './content-second-brain.js';

/**
 * สร้างร่างคอนเทนต์ 1 version ให้ campaign หนึ่ง (งานเบื้องหลังของ work_queue
 * type='draft' module='orchestrator'). ขั้นตอน:
 *   1. โหลด campaign → ตั้งสถานะ 'drafting'
 *   2. Claude คิด caption + video_brief + image_prompt (content-gen.js)
 *   3. OpenAI สร้างรูปจาก image_prompt (ai-image.js) — ไม่มีรูป = งานล้มเหลวและลองใหม่
 *   4. insert campaign_contents (version ถัดไป, status='draft')
 *   5. ตั้ง campaign 'pending_approval' ให้คนอนุมัติในแดชบอร์ด
 *
 * ไม่มี ANTHROPIC_API_KEY/สร้างผลไม่ได้ = campaign เป็น draft_error พร้อมเหตุผล
 * และโยน error ให้ work_queue บันทึกว่าไม่สำเร็จ (ผู้ใช้กด Retry ได้จาก Work Center).
 */
export async function generateDraftForCampaign(campaignId, { researchMode = 'production' } = {}) {
  if (!campaignId) throw new Error('generateDraftForCampaign: missing campaignId');
  const previewMode = researchMode === 'preview';
  const requireFacebook = !previewMode && process.env.RESEARCH_REQUIRE_FACEBOOK !== '0';

  const { rows } = await query(`SELECT * FROM recruit_campaigns WHERE id = $1`, [campaignId]);
  const c = rows[0];
  if (!c) throw new Error(`campaign not found: ${campaignId}`);

  // Stop before spending tokens or creating an image when ERP facts are not
  // sufficient.  This keeps generic titles from becoming a generic poster.
  const preflight = preflightCampaign(c);
  if (!preflight.ready) {
    const note = `ต้องยืนยันข้อมูลก่อนสร้างประกาศ: ${preflight.issues.join(' · ')}`;
    await query(`UPDATE recruit_campaigns SET status='needs_input', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    return { campaignId, status: 'needs_input', issues: preflight.issues };
  }
  const facts = preflight.facts;

  await query(`UPDATE recruit_campaigns SET status='researching', status_note='กำลังสำรวจคำค้นและโพสต์ Facebook ที่เกี่ยวข้อง', updated_at=now() WHERE id=$1`, [campaignId]);
  const marketResearch = await collectCampaignMarketResearch({ campaignId, facts, requireFacebook }).catch((error) => ({
    keywords: [], facebookPosts: [], evidence: [], warnings: [error.message],
  }));
  console.log(`  [research] Google ${marketResearch.keywords.length} คำ · Facebook ${marketResearch.facebookPosts.length} โพสต์ · หลักฐาน ${marketResearch.evidence.length}`);
  if (marketResearch.warnings.length) console.warn(`  [research] ${marketResearch.warnings.join(' · ')}`);
  const researchGate = assessMarketResearch(marketResearch, { requireFacebook });
  if (!researchGate.ready) {
    const detail = [...researchGate.issues, ...marketResearch.warnings].filter(Boolean).join(' · ');
    const note = `ยังไม่สร้าง Content เพราะหลักฐานสำรวจตลาดไม่ครบ: ${detail}`;
    await query(`UPDATE recruit_campaigns SET status='needs_input', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    return { campaignId, status: 'needs_input', issues: researchGate.issues, researchGate };
  }

  await query(`UPDATE recruit_campaigns SET status='drafting', status_note=NULL, updated_at=now() WHERE id=$1`, [campaignId]);

  // Second Brain must stay inside the same role. Sorting unrelated examples
  // last was not enough: on a cold start they still reached the model.
  const roleKey = String(facts.position || '').toLowerCase().replace(/\s+/g, '');
  const sameRole = (caption) => roleKey && String(caption || '').toLowerCase().replace(/\s+/g, '').includes(roleKey);

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
  ).then((r) => r.rows.map((x) => x.caption).filter(sameRole)).catch(() => []);

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
  }).filter(sameRole)).catch(() => []);

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
  ).then((r) => r.rows
    .filter((x) => sameRole(x.caption))
    .map((x) => `${x.caption}${x.reason ? `\n[เหตุผลที่ไม่ผ่าน: ${x.reason}]` : ''}`)).catch(() => []);

  // Proven outcome patterns are separate from human approval. A pattern is
  // usable only after content_pattern_stats sees it in at least 3 campaigns.
  const patternStats = await query(
    `SELECT ps.*, cc.caption AS representative_caption
       FROM content_pattern_stats ps
       LEFT JOIN campaign_contents cc ON cc.id=ps.representative_content_id
      WHERE ps.confidence >= 1
        AND (ps.pattern_type IN ('posting_slot','facebook_group','facebook_account')
             OR ($1 <> '' AND ps.position_family ILIKE '%' || $1 || '%'))
      ORDER BY (ps.position_family ILIKE '%' || $1 || '%') DESC,
               ps.campaign_count DESC, ps.post_count DESC
      LIMIT 12`,
    [String(c.title ?? '').trim()],
  ).then((r) => r.rows).catch(() => []);
  const highScore = Number(process.env.ENGAGE_HIGH_SCORE || 5);
  const provenPatterns = patternStats.map((stat) => ({
    ...stat,
    decision: patternDecision(stat, { highScore, minCampaigns: 3 }),
  })).filter((stat) => stat.decision !== 'collecting');
  const performanceInsights = provenPatterns.map((stat) => formatPerformanceInsight(stat, stat.decision));
  for (const stat of provenPatterns) {
    const caption = String(stat.representative_caption || '').trim();
    if (!caption || stat.pattern_type !== 'caption_style') continue;
    const target = stat.decision === 'preferred' ? winningExamples : losingExamples;
    if (!target.includes(caption)) target.push(caption);
  }
  const provenImageStyle = provenPatterns.find(
    (stat) => stat.pattern_type === 'image_style' && stat.decision === 'preferred',
  )?.pattern_value || null;

  // เทรนด์ที่กำลังมา (คนเปิดไว้บนเว็บ) — เกาะเทรนด์/มีมให้ทัน (ไอติมอัลตร้าสมูท ฯลฯ)
  const trends = await activeContentTrends().catch(() => []);
  if (trends.length) console.log(`  [draft] เกาะเทรนด์: ${trends.map((t) => t.label).join(', ')}`);

  // Research ก่อนคิด: แนว/ฮุก/สไตล์รูปที่ดึงคนตำแหน่งนี้ได้ (cold-start — ใช้ก่อนมีสถิติของเราเอง)
  // ground ด้วยแคปชันที่เคยเวิร์คของเรา + เทรนด์ที่กำลังมา; fail-soft = null (draft เดินต่อได้)
  const research = await researchContentAngles({
    title: facts.position, province: facts.location, snapshot: c.request_snapshot ?? {}, winningExamples, trends,
    trendKeywords: marketResearch.keywords, marketEvidence: marketResearch.evidence,
  }).catch(() => null);
  if (research) console.log(`  [draft] research: ${research.angles.length} มุม · ${research.hooks.length} ฮุก · imageStyle=${research.imageStyle ? 'มี' : '-'}`);

  const base = {
    title: facts.position,
    positions: c.positions,
    province: c.province,
    qty: c.qty,
    remaining_qty: c.remaining_qty,
    snapshot: c.request_snapshot ?? {},
    winningExamples,
    preferredExamples,
    losingExamples,
    performanceInsights,
    research,
    trends,
    visualBrief: visualBriefFromFacts(facts),
  };

  // A/B: 2 เวอร์ชันคนละแนว — คนอนุมัติเลือกอันที่ชอบ (ผลชนะถูกเก็บเข้า winning patterns ต่อ)
  const AB_STYLES = [
    'A — ตรงไปตรงมา: พาดหัวเปิดรับสมัครชัด ๆ ข้อมูลครบ กระชับ',
    'B — เน้นข้อมูลตัดสินใจที่ ERP ยืนยันแล้ว เช่น รายได้ พื้นที่ และเวลา โทนชวนคุย ห้ามแต่งจุดขายเพิ่ม',
  ];
  // A/B รูป: 2 สไตล์รูปคนละแบบ (จาก research — เปลี่ยนตามเทรนด์ ไม่ล็อกตายตัว) เวอร์ชัน A ใช้สไตล์ 1, B ใช้สไตล์ 2
  const researchStyles = research?.imageStyles?.length ? research.imageStyles : (research?.imageStyle ? [research.imageStyle] : []);
  const styles = [...new Set([provenImageStyle, ...researchStyles].filter(Boolean))];
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

  const captionKey = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, '').trim();
  let versions = [content, contentB].filter((item, index, all) => item && all.findIndex(
    (candidate) => candidate && captionKey(candidate.caption) === captionKey(item.caption),
  ) === index);
  if (versions.length < 2) console.warn('  [draft] AI คืนร่าง A/B ซ้ำกัน — เก็บเพียงร่างเดียวเพื่อไม่ให้หน้าอนุมัติรก');

  // รูป+โปสเตอร์ต่อเวอร์ชัน (A/B คนละสไตล์รูป) — โปสเตอร์ text-layout ใบเดียวกัน แต่รูปคน/โทนต่างกัน
  // รูปเป็นผลลัพธ์บังคับ: ห้ามสร้างโปสเตอร์เปล่าแล้วรายงานว่าสำเร็จ
  let posterFields = await generatePosterFields({
    title: facts.position, positions: c.positions, province: facts.location,
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
  // The model may summarize presentation text, but the fields below are facts
  // and always come from ERP.  In particular it cannot turn 12,000 into 120.
  if (posterFields) posterFields = applyTrustedPosterFacts(posterFields, c);
  // Repair factual failures before paying for image generation. Creative copy
  // is kept only when it passes; otherwise a deterministic ERP-only caption
  // replaces it, so the user never has to discover invented claims by eye.
  versions = versions.map((draft) => {
    const before = evaluateContentQuality({
      campaign: c, caption: draft.caption, posterFields, researchGate,
    });
    if (!before.blocking) return draft;
    console.warn(`  [draft] Caption AI ไม่ผ่าน (${before.summary}) — ซ่อมจาก ERP อัตโนมัติ`);
    return { ...draft, caption: buildGroundedCaption(c), captionRepaired: true };
  });
  for (const draft of versions) {
    const repaired = evaluateContentQuality({ campaign: c, caption: draft.caption, posterFields, researchGate });
    if (repaired.blocking) {
      const note = `สร้าง Caption ที่ยืนยันข้อเท็จจริงไม่ได้: ${repaired.summary}`;
      await query(`UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
      throw new Error(note);
    }
  }
  const contactLine = facts.contactPhone || process.env.CONTENT_CONTACT_LINE || '';
  const images = [];
  const imageSources = [];
  const imageErrors = [];
  for (const v of versions) {
    let person = null;
    let imageError = null;
    try {
      // GPT Image 2 เป็นรุ่นคุณภาพสูงสุดและให้พื้นหลังทึบ จึงสร้างฉากงานจริงแล้ว
      // ให้ poster.js ทำ soft-mask ด้านซ้ายแทนการบังคับพื้นหลังโปร่งใส.
      person = await generateImage({ prompt: v.imagePrompt, transparent: false, strict: true });
    } catch (error) {
      imageError = error;
      console.warn(`  [draft] สร้างภาพตามตำแหน่งไม่สำเร็จ: ${error.message}`);
    }
    let img = null;
    if (posterFields && person) {
      const personUri = `data:${person.mime};base64,${person.bytes.toString('base64')}`;
      img = await renderPoster({ ...posterFields, contactLine }, personUri).catch((error) => {
        imageError = error;
        console.warn(`  [draft] ประกอบโปสเตอร์ไม่สำเร็จ: ${error.message}`);
        return null;
      });
    }
    if (!img && person) img = person;
    images.push(img);
    imageSources.push(person);
    imageErrors.push(imageError?.message ?? null);
  }
  const madeImages = images.filter(Boolean).length;
  if (madeImages) console.log(`  [draft] A/B รูป: ${madeImages}/${versions.length} ใบ (สไตล์ต่างกันตาม research/เทรนด์)`);
  if (!madeImages) {
    const reason = imageErrors.filter(Boolean)[0] || 'ไม่พบผลลัพธ์รูปภาพจากเครื่องสร้าง Content';
    const note = `สร้างรูปประกาศไม่สำเร็จ: ${reason}`;
    await query(`UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    throw new Error(note);
  }

  const [{ v: version }] = (
    await query(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM campaign_contents WHERE campaign_id = $1`, [campaignId])
  ).rows;

  // gen_notes = provenance ว่าแต่ละร่างคิดจากอะไร (โชว์บนหน้า campaign; schema-015 ยังไม่มี = ข้าม)
  const genNotesBase = {
    generation_mode: previewMode ? 'preview' : 'production',
    ...(research ? { angles: research.angles, hooks: research.hooks, research_model: research.model } : {}),
    ...(trends.length ? { trends: trends.map((t) => t.label) } : {}),
    research_evidence: marketResearch.evidence.length,
    research_keywords: marketResearch.keywords,
    research_warnings: marketResearch.warnings,
    research_gate: researchGate,
    research_sources: marketResearch.evidence.slice(0, 12).map((item) => ({
      type: item.source_type,
      url: item.source_url,
      query: item.query_term,
      reactions: Number(item.reactions) || 0,
      comments: Number(item.comments) || 0,
      shares: Number(item.shares) || 0,
    })),
  };
  let savedDrafts = 0;
  let readyDrafts = 0;
  for (let i = 0; i < versions.length; i += 1) {
    const v = versions[i];
    const image = images[i];
    // รุ่นที่รูปเสียไม่ถูกบันทึกเป็นร่างให้คนเห็น ระบบเก็บสาเหตุไว้ใน log และ
    // ยังส่งรุ่นที่สมบูรณ์ได้ถ้าอย่างน้อยหนึ่งรุ่นผ่าน.
    if (!image || !imageSources[i]) continue;
    const quality = evaluateContentQuality({ campaign: c, caption: v.caption, posterFields, imageReady: true, researchGate });
    savedDrafts += 1;
    if (!quality.blocking) readyDrafts += 1;
    console.log(`  [draft] ด่านคุณภาพเวอร์ชัน ${version + i}: ${quality.status} ${quality.score}/100 — ${quality.summary}`);
    const genNotes = JSON.stringify({
      ...genNotesBase,
      style: AB_STYLES[i] ?? null,
      imageStyle: styles[i] ?? styles[0] ?? research?.imageStyle ?? null, // สไตล์รูปของเวอร์ชันนี้ (ไว้เรียนรู้ว่าอันไหนชนะ)
      visual_brief: v.visualBrief ?? null,
      used_winning: winningExamples.length,
      used_feedback: preferredExamples.length,
      used_losing: losingExamples.length,
      caption_repaired: Boolean(v.captionRepaired),
      image_generation: {
        ok: true,
        provider: imageSources[i]?.provider ?? null,
        model: imageSources[i]?.model ?? null,
        prompt: v.imagePrompt,
      },
    });
    // Fail closed: provenance and the quality result are part of a usable
    // content artifact, not optional compatibility metadata. If this insert
    // fails the queue must fail as well; never save a draft that merely has
    // image bytes but cannot prove where the image came from or what was checked.
    await query(
      `INSERT INTO campaign_contents
         (campaign_id, version, platform, caption, image_bytes, image_mime,
          source_image_bytes, source_image_mime, poster_fields,
          video_brief, gen_model, status, gen_notes,
          quality_status, quality_score, quality_checks, quality_checked_at)
       VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'draft', $11::jsonb,
               $12, $13, $14::jsonb, now())`,
      [campaignId, version + i, v.caption, image?.bytes ?? null, image?.mime ?? null,
        imageSources[i]?.bytes ?? null, imageSources[i]?.mime ?? null, JSON.stringify({ ...posterFields, contactLine }),
        v.videoBrief, v.model, genNotes, quality.status, quality.score, JSON.stringify(quality)],
    );
  }

  if (!readyDrafts) {
    const note = 'ร่างที่สร้างได้ยังไม่ผ่านด่านตรวจข้อเท็จจริง กรุณาแก้ข้อมูลหรือสั่งสร้างใหม่';
    await query(`UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    throw new Error(note);
  }
  await query(`UPDATE recruit_campaigns SET status='pending_approval', status_note=$2, updated_at=now() WHERE id=$1`, [
    campaignId,
    savedDrafts > readyDrafts ? `พร้อมตรวจ ${readyDrafts} ร่าง · ระบบซ่อนร่างที่ไม่ผ่าน ${savedDrafts - readyDrafts} ร่าง` : null,
  ]);

  return { campaignId, version, versions: savedDrafts, readyDrafts, hasImage: madeImages > 0, model: content.model };
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
  const gender = humanGender(s('gender'));
  if (gender) quals.push(gender);
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

function humanGender(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (['o', 'all', 'any', 'a', 'ไม่จำกัด', 'ไม่ระบุ'].includes(normalized)) return 'ไม่จำกัดเพศ';
  if (['m', 'male', 'ชาย'].includes(normalized)) return 'เพศชาย';
  if (['f', 'female', 'หญิง'].includes(normalized)) return 'เพศหญิง';
  return `เพศ ${raw}`;
}
