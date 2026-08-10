-- schema-019: per-run heartbeat to prevent duplicate recovery of a live scrape

SET search_path TO "so-candidate-data";

ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_scrape_runs_running_heartbeat
  ON scrape_runs (task_id, heartbeat_at)
  WHERE status = 'running';
