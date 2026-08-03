-- schema-018: evidence provenance, content experiment metadata, and scrape observability
SET search_path TO "so-candidate-data";

-- Keep the legacy volume column for compatibility, but label what it actually is.
ALTER TABLE job_trends ADD COLUMN IF NOT EXISTS score_type text NOT NULL DEFAULT 'ai_estimate';
ALTER TABLE job_trends ADD COLUMN IF NOT EXISTS observed_volume integer;
ALTER TABLE job_trends ADD COLUMN IF NOT EXISTS confidence numeric;
ALTER TABLE job_trends ADD COLUMN IF NOT EXISTS sample_size integer;
ALTER TABLE job_trends ADD COLUMN IF NOT EXISTS source_url text;
UPDATE job_trends
   SET score_type='ai_estimate',
       source=CASE WHEN source='seo-update' THEN 'ollama-estimate' ELSE source END
 WHERE source='seo-update' OR score_type IS NULL;

ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS job_family text;
ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS confidence numeric;
ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS sample_size integer;
ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS observed_count integer;
ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS factual_validation jsonb;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS experiment_key text;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS experiment_variant text;
CREATE INDEX IF NOT EXISTS idx_campaign_contents_experiment
  ON campaign_contents(experiment_key, experiment_variant);

ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS funnel jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_scrape_runs_stale
  ON scrape_runs(status, heartbeat_at) WHERE status='running';

ALTER TABLE candidate_assets ADD COLUMN IF NOT EXISTS extract_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE candidate_assets ADD COLUMN IF NOT EXISTS last_extract_error text;

CREATE TABLE IF NOT EXISTS connector_canary_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid REFERENCES connectors(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text NOT NULL,
  search_count integer NOT NULL DEFAULT 0,
  parsed_ok boolean NOT NULL DEFAULT false,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connector_canary_latest
  ON connector_canary_checks(connector_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS data_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text,
  purpose text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_subject
  ON data_access_audit(subject_type, subject_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_actor
  ON data_access_audit(actor, accessed_at DESC);
