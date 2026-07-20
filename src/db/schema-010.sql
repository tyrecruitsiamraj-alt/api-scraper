-- ============================================================
-- Migration 010 — So Recruit → Scraping workflow + result review
-- Non-destructive: existing scrape tasks remain review_status=not_required.
-- ============================================================
SET search_path TO "so-candidate-data";

ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS source_request_no text;
ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_required';
ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scrape_tasks_source_request
  ON scrape_tasks(source_request_no)
  WHERE source_request_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scrape_tasks_work_center
  ON scrape_tasks(status, review_status, created_at DESC);
