import { query } from '../db/pool.js';

export const CONTENT_STAGES = [
  { stageKey: 'spec', agentKey: 'spec_agent', label: 'ยืนยันตำแหน่ง' },
  { stageKey: 'research', agentKey: 'trend_agent', label: 'สำรวจ Trend' },
  { stageKey: 'copy', agentKey: 'copy_agent', label: 'เขียน Caption A/B' },
  { stageKey: 'visual', agentKey: 'visual_agent', label: 'สร้าง Visual' },
  { stageKey: 'quality', agentKey: 'quality_agent', label: 'ตรวจคุณภาพ' },
];

function compact(value, depth = 0) {
  if (value == null) return value;
  if (Buffer.isBuffer(value)) return { type: 'buffer', bytes: value.length };
  if (depth > 5) return '[max-depth]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compact(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|token|secret|image_bytes/i.test(key))
        .slice(0, 60)
        .map(([key, item]) => [key, compact(item, depth + 1)]),
    );
  }
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  return value;
}

export async function beginContentStage({ campaignId, stageKey, agentKey, input = {} }) {
  const attemptResult = await query(
    `SELECT COALESCE(MAX(attempt),0)+1 AS attempt
       FROM campaign_stage_runs WHERE campaign_id=$1 AND stage_key=$2`,
    [campaignId, stageKey],
  );
  const attempt = Number(attemptResult.rows[0]?.attempt) || 1;
  const previous = await query(
    `SELECT stage_key, id FROM campaign_stage_runs
      WHERE campaign_id=$1 AND status='completed'
      ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`,
    [campaignId],
  );
  const { rows } = await query(
    `INSERT INTO campaign_stage_runs
       (campaign_id, stage_key, agent_key, attempt, status, input_snapshot)
     VALUES ($1,$2,$3,$4,'running',$5::jsonb)
     RETURNING id, started_at`,
    [campaignId, stageKey, agentKey, attempt, JSON.stringify(compact(input))],
  );
  await query(
    `UPDATE recruit_campaigns SET current_stage=$2, updated_at=now() WHERE id=$1`,
    [campaignId, stageKey],
  );
  if (previous.rows[0]?.stage_key !== stageKey) {
    await query(
      `INSERT INTO campaign_handoffs
         (campaign_id, from_stage, to_stage, status, stage_run_id, payload, completed_at)
       VALUES ($1,$2,$3,'accepted',$4,$5::jsonb,now())`,
      [
        campaignId,
        previous.rows[0]?.stage_key ?? 'intake',
        stageKey,
        rows[0].id,
        JSON.stringify({ attempt, input: compact(input) }),
      ],
    );
  }
  return { id: rows[0].id, campaignId, stageKey, agentKey, attempt };
}

export async function completeContentStage(run, output = {}, opts = {}) {
  await query(
    `UPDATE campaign_stage_runs
        SET status='completed', output_snapshot=$2::jsonb,
            model=$3, prompt_version=$4, quality_score=$5,
            error=NULL, finished_at=now()
      WHERE id=$1`,
    [
      run.id,
      JSON.stringify(compact(output)),
      opts.model ?? null,
      opts.promptVersion ?? null,
      opts.qualityScore ?? null,
    ],
  );
}

export async function failContentStage(run, error, output = {}) {
  const message = String(error?.message || error || 'stage failed').slice(0, 1000);
  await query(
    `UPDATE campaign_stage_runs
        SET status='failed', output_snapshot=$2::jsonb, error=$3, finished_at=now()
      WHERE id=$1`,
    [run.id, JSON.stringify(compact(output)), message],
  );
  await query(
    `INSERT INTO campaign_handoffs
       (campaign_id, from_stage, to_stage, status, stage_run_id, payload, reason, completed_at)
     VALUES ($1,$2,$2,'rejected',$3,$4::jsonb,$5,now())`,
    [run.campaignId, run.stageKey, run.id, JSON.stringify(compact(output)), message],
  );
}

export async function recordHumanHandoff({ campaignId, fromStage, toStage, status, reason, payload = {} }) {
  await query(
    `INSERT INTO campaign_handoffs
       (campaign_id, from_stage, to_stage, status, payload, reason, completed_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,CASE WHEN $4='pending' THEN NULL ELSE now() END)`,
    [campaignId, fromStage, toStage, status, JSON.stringify(compact(payload)), reason ?? null],
  );
}
