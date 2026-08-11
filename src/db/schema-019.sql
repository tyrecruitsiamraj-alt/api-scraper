-- schema-019: per-run heartbeat to prevent duplicate recovery of a live scrape

SET search_path TO "so-candidate-data";

ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_scrape_runs_running_heartbeat
  ON scrape_runs (task_id, heartbeat_at)
  WHERE status = 'running';

-- deterministic content quality gate before human approval/publishing
-- schema-019: deterministic quality gate before human approval/publishing

SET search_path TO "so-candidate-data";

ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS quality_status text NOT NULL DEFAULT 'pending';
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS quality_score integer;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS quality_checks jsonb;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS quality_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_campaign_contents_quality
  ON campaign_contents (quality_status, created_at DESC);
