import 'dotenv/config';
import pg from 'pg';

const dataSchema = process.env.DB_SCHEMA || 'so-candidate-data';
const autopostSchema = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
for (const [name, value] of Object.entries({ dataSchema, autopostSchema })) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) throw new Error(`${name} ไม่ถูกต้อง`);
}
const qi = (value) => `"${value.replaceAll('"', '""')}"`;
const client = new pg.Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      },
);

async function one(sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows[0] ?? {};
}

await client.connect();
try {
  const ds = qi(dataSchema);
  const ap = qi(autopostSchema);
  const report = {
    generated_at: new Date().toISOString(),
    scrape: {
      candidates: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE phone IS NOT NULL AND trim(phone)<>'')::int AS with_phone,
                count(*) FILTER (WHERE email IS NOT NULL AND trim(email)<>'')::int AS with_email
           FROM ${ds}.candidates`,
      ),
      extraction: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE extract_status='success')::int AS success,
                count(*) FILTER (WHERE extract_status='pending')::int AS pending,
                count(*) FILTER (WHERE extract_status NOT IN ('success','pending'))::int AS other,
                count(*) FILTER (WHERE extract_attempts >= 3)::int AS exhausted
           FROM ${ds}.candidate_assets
          WHERE kind='attachment'`,
      ),
      runs: await one(
        `SELECT count(*) FILTER (WHERE status='running')::int AS running,
                count(*) FILTER (
                  WHERE status='running'
                    AND COALESCE(heartbeat_at, started_at) < now()-interval '30 minutes'
                )::int AS stale
           FROM ${ds}.scrape_runs`,
      ),
      canaries: await one(
        `SELECT count(*) FILTER (WHERE status='pass')::int AS passed,
                count(*) FILTER (WHERE status='fail')::int AS failed,
                max(checked_at) AS latest
           FROM ${ds}.connector_canary_checks
          WHERE checked_at >= now()-interval '1 day'`,
      ),
    },
    content: {
      campaigns: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status='pending_approval')::int AS pending_approval,
                count(*) FILTER (WHERE status IN ('draft_error','post_error'))::int AS errors
           FROM ${ds}.recruit_campaigns`,
      ),
      drafts: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE COALESCE((factual_validation->>'valid')::boolean,false))::int AS factual_valid,
                count(*) FILTER (WHERE factual_validation ? 'content_hash')::int AS hash_bound,
                count(DISTINCT experiment_key) FILTER (WHERE experiment_key IS NOT NULL)::int AS experiments
           FROM ${ds}.campaign_contents`,
      ),
      measured: await one(
        `SELECT count(*) FILTER (WHERE engagement_score IS NOT NULL)::int AS measured,
                count(*) FILTER (WHERE status='winner')::int AS winners,
                count(*) FILTER (WHERE status='loser')::int AS losers
           FROM ${ds}.campaign_contents`,
      ),
      trend_evidence: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE score_type='observed' OR observed_volume IS NOT NULL)::int AS observed,
                count(*) FILTER (WHERE score_type='ai_estimate')::int AS ai_estimates
           FROM ${ds}.job_trends`,
      ),
      ai_team: await one(
        `SELECT
           (SELECT count(*)::int FROM ${ds}.content_agent_contracts WHERE active) AS active_agents,
           count(*)::int AS stage_runs,
           count(*) FILTER (WHERE status='completed')::int AS completed,
           count(*) FILTER (WHERE status='failed')::int AS failed,
           count(*) FILTER (WHERE status='running' AND started_at < now()-interval '30 minutes')::int AS stale
         FROM ${ds}.campaign_stage_runs`,
      ),
      quality_gate: await one(
        `SELECT count(*)::int AS scored,
                count(*) FILTER (WHERE hard_gate_passed)::int AS passed,
                count(*) FILTER (WHERE NOT hard_gate_passed)::int AS blocked,
                round(avg(overall_score),1) AS average_score
           FROM ${ds}.content_quality_scores`,
      ),
      example_library: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE outcome='winner')::int AS winners,
                count(*) FILTER (WHERE outcome='loser')::int AS losers,
                count(*) FILTER (WHERE sample_size > 0 AND evidence <> '{}'::jsonb)::int AS evidence_backed
           FROM ${ds}.content_examples WHERE active`,
      ),
      handoffs: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status='pending')::int AS pending,
                count(*) FILTER (WHERE status='accepted')::int AS accepted,
                count(*) FILTER (WHERE status='rejected')::int AS rejected
           FROM ${ds}.campaign_handoffs`,
      ),
    },
    autopost: {
      queue: await one(
        `SELECT count(*) FILTER (WHERE status='queued')::int AS queued,
                count(*) FILTER (WHERE status='running')::int AS running,
                count(*) FILTER (WHERE status='completed')::int AS completed,
                count(*) FILTER (WHERE status='failed')::int AS failed
           FROM ${ap}.post_run_queue`,
      ),
      ledger: await one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE lifecycle_state='verified' AND post_link IS NOT NULL AND trim(post_link)<>'')::int AS verified,
                count(*) FILTER (WHERE lifecycle_state IN ('posting','clicked_unverified','needs_verification'))::int AS ambiguous,
                count(*) FILTER (WHERE lifecycle_state='failed')::int AS failed,
                count(*) FILTER (WHERE idempotency_key IS NOT NULL)::int AS idempotent
           FROM ${ap}.post_logs`,
      ),
      collect_queue: await one(
        `SELECT count(*) FILTER (WHERE status='queued')::int AS queued,
                count(*) FILTER (WHERE status='running')::int AS running,
                count(*) FILTER (WHERE status='completed')::int AS completed,
                count(*) FILTER (WHERE status='failed')::int AS failed
           FROM ${ap}.collect_run_queue`,
      ),
      workers: await one(
        `SELECT count(*) FILTER (WHERE last_seen >= now()-interval '2 minutes')::int AS online,
                max(last_seen) AS latest
           FROM ${ap}.workers`,
      ),
      secrets: await one(
        `SELECT count(*) FILTER (
                  WHERE password IS NOT NULL AND password<>'' AND password NOT LIKE 'enc:v1:%'
                )::int AS plaintext_passwords,
                count(*) FILTER (
                  WHERE fb_access_token IS NOT NULL AND fb_access_token<>'' AND fb_access_token NOT LIKE 'enc:v1:%'
                )::int AS plaintext_fb_tokens
           FROM ${ap}.users`,
      ),
    },
    privacy: {
      audit_events: await one(
        `SELECT count(*)::int AS total, max(accessed_at) AS latest
           FROM ${ds}.data_access_audit`,
      ),
    },
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}
