-- schema-022: qualification gate + privacy-safe Resume Sourcing Second Brain
SET search_path TO "so-candidate-data";

ALTER TABLE scrape_task_candidates ADD COLUMN IF NOT EXISTS qualification_status text NOT NULL DEFAULT 'needs_review';
ALTER TABLE scrape_task_candidates ADD COLUMN IF NOT EXISTS qualification_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE scrape_task_candidates ADD COLUMN IF NOT EXISTS qualification_score integer;
ALTER TABLE scrape_task_candidates ADD COLUMN IF NOT EXISTS qualification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE scrape_task_candidates ADD COLUMN IF NOT EXISTS evaluated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_scrape_task_candidates_qualification ON scrape_task_candidates(task_id, qualification_status);

ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS opened_count integer NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS qualified_count integer NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS needs_review_count integer NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS rejected_count integer NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS reason_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS resume_search_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES scrape_tasks(id) ON DELETE CASCADE,
  run_id uuid UNIQUE REFERENCES scrape_runs(id) ON DELETE CASCADE,
  connector_id uuid REFERENCES connectors(id) ON DELETE SET NULL,
  platform text NOT NULL,
  job_family text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  search_term text NOT NULL DEFAULT '',
  search_tier text NOT NULL DEFAULT 'direct',
  found_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  unique_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  quota_used integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  reason_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resume_search_attempts_lookup ON resume_search_attempts(job_family, location, platform, observed_at DESC);

CREATE TABLE IF NOT EXISTS resume_sourcing_patterns (
  job_family text NOT NULL,
  location text NOT NULL DEFAULT '',
  platform text NOT NULL,
  search_term text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  unique_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  quota_used integer NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'observation',
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(job_family, location, platform, search_term)
);

-- Historical rows have no Qualification evidence. Do not keep claiming they met the target.
WITH stats AS (
  SELECT t0.id AS task_id, count(tc.candidate_id) FILTER (WHERE tc.qualification_status='qualified')::int AS qualified
    FROM scrape_tasks t0 LEFT JOIN scrape_task_candidates tc ON tc.task_id=t0.id
   GROUP BY t0.id
)
UPDATE scrape_tasks t SET
  progress_got=COALESCE(s.qualified,0),
  status=CASE WHEN t.mode='count' AND t.status='done' AND COALESCE(s.qualified,0) < COALESCE(t.target_count,0) THEN 'partial' ELSE t.status END,
  phase=CASE WHEN t.mode='count' AND t.status='done' AND COALESCE(s.qualified,0) < COALESCE(t.target_count,0) THEN 'partial' ELSE t.phase END,
  last_error=CASE WHEN t.mode='count' AND t.status='done' AND COALESCE(s.qualified,0) < COALESCE(t.target_count,0)
    THEN 'ผลเดิมยังไม่มีหลักฐาน Qualification ครบ — กรุณารันอีกครั้งเพื่อตรวจและค้นต่อ'
    ELSE t.last_error END,
  updated_at=now()
FROM stats s WHERE s.task_id=t.id AND t.status IN ('done','partial');
