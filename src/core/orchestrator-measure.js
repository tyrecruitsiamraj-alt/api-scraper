import { query } from '../db/pool.js';
import { envInt } from '../config.js';
import { resolveContentJobSpec } from './content-job-spec.js';

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

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export async function measureCampaign(campaignId) {
  if (!campaignId) throw new Error('measureCampaign: missing campaignId');

  const { rows: crows } = await query(`SELECT * FROM recruit_campaigns WHERE id = $1`, [campaignId]);
  const campaign = crows[0];
  if (!campaign) throw new Error(`campaign not found: ${campaignId}`);
  const jobSpec = resolveContentJobSpec({
    title: campaign.title,
    positions: campaign.positions,
    snapshot: campaign.request_snapshot ?? {},
  });
  const positionFamily = jobSpec.family || jobSpec.position || campaign.title || campaign.request_no || null;

  const highScore = envInt('ENGAGE_HIGH_SCORE', 5);
  const leadWeight = envNumber('ENGAGE_LEAD_WEIGHT', 4);
  const commentWeight = envNumber('ENGAGE_COMMENT_WEIGHT', 1);
  const reactionWeight = envNumber('ENGAGE_REACTION_WEIGHT', 0.25);
  const shareWeight = envNumber('ENGAGE_SHARE_WEIGHT', 2);
  const minAgeHours = envNumber('ENGAGE_MIN_AGE_HOURS', 24);

  const { rows: posts } = await query(
    `SELECT id, content_id, job_ref FROM campaign_posts WHERE campaign_id = $1`,
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
      `SELECT comment_count, customer_phone, post_link, created_at,
              COALESCE(reactions, 0) AS reactions, COALESCE(shares, 0) AS shares
         FROM ${AP}.post_logs
        WHERE job_id = $1
          AND (lifecycle_state IS NULL OR lifecycle_state IN ('logged','verified'))`,
      [p.job_ref],
    ).catch(async () => {
      // ถ้าคอลัมน์ reactions/shares ยังไม่มีจริง — fallback query แบบไม่มีสองคอลัมน์นั้น
      const r = await query(
        `SELECT comment_count, customer_phone, post_link, created_at, 0 AS reactions, 0 AS shares
           FROM ${AP}.post_logs WHERE job_id = $1`,
        [p.job_ref],
      );
      return r;
    });
    if (logs.length === 0) {
      anyPending = true; // โพสต์แล้วแต่ collect ยังไม่เก็บ (หรือยังไม่โพสต์เสร็จ)
      continue;
    }

    const newestCreatedAt = logs.reduce(
      (max, r) => (r.created_at && (!max || r.created_at > max) ? r.created_at : max),
      null,
    );
    const ageHours = newestCreatedAt
      ? (Date.now() - new Date(newestCreatedAt).getTime()) / 3_600_000
      : 0;
    if (ageHours < minAgeHours) {
      anyPending = true;
      continue;
    }

    const comments = logs.reduce((s, r) => s + (Number(r.comment_count) || 0), 0);
    const likes = logs.reduce((s, r) => s + (Number(r.reactions) || 0), 0);
    const shares = logs.reduce((s, r) => s + (Number(r.shares) || 0), 0);
    const leads = countLeads(logs.map((r) => r.customer_phone));
    const postLink = logs.find((r) => r.post_link && String(r.post_link).trim())?.post_link ?? null;
    const postedAt = logs.reduce((min, r) => (r.created_at && (!min || r.created_at < min) ? r.created_at : min), null);
    // Normalize per posted group so A/B variants with different group counts are comparable.
    const rawScore =
      comments * commentWeight +
      likes * reactionWeight +
      shares * shareWeight +
      leads * leadWeight;
    const score = Number((rawScore / Math.max(1, logs.length)).toFixed(3));
    const verdict = score >= highScore ? 'high' : 'low';

    await query(
      `UPDATE campaign_posts
          SET comments = $2, lead_count = $3, post_link = COALESCE($4, post_link),
              posted_at = COALESCE(posted_at, $5), engagement_score = $6,
              verdict = $7, likes = $8, shares = $9, measured_at = now()
        WHERE id = $1`,
      [p.id, comments, leads, postLink, postedAt, score, verdict, likes, shares],
    );
    if (p.content_id) {
      await query(
        `UPDATE campaign_contents SET engagement_score=$2 WHERE id=$1`,
        [p.content_id, score],
      );
    }

    measured += 1;
    if (verdict === 'high') anyHigh = true;
    if (score > bestScore) {
      bestScore = score;
      bestContentId = p.content_id;
    }
  }

  // ---- ตัดสินระดับ campaign + ขับ feedback loop ----
  if (anyHigh && !anyPending) {
    if (bestContentId) {
      await query(
        `UPDATE campaign_contents
            SET status=CASE WHEN id=$2 THEN 'winner' ELSE 'loser' END
          WHERE campaign_id=$1
            AND id IN (SELECT content_id FROM campaign_posts WHERE campaign_id=$1)`,
        [campaignId, bestContentId],
      );
      await query(
        `INSERT INTO content_winning_patterns
           (position_family, platform, sample_content_id, avg_engagement, campaign_id, engagement_score)
         VALUES ($1, 'facebook', $2, $3, $4, $3)
         ON CONFLICT (sample_content_id) WHERE sample_content_id IS NOT NULL DO UPDATE SET
           avg_engagement = EXCLUDED.avg_engagement, engagement_score = EXCLUDED.engagement_score`,
        [positionFamily, bestContentId, bestScore, campaignId],
      );
    }
    await saveEvidenceBackedExamples({
      campaignId,
      jobSpec,
      bestContentId,
      winnerFound: true,
    });
    await query(
      `UPDATE recruit_campaigns SET status='done', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, `วัดครบแล้ว · คะแนนต่อกลุ่มสูงสุด ${bestScore} — บันทึกแนวที่เวิร์ค`],
    );
    return { campaignId, measured, verdict: 'high', bestScore };
  }

  if (measured > 0 && !anyPending) {
    // วัดครบแล้วแต่ต่ำทั้งหมด → บันทึก "แนวที่ไม่เวิร์ค" ก่อน แล้วคิดใหม่ (regen version ใหม่)
    if (bestContentId) {
      await query(
        `UPDATE campaign_contents
            SET status='loser'
          WHERE campaign_id=$1
            AND id IN (SELECT content_id FROM campaign_posts WHERE campaign_id=$1)`,
        [campaignId],
      );
      // bestContentId = เวอร์ชันที่คะแนนดีที่สุดในบรรดาที่ต่ำ = ตัวแทนแนวที่โพสต์แล้วคนไม่สนใจ
      // fail-soft: ตาราง content_losing_patterns เพิ่งมาใน schema-014 — ถ้ายังไม่ migrate ก็ข้าม
      await query(
        `INSERT INTO content_losing_patterns
           (position_family, platform, sample_content_id, avg_engagement, engagement_score, campaign_id, reason)
         VALUES ($1, 'facebook', $2, $3, $3, $4, $5)
         ON CONFLICT (sample_content_id) WHERE sample_content_id IS NOT NULL DO UPDATE SET
           avg_engagement = EXCLUDED.avg_engagement, engagement_score = EXCLUDED.engagement_score,
           reason = EXCLUDED.reason`,
        [
          positionFamily,
          bestContentId,
          bestScore,
          campaignId,
          `คะแนน ${bestScore} ต่ำกว่าเกณฑ์ ${highScore}`,
        ],
      ).catch((e) => {
        console.warn(`[measure] บันทึก losing pattern ไม่สำเร็จ (${campaignId}): ${e.message}`);
      });
    }
    await saveEvidenceBackedExamples({
      campaignId,
      jobSpec,
      bestContentId,
      winnerFound: false,
    });
    await query(
      `UPDATE recruit_campaigns SET status='low_engagement', status_note=$2, updated_at=now() WHERE id=$1`,
      [campaignId, `คนสนใจน้อย (คะแนนสูงสุด ${bestScore}) — ให้ AI คิดใหม่`],
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

/**
 * คลังตัวอย่างที่เชื่อถือได้: เก็บเฉพาะ content ที่มี post จริงและผ่านรอบวัดครบแล้ว
 * พร้อม sample size + หลักฐานดิบ เพื่อไม่ให้ AI เลียนแบบ “ตัวอย่างสวยแต่ไม่มีผลจริง”.
 */
async function saveEvidenceBackedExamples({ campaignId, jobSpec, bestContentId, winnerFound }) {
  await query(
    `INSERT INTO content_examples
       (content_id, campaign_id, job_family, position, platform, outcome,
        quality_score, engagement_per_group, sample_size, evidence, provenance)
     SELECT cc.id, cc.campaign_id, $2, $3, cc.platform,
            CASE WHEN $5::boolean AND cc.id=$4 THEN 'winner' ELSE 'loser' END,
            cc.quality_score,
            MAX(cp.engagement_score),
            COUNT(cp.id)::int,
            jsonb_build_object(
              'posts', COUNT(cp.id),
              'likes', COALESCE(SUM(cp.likes), 0),
              'comments', COALESCE(SUM(cp.comments), 0),
              'shares', COALESCE(SUM(cp.shares), 0),
              'leads', COALESCE(SUM(cp.lead_count), 0),
              'measured_at', MAX(cp.measured_at)
            ),
            jsonb_build_object(
              'factual_validation', COALESCE(cc.factual_validation, '{}'::jsonb),
              'generation', COALESCE(cc.gen_notes, '{}'::jsonb)
            )
       FROM campaign_contents cc
       JOIN campaign_posts cp ON cp.content_id=cc.id AND cp.campaign_id=cc.campaign_id
      WHERE cc.campaign_id=$1 AND cp.measured_at IS NOT NULL
      GROUP BY cc.id
     ON CONFLICT (content_id) DO UPDATE SET
       outcome=EXCLUDED.outcome,
       quality_score=EXCLUDED.quality_score,
       engagement_per_group=EXCLUDED.engagement_per_group,
       sample_size=EXCLUDED.sample_size,
       evidence=EXCLUDED.evidence,
       provenance=EXCLUDED.provenance,
       active=true,
       updated_at=now()`,
    [campaignId, jobSpec.family || null, jobSpec.position || null, bestContentId, winnerFound],
  ).catch((e) => {
    console.warn(`[measure] บันทึก evidence-backed examples ไม่สำเร็จ (${campaignId}): ${e.message}`);
  });
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
