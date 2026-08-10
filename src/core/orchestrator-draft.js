import { query } from '../db/pool.js';
import { activeContentTrends, topTrendKeywords } from '../db/repositories.js';
import {
  generateContent,
  generatePosterFields,
  resolveTextProvider,
  selectRelevantTrends,
} from './content-gen.js';
import { resolveContentJobSpec } from './content-job-spec.js';
import { researchContentAngles } from './content-research.js';
import { generateImage } from './ai-image.js';
import { renderPoster } from './poster.js';
import { resolvePosterDirection } from './poster.js';
import { validateRecruitContent } from './content-factual-validator.js';
import { scoreRecruitContent } from './content-quality-score.js';
import {
  beginContentStage,
  completeContentStage,
  failContentStage,
  recordHumanHandoff,
} from './content-supervisor.js';

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

  const specRun = await beginContentStage({
    campaignId,
    stageKey: 'spec',
    agentKey: 'spec_agent',
    input: { title: c.title, positions: c.positions, request_snapshot: c.request_snapshot },
  });
  const jobSpec = resolveContentJobSpec({
    title: c.title,
    positions: c.positions,
    snapshot: c.request_snapshot ?? {},
  });
  if (!jobSpec.position) {
    const note = 'ระบุตำแหน่งงานจริงไม่ชัดเจน — กรุณาแก้ช่อง “ตำแหน่ง” ก่อนสร้าง Content (ระบบจะไม่เดาจากสถานที่ทำงาน)';
    await query(
      `UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, note],
    );
    await failContentStage(specRun, note, { jobSpec });
    throw new Error(note);
  }
  await completeContentStage(specRun, {
    position: jobSpec.position,
    job_family: jobSpec.family,
    family_label: jobSpec.familyLabel,
    source: jobSpec.source,
    confidence: jobSpec.confidence,
  }, { promptVersion: 'job-spec-v1' });

  // Normalize legacy campaigns such as title="พนักงาน" + department="...Driver..."
  // before any AI call, so every downstream step sees the same real job identity.
  const resolved = {
    ...c,
    title: jobSpec.position,
    positions: jobSpec.position,
    request_snapshot: c.request_snapshot ?? {},
  };
  await query(
    `UPDATE recruit_campaigns
        SET title=$2, positions=$2, status='drafting', status_note=NULL, updated_at=now()
      WHERE id=$1`,
    [campaignId, jobSpec.position],
  );

  const researchRun = await beginContentStage({
    campaignId,
    stageKey: 'research',
    agentKey: 'trend_agent',
    input: { jobSpec, province: resolved.province },
  });

  // แนวที่เคยเวิร์ค: เอาแคปชันจริงของ content ที่ engagement สูงสุด มาเป็นแรงบันดาลใจ
  // ใช้เฉพาะ Job Family เดียวกัน ไม่ดึงแคปชันต่างอาชีพมาปน
  const winningExamples = await query(
    `SELECT cc.caption
       FROM content_examples ex
       JOIN campaign_contents cc ON cc.id=ex.content_id
      WHERE ex.active=true AND ex.outcome='winner'
        AND cc.caption IS NOT NULL AND TRIM(cc.caption)<>''
        AND (ex.job_family=$1 OR ex.position ILIKE '%' || $2 || '%')
      ORDER BY ex.engagement_per_group DESC NULLS LAST, ex.quality_score DESC NULLS LAST
      LIMIT 2`,
    [jobSpec.family ?? '', jobSpec.position],
  ).then((r) => r.rows.map((x) => x.caption)).catch(async () => (
    await query(
      `SELECT cc.caption FROM content_winning_patterns wp
       JOIN campaign_contents cc ON cc.id=wp.sample_content_id
       WHERE cc.caption IS NOT NULL AND (wp.position_family=$1 OR wp.position_family ILIKE '%' || $2 || '%')
       ORDER BY wp.engagement_score DESC NULLS LAST LIMIT 2`,
      [jobSpec.family ?? '', jobSpec.position],
    ).then((r) => r.rows.map((x) => x.caption)).catch(() => [])
  ));

  // แนวที่ "ไม่เวิร์ค" (คนสนใจน้อย): เอาแคปชันที่คะแนนต่ำสุดมาเตือน AI ให้เลี่ยง
  // ใช้เฉพาะ Job Family เดียวกัน
  const losingExamples = await query(
    `SELECT cc.caption
       FROM content_examples ex
       JOIN campaign_contents cc ON cc.id=ex.content_id
      WHERE ex.active=true AND ex.outcome='loser'
        AND cc.caption IS NOT NULL AND TRIM(cc.caption)<>''
        AND (ex.job_family=$1 OR ex.position ILIKE '%' || $2 || '%')
      ORDER BY ex.engagement_per_group ASC NULLS LAST, ex.quality_score DESC NULLS LAST
      LIMIT 2`,
    [jobSpec.family ?? '', jobSpec.position],
  ).then((r) => r.rows.map((x) => x.caption)).catch(() => []);

  // Feedback ที่คนตีกลับต้องถูกส่งเข้า prompt รอบใหม่ ไม่ใช่เก็บไว้เฉย ๆ
  const rejectionFeedback = await query(
    `SELECT caption, reject_reason AS reason
       FROM campaign_contents
      WHERE campaign_id=$1 AND status='rejected'
      ORDER BY version DESC
      LIMIT 3`,
    [campaignId],
  ).then((r) => r.rows).catch(() => []);

  // เทรนด์ที่กำลังมา (คนเปิดไว้บนเว็บ) — เกาะเทรนด์/มีมให้ทัน (ไอติมอัลตร้าสมูท ฯลฯ)
  const trends = await activeContentTrends().catch(() => []);
  const trendKeywords = await topTrendKeywords(jobSpec.family, 6).catch(() => []);
  if (trends.length) console.log(`  [draft] เกาะเทรนด์: ${trends.map((t) => t.label).join(', ')}`);

  // Research ก่อนคิด: แนว/ฮุก/สไตล์รูปที่ดึงคนตำแหน่งนี้ได้ (cold-start — ใช้ก่อนมีสถิติของเราเอง)
  // ground ด้วยแคปชันที่เคยเวิร์คของเรา + เทรนด์ที่กำลังมา; fail-soft = null (draft เดินต่อได้)
  const research = await researchContentAngles({
    title: resolved.title,
    province: resolved.province,
    snapshot: resolved.request_snapshot,
    jobSpec,
    winningExamples,
    trendKeywords,
    trends,
  }).catch(() => null);
  if (research) console.log(`  [draft] research: ${research.angles.length} มุม · ${research.hooks.length} ฮุก · imageStyle=${research.imageStyle ? 'มี' : '-'}`);
  await completeContentStage(researchRun, {
    angles: research?.angles ?? [],
    hooks: research?.hooks ?? [],
    image_styles: research?.imageStyles ?? (research?.imageStyle ? [research.imageStyle] : []),
    selected_trends: trends.map((t) => ({
      label: t.label,
      source: t.source,
      confidence: t.confidence,
      observed_count: t.observed_count,
    })),
    keyword_evidence: trendKeywords,
    winning_examples: winningExamples.length,
    losing_examples: losingExamples.length,
  }, { model: research?.model ?? null, promptVersion: 'content-research-v2' });

  const base = {
    title: resolved.title,
    positions: resolved.positions,
    province: resolved.province,
    qty: resolved.qty,
    remaining_qty: resolved.remaining_qty,
    snapshot: resolved.request_snapshot,
    jobSpec,
    winningExamples,
    losingExamples,
    rejectionFeedback,
    research,
    trends,
  };

  // A/B: 2 เวอร์ชันคนละแนว — คนอนุมัติเลือกอันที่ชอบ (ผลชนะถูกเก็บเข้า winning patterns ต่อ)
  const AB_STYLES = [
    'A — ตรงไปตรงมา: พาดหัวเปิดรับสมัครชัด ๆ ข้อมูลครบ กระชับ',
    'B — เน้นจุดขายที่มีจริงในใบขอ: เลือกจุดเด่นที่ระบุจริง ห้ามแต่งสวัสดิการหรือความมั่นคง โทนชวนคุย',
  ];
  // A/B รูป: 2 สไตล์รูปคนละแบบ (จาก research — เปลี่ยนตามเทรนด์ ไม่ล็อกตายตัว) เวอร์ชัน A ใช้สไตล์ 1, B ใช้สไตล์ 2
  const styles = research?.imageStyles?.length ? research.imageStyles : (research?.imageStyle ? [research.imageStyle] : []);
  const copyRun = await beginContentStage({
    campaignId,
    stageKey: 'copy',
    agentKey: 'copy_agent',
    input: {
      jobSpec,
      styles: AB_STYLES,
      research: { angles: research?.angles ?? [], hooks: research?.hooks ?? [] },
      example_counts: { winning: winningExamples.length, losing: losingExamples.length },
    },
  });
  const content = await generateContent({ ...base, styleHint: AB_STYLES[0], imageStyle: styles[0] });
  const contentB = content
    ? await generateContent({ ...base, styleHint: AB_STYLES[1], imageStyle: styles[1] ?? styles[0] }).catch(() => null)
    : null;

  if (!content) {
    // อย่ารายงาน queue ว่าสำเร็จ เพราะจะทำให้ campaign ค้างแบบไม่มีทางไปต่อ
    const note = 'คิด Content ไม่ได้ — ตรวจ CONTENT_TEXT_PROVIDER และการเชื่อมต่อโมเดลบนเครื่อง worker';
    await query(`UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`, [campaignId, note]);
    await failContentStage(copyRun, note);
    throw new Error(note);
  }

  let versions = [content, contentB].filter(Boolean);
  await completeContentStage(copyRun, {
    variants: versions.map((item, index) => ({
      variant: index === 0 ? 'A' : 'B',
      caption: item.caption,
      video_brief: item.videoBrief,
      has_image_prompt: !!item.imagePrompt,
    })),
  }, { model: content.model, promptVersion: 'recruit-content-v2' });

  const visualRun = await beginContentStage({
    campaignId,
    stageKey: 'visual',
    agentKey: 'visual_agent',
    input: { jobSpec, styles, variants: versions.length },
  });

  // รูป+โปสเตอร์ต่อเวอร์ชัน (A/B คนละสไตล์รูป) — โปสเตอร์ text-layout ใบเดียวกัน แต่รูปคน/โทนต่างกัน
  // รูปเป็น optional — ไม่มี OPENAI_API_KEY ก็ยังบันทึก draft (caption/brief) ได้
  let posterFields = await generatePosterFields({
    title: resolved.title, positions: resolved.positions, province: resolved.province,
    qty: resolved.qty, remaining_qty: resolved.remaining_qty, snapshot: resolved.request_snapshot,
    jobSpec,
  }).catch((e) => {
    console.warn(`  [draft] poster fields โยน error: ${e.message}`);
    return null;
  });
  if (!posterFields) {
    // การันตีโปสเตอร์: AI สรุปไม่ได้ → ใช้ข้อมูลใบขอตรง ๆ (deterministic, ไม่แต่งเอง)
    posterFields = fallbackPosterFields(resolved);
    if (posterFields) console.warn('  [draft] ⚠️ AI สรุปข้อมูลโปสเตอร์ไม่ได้ — ใช้ข้อมูลใบขอตรง ๆ ทำโปสเตอร์แทน');
    else console.warn('  [draft] ⚠️ ไม่มีข้อมูลพอทำโปสเตอร์ (ไม่มีชื่อตำแหน่ง) — ร่างนี้จะได้รูปคนเดี่ยว');
  }
  let posterValidation = validateRecruitContent({
    campaign: base,
    caption: '',
    poster: posterFields,
    requireCaption: false,
  });
  if (!posterValidation.valid) {
    console.warn(
      `  [draft] poster facts ไม่ผ่าน: ${posterValidation.errors.map((e) => e.code).join(', ')} — ใช้ fallback จากใบขอ`
    );
    posterFields = fallbackPosterFields(resolved);
    posterValidation = validateRecruitContent({
      campaign: base,
      caption: '',
      poster: posterFields,
      requireCaption: false,
    });
  }
  if (!posterValidation.valid) {
    const note = `ข้อมูลโปสเตอร์ไม่ผ่าน factual gate: ${posterValidation.errors.map((e) => e.message).join(' · ')}`;
    await query(
      `UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, note],
    );
    await failContentStage(visualRun, note, { posterValidation });
    throw new Error(note);
  }

  // Validate each A/B caption after generation. One repair attempt is allowed;
  // invalid output never reaches pending approval.
  const validatedVersions = [];
  let factualValidations = [];
  for (let i = 0; i < versions.length; i += 1) {
    let candidate = versions[i];
    let validation = validateRecruitContent({
      campaign: base,
      caption: candidate.caption,
      poster: posterFields,
    });
    if (!validation.valid) {
      console.warn(
        `  [draft] variant ${i === 0 ? 'A' : 'B'} factual gate ไม่ผ่าน — ขอ AI ซ่อม 1 รอบ (${validation.errors.map((e) => e.code).join(', ')})`
      );
      const repaired = await generateContent({
        ...base,
        styleHint: AB_STYLES[i],
        imageStyle: styles[i] ?? styles[0],
        rejectionFeedback: [
          ...rejectionFeedback,
          {
            caption: candidate.caption,
            reason: validation.errors.map((e) => e.message).join(' · '),
          },
        ],
      }).catch(() => null);
      if (repaired) {
        candidate = repaired;
        validation = validateRecruitContent({
          campaign: base,
          caption: candidate.caption,
          poster: posterFields,
        });
      }
    }
    if (validation.valid) {
      validatedVersions.push({ ...candidate, variantIndex: i });
      factualValidations.push(validation);
    } else {
      console.warn(
        `  [draft] ตัด variant ${i === 0 ? 'A' : 'B'} เพราะข้อเท็จจริงไม่ผ่าน: ${validation.errors.map((e) => e.message).join(' · ')}`
      );
    }
  }
  versions = validatedVersions;
  if (versions.length === 0) {
    const note = 'AI สร้างร่างที่ผ่าน factual gate ไม่ได้ — กรุณาตรวจข้อมูลใบขอ/ตำแหน่งก่อนลองใหม่';
    await query(
      `UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, note],
    );
    await failContentStage(visualRun, note, { posterValidation });
    throw new Error(note);
  }
  const contactLine = process.env.CONTENT_CONTACT_LINE || '';
  const posterTrendLabels = selectRelevantTrends(trends, jobSpec, 'image').map((t) => t.label);
  const posterDirection = resolvePosterDirection({
    jobFamily: jobSpec.family,
    trendLabels: posterTrendLabels,
  });
  let images = [];
  for (const v of versions) {
    const person = await generateImage({ prompt: v.imagePrompt, transparent: true }).catch(() => null);
    let img = null;
    if (posterFields) {
      const personUri = person ? `data:${person.mime};base64,${person.bytes.toString('base64')}` : null;
      img = await renderPoster({
        ...posterFields,
        contactLine,
        jobFamily: jobSpec.family,
        trendLabels: posterTrendLabels,
      }, personUri).catch(() => null);
    }
    if (!img) img = person; // fallback: อย่างน้อยได้รูปคน (หรือ null = ไม่มีรูป)
    images.push(img);
  }
  const madeImages = images.filter(Boolean).length;
  if (madeImages) console.log(`  [draft] A/B รูป: ${madeImages}/${versions.length} ใบ (สไตล์ต่างกันตาม research/เทรนด์)`);
  await completeContentStage(visualRun, {
    poster_fields: posterFields,
    poster_direction: posterDirection,
    images_created: madeImages,
    variants: versions.length,
  }, { promptVersion: 'visual-direction-v1' });

  const qualityRun = await beginContentStage({
    campaignId,
    stageKey: 'quality',
    agentKey: 'quality_agent',
    input: { variants: versions.length, jobSpec, poster_validated: posterValidation.valid },
  });
  const scored = versions.map((item, index) => ({
    item,
    validation: factualValidations[index],
    image: images[index],
    score: scoreRecruitContent({
      campaign: base,
      jobSpec,
      caption: item.caption,
      poster: posterFields,
      factualValidation: factualValidations[index],
      research,
      hasImage: !!images[index],
    }),
  }));
  const passing = scored.filter((row) => row.score.hard_gate_passed);
  if (passing.length === 0) {
    const note = `ร่างไม่ผ่าน Quality Gate: ${scored.flatMap((row) => row.score.blockers).join(' · ')}`;
    await failContentStage(qualityRun, note, { scores: scored.map((row) => row.score) });
    await query(
      `UPDATE recruit_campaigns SET status='draft_error', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, note.slice(0, 1000)],
    );
    throw new Error(note);
  }
  versions = passing.map((row) => row.item);
  factualValidations = passing.map((row) => row.validation);
  images = passing.map((row) => row.image);
  const qualityScores = passing.map((row) => row.score);
  await completeContentStage(qualityRun, {
    passed: passing.length,
    rejected: scored.length - passing.length,
    scores: scored.map((row, index) => ({ variant: index === 0 ? 'A' : 'B', ...row.score })),
  }, {
    promptVersion: 'quality-v1',
    qualityScore: Math.max(...qualityScores.map((score) => score.overall_score)),
  });

  const [{ v: version }] = (
    await query(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM campaign_contents WHERE campaign_id = $1`, [campaignId])
  ).rows;

  // gen_notes = provenance ว่าแต่ละร่างคิดจากอะไร (โชว์บนหน้า campaign; schema-015 ยังไม่มี = ข้าม)
  const genNotesBase = {
    ...(research ? { angles: research.angles, hooks: research.hooks, research_model: research.model } : {}),
    ...(trends.length ? { trends: trends.map((t) => t.label) } : {}),
    ...(trendKeywords.length ? { trend_keywords: trendKeywords } : {}),
    job_family: jobSpec.family,
    job_family_label: jobSpec.familyLabel,
    resolved_position: jobSpec.position,
    position_source: jobSpec.source,
    position_confidence: jobSpec.confidence,
    text_provider: resolveTextProvider()?.provider ?? null,
  };
  for (let i = 0; i < versions.length; i += 1) {
    const v = versions[i];
    const variantIndex = Number.isInteger(v.variantIndex) ? v.variantIndex : i;
    const image = images[i];
    const genNotes = JSON.stringify({
      ...genNotesBase,
      style: AB_STYLES[variantIndex] ?? null,
      imageStyle: styles[variantIndex] ?? styles[0] ?? research?.imageStyle ?? null, // สไตล์รูปของเวอร์ชันนี้ (ไว้เรียนรู้ว่าอันไหนชนะ)
      visual_brief: v.visualBrief ?? null,
      poster_direction: posterDirection,
      poster_fields: posterFields,
      used_winning: winningExamples.length,
      used_losing: losingExamples.length,
      used_rejections: rejectionFeedback.length,
    });
    try {
      const inserted = await query(
        `INSERT INTO campaign_contents
           (campaign_id, version, platform, caption, image_bytes, image_mime, video_brief,
            gen_model, status, gen_notes, factual_validation, experiment_key, experiment_variant,
            quality_score, quality_gate)
         VALUES ($1, $2, 'facebook', $3, $4, $5, $6, $7, 'draft', $8::jsonb, $9::jsonb, $10, $11, $12, true)
         RETURNING id`,
        [
          campaignId,
          version + i,
          v.caption,
          image?.bytes ?? null,
          image?.mime ?? null,
          v.videoBrief,
          v.model,
          genNotes,
          JSON.stringify(factualValidations[i]),
          `${campaignId}:${version}`,
          variantIndex === 0 ? 'A' : 'B',
          qualityScores[i].overall_score,
        ],
      );
      await query(
        `INSERT INTO content_quality_scores
           (content_id, campaign_id, overall_score, hard_gate_passed, dimensions,
            blockers, warnings, evaluator_version)
         VALUES ($1,$2,$3,true,$4::jsonb,$5::jsonb,$6::jsonb,$7)
         ON CONFLICT (content_id) DO UPDATE SET
           overall_score=EXCLUDED.overall_score,
           hard_gate_passed=EXCLUDED.hard_gate_passed,
           dimensions=EXCLUDED.dimensions,
           blockers=EXCLUDED.blockers,
           warnings=EXCLUDED.warnings,
           evaluator_version=EXCLUDED.evaluator_version,
           evaluated_at=now()`,
        [
          inserted.rows[0].id,
          campaignId,
          qualityScores[i].overall_score,
          JSON.stringify(qualityScores[i].dimensions),
          JSON.stringify(qualityScores[i].blockers),
          JSON.stringify(qualityScores[i].warnings),
          qualityScores[i].evaluator_version,
        ],
      );
    } catch (error) {
      if (error?.code !== '42703') throw error;
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
  await recordHumanHandoff({
    campaignId,
    fromStage: 'quality',
    toStage: 'human_approval',
    status: 'pending',
    payload: { variants: versions.length, quality_scores: qualityScores.map((score) => score.overall_score) },
  });

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
    badge: 'เปิดรับสมัคร',
    location: String(c.province || s('location') || '').trim(),
    worktime: s('work_schedule'),
    salaryTotal: (income.match(/[\d]{1,3}(?:,\d{3})*\s*\+{0,2}/)?.[0] ?? '').trim(),
    salaryBreakdown: income,
    qualifications: quals.slice(0, 6),
    benefits: [],
  };
}
