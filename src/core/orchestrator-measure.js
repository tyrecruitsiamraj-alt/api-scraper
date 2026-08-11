import { query } from '../db/pool.js';
import { envInt } from '../config.js';
import { learningFeatures } from './content-second-brain.js';

// schema ของ autopost (แยกต่อ project ผ่าน env — ต้องตรงกับ web/lib/repo.ts)
const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) {
  throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
}
const AP = `"${AP_SCHEMA}"`;

/**
 * เฟส 4 — วัดผล engagement ของโพสต์ใน campaign แล้ววน feedback loop:
 *   - อ่าน engagement ที่ autopost collect เก็บไว้ (${AP}.post_logs:
 *     comment_count + customer_phone=คนทัก/ให้เบอร์ + post_link) join ด้วย campaign_posts.job_ref
 *   - คำนวณคะแนน = comments + leads*น้ำหนัก → verdict high/low ต่อโพสต์
 *   - campaign: มีโพสต์ "high" → done + บันทึก content_winning_patterns;
 *     วัดได้แต่ "low" ทั้งหมด → low_engagement แล้ว enqueue ร่างใหม่ (regen) กลับ drafting;
 *     ยังไม่มีข้อมูล collect → คง measuring (รอ collect รอบถัดไป)
 *
 * อ่านอย่างเดียวจาก post_logs (ไม่เปิด FB เอง) — การอ่าน reactions/shares เชิงลึกอยู่ที่
 * autopost collect (งานย่อยที่เหลือ). เป็น pure DB — worker เรียกผ่าน work_queue type='measure'.
 */

const LEAD_RE = /\d{9,}/g; // เบอร์ไทย ≥9 หลัก (customer_phone เก็บหลายเบอร์รวมกัน)

function countLeads(phoneStrings) {
  const set = new Set();
  for (const s of phoneStrings) {
    if (!s) continue;
    const digits = String(s).replace(/[^\d]+/g, ' ');
    for (const m of digits.matchAll(LEAD_RE)) set.add(m[0]);
  }
  return set.size;
}

export function calculateEngagement({ comments, leads, shares, likes, sampleSize, highScore, leadWeight, mature }) {
  const samples = Math.max(1, Number(sampleSize) || 1);
  const rawScore = (Number(leads) || 0) * leadWeight
    + (Number(shares) || 0) * 2
    + (Number(comments) || 0)
    + (Number(likes) || 0) * 0.1;
  const score = Number((rawScore / samples).toFixed(2));
  return { score, verdict: mature ? (score >= highScore ? 'high' : 'low') : 'pending' };
}

