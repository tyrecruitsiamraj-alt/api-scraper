-- ============================================================
--  Migration 002 — scrape tasks, provider daily caps, AI extraction
--  Idempotent. Applied after schema.sql by migrate.js.
-- ============================================================
SET search_path TO "so-candidate-data";

-- ---- provider_limits: daily cap PER PLATFORM (across all its connectors) ----
CREATE TABLE IF NOT EXISTS provider_limits (
  platform   text PRIMARY KEY,                 -- jobbkk | jobthai | ...
  daily_cap  integer NOT NULL DEFAULT 200,      -- max candidates/day across connectors
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- sensible defaults (won't overwrite existing rows)
INSERT INTO provider_limits (platform, daily_cap) VALUES ('jobbkk', 200), ('jobthai', 150)
  ON CONFLICT (platform) DO NOTHING;

-- ---- scrape_tasks: a schedulable/runnable job bound to one connector ----
CREATE TABLE IF NOT EXISTS scrape_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  connector_id    uuid NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  mode            text NOT NULL DEFAULT 'count',     -- count | date_range
  target_count    integer,                            -- mode=count
  updated_since   date,                               -- mode=date_range: scrape profiles updated today → back to this date
  criteria        jsonb NOT NULL DEFAULT '{}'::jsonb, -- position/keyword/filters
  schedule_cron   text,                               -- null = manual/run-now
  enabled         boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'idle',       -- idle|queued|running|done|error
  progress_got    integer NOT NULL DEFAULT 0,
  progress_target integer NOT NULL DEFAULT 0,
  last_run_id     uuid REFERENCES scrape_runs(id) ON DELETE SET NULL,
  last_run_at     timestamptz,
  next_run_at     timestamptz,                         -- when scheduled, next fire time
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON scrape_tasks(enabled, status, next_run_at);

-- link a run back to the task that spawned it
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES scrape_tasks(id) ON DELETE SET NULL;

-- ---- AI extraction of attachments (Ollama / typhoon-ocr) ----
ALTER TABLE candidate_assets ADD COLUMN IF NOT EXISTS extracted_text text;
ALTER TABLE candidate_assets ADD COLUMN IF NOT EXISTS extracted jsonb;          -- structured fields from the doc
ALTER TABLE candidate_assets ADD COLUMN IF NOT EXISTS extract_status text NOT NULL DEFAULT 'pending'; -- pending|success|skipped|error:*
ALTER TABLE candidate_assets ADD COLUMN IF NOT EXISTS extracted_at timestamptz;