export async function measureCampaign(campaignId) {
  if (!campaignId) throw new Error('measureCampaign: missing campaignId');

  const { rows: crows } = await query(`SELECT * FROM recruit_campaigns WHERE id = $1`, [campaignId]);
  const campaign = crows[0];
  if (!campaign) throw new Error(`campaign not found: ${campaignId}`);

  const highScore = envInt('ENGAGE_HIGH_SCORE', 5);
  const leadWeight = envInt('ENGAGE_LEAD_WEIGHT', 5);
  const minAgeMinutes = envInt('ENGAGE_MIN_AGE_MINUTES', 60);

  const { rows: posts } = await query(
    `SELECT cp.id, cp.content_id, cp.job_ref, cp.account_ref, cc.gen_notes
       FROM campaign_posts cp
       LEFT JOIN campaign_contents cc ON cc.id=cp.content_id
      WHERE cp.campaign_id = $1`,
    [campaignId],
  );
  if (posts.length === 0) {
    return { campaignId, measured: 0, note: 'no campaign_posts (ยังไม่ได้โพสต์)' };
  }

  let measured = 0;
  let anyHigh = false;
  let anyPending = false;
  let bestScore = -1;
  let bestContentId = null;

  for (const p of posts) {
    if (!p.job_ref) {
      anyPending = true;
      continue;
    }
    // รวม engagement ทุกกลุ่มที่ job นี้ถูกโพสต์ (1 job → หลาย post_logs)
    // reactions/shares อาจยังไม่มีคอลัมน์ (collect เวอร์ชันเก่า) — COALESCE 0 กันพัง
    const { rows: logs } = await query(
      `SELECT id, group_id, group_name, member_count, comment_count, customer_phone, post_link, created_at,
              COALESCE(reactions, 0) AS reactions, COALESCE(shares, 0) AS shares
         FROM ${AP}.post_logs WHERE job_id = $1`,
      [p.job_ref],
    ).catch(async () => {
      // ถ้าคอลัมน์ reactions/shares ยังไม่มีจริง — fallback query แบบไม่มีสองคอลัมน์นั้น
      const r = await query(
        `SELECT id, group_id, group_name, member_count, comment_count, customer_phone, post_link, created_at,
                0 AS reactions, 0 AS shares
           FROM ${AP}.post_logs WHERE job_id = $1`,
        [p.job_ref],
      );
      return r;
    });
    if (logs.length === 0) {
      anyPending = true; // โพสต์แล้วแต่ collect ยังไม่เก็บ (หรือยังไม่โพสต์เสร็จ)
      continue;
    }

    const comments = logs.reduce((s, r) => s + (Number(r.comment_count) || 0), 0);
    const likes = logs.reduce((s, r) => s + (Number(r.reactions) || 0), 0);
    const shares = logs.reduce((s, r) => s + (Number(r.shares) || 0), 0);
    const leads = countLeads(logs.map((r) => r.customer_phone));
    const postLink = logs.find((r) => r.post_link && String(r.post_link).trim())?.post_link ?? null;
    const postedAt = logs.reduce((min, r) => (r.created_at && (!min || r.created_at < min) ? r.created_at : min), null);
    const sampleSize = Math.max(1, logs.length);
    // วัดผลต่อกลุ่มเพื่อไม่ให้งานที่โพสต์หลายกลุ่มชนะเพียงเพราะมีโอกาสถูกเห็นมากกว่า.
    // เบอร์ผู้สนใจมีน้ำหนักสูงสุด ตามด้วยการแชร์/คอมเมนต์ ส่วน reaction เป็นสัญญาณเบา.
    const ageMinutes = postedAt ? (Date.now() - new Date(postedAt).getTime()) / 60_000 : 0;
    const mature = ageMinutes >= minAgeMinutes;
    const { score, verdict } = calculateEngagement({
      comments, leads, shares, likes, sampleSize, highScore, leadWeight, mature,
    });
    if (!mature) anyPending = true;

    // Learn from each real Facebook group post. One post is only evidence;
    // content_pattern_stats requires three campaigns before reuse.
    for (const log of logs) {
      const logPostedAt = log.created_at || postedAt;
      const logAgeMinutes = logPostedAt ? (Date.now() - new Date(logPostedAt).getTime()) / 60_000 : 0;
      if (logAgeMinutes < minAgeMinutes || !log.id) continue;
      const logLeads = countLeads([log.customer_phone]);
      const logResult = calculateEngagement({
        comments: Number(log.comment_count) || 0,
        leads: logLeads,
        shares: Number(log.shares) || 0,
        likes: Number(log.reactions) || 0,
        sampleSize: 1,
        highScore,
        leadWeight,
        mature: true,
      });
      const features = learningFeatures({ generationNotes: p.gen_notes, postedAt: logPostedAt });
      await query(
        `INSERT INTO content_learning_events
           (source_ref, campaign_post_id, campaign_id, content_id, position_family, platform,
            group_ref, group_name, account_ref, posted_at, caption_style, image_style, posting_slot,
            likes, comments, shares, lead_count, member_count, engagement_score, outcome, measured_at)
         VALUES ($1,$2,$3,$4,$5,'facebook',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
         ON CONFLICT (source_ref) DO UPDATE SET
           likes=EXCLUDED.likes, comments=EXCLUDED.comments, shares=EXCLUDED.shares,
           lead_count=EXCLUDED.lead_count, member_count=EXCLUDED.member_count,
           engagement_score=EXCLUDED.engagement_score, outcome=EXCLUDED.outcome,
           caption_style=EXCLUDED.caption_style, image_style=EXCLUDED.image_style,
           posting_slot=EXCLUDED.posting_slot, measured_at=now()`,
        [
          `post_log:${log.id}`, p.id, campaignId, p.content_id,
          campaign.title || campaign.request_no || null,
          log.group_id || null, log.group_name || null, p.account_ref || null, logPostedAt,
          features.captionStyle, features.imageStyle, features.postingSlot,
          Number(log.reactions) || 0, Number(log.comment_count) || 0, Number(log.shares) || 0,
          logLeads, Number(log.member_count) || null, logResult.score, logResult.verdict,
        ],
      ).catch((error) => console.warn(`[measure] Content Second Brain: ${error.message}`));
    }

    await query(
      `UPDATE campaign_posts
          SET comments = $2, lead_count = $3, post_link = COALESCE($4, post_link),
              posted_at = COALESCE(posted_at, $5), engagement_score = $6,
              verdict = $7, likes = $8, shares = $9, measured_at = now(),
              sample_size = $10, score_version = 'business_v2'
        WHERE id = $1`,
      [p.id, comments, leads, postLink, postedAt, score, verdict, likes, shares, sampleSize],
    );

    measured += 1;
    if (verdict === 'high') anyHigh = true;
    if (score > bestScore) {
      bestScore = score;
      bestContentId = p.content_id;
    }
  }

  // ---- ตัดสินระดับ campaign + ขับ feedback loop ----
  if (anyHigh) {
    await query(
      `UPDATE recruit_campaigns SET status='done', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, `คนสนใจดี (คะแนนสูงสุด ${bestScore}) — บันทึกเป็นหลักฐานแล้ว ระบบจะสรุปเป็นแนวที่เวิร์กเมื่อพบผลซ้ำอย่างน้อย 3 แคมเปญ`],
    );
    return { campaignId, measured, verdict: 'high', bestScore };
  }

  if (measured > 0 && !anyPending) {
    // Low outcome is evidence, not a proven rule. Regenerate now, but only reuse
    // the lesson after the same pattern has repeated across three campaigns.
    await query(
      `UPDATE recruit_campaigns SET status='low_engagement', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, `คนสนใจน้อย (คะแนนสูงสุด ${bestScore}) — เก็บเป็นหลักฐานและให้ AI คิดใหม่; จะสรุปเป็นแนวที่ควรเลี่ยงเมื่อพบซ้ำอย่างน้อย 3 แคมเปญ`],
    );
    await enqueueRegenDraft(campaignId);
    return { campaignId, measured, verdict: 'low', regen: true };
  }

  // ยังมีโพสต์ที่ collect ไม่เก็บ/ยังไม่โพสต์ — รอรอบวัดถัดไป
  await query(
    `UPDATE recruit_campaigns SET status='measuring', status_note=$2, updated_at=now() WHERE id=$1`,
    [campaignId, measured > 0 ? `วัดแล้ว ${measured} โพสต์ รออีกบางส่วน` : 'รอ collect เก็บ engagement'],
  );
  return { campaignId, measured, verdict: 'pending' };
}

/** enqueue ร่างใหม่ (regen) เข้า work_queue — worker draft จะทำ version ถัดไปแล้วกลับ pending_approval. */
async function enqueueRegenDraft(campaignId) {
  await query(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload)
     SELECT 'draft', 'orchestrator', $1, $2, '{}'::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w
         WHERE w.ref_id = $2 AND w.type='draft' AND w.status IN ('queued','running'))`,
    [`orchestrator:${campaignId}`, campaignId],
  );
  await query(`UPDATE recruit_campaigns SET status='drafting', updated_at=now() WHERE id=$1`, [campaignId]);
}
