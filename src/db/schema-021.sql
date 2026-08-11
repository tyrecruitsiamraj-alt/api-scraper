-- schema-021: stable, deduplicated resume count per scraping task
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS scrape_task_candidates (
  task_id uuid NOT NULL REFERENCES scrape_tasks(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_source_id uuid REFERENCES candidate_sources(id) ON DELETE SET NULL,
  matched_position text,
  first_matched_at timestamptz NOT NULL DEFAULT now(),
  last_matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_scrape_task_candidates_candidate
  ON scrape_task_candidates (candidate_id, last_matched_at DESC);

-- Preserve the latest traceable results from tasks created before this table existed.
INSERT INTO scrape_task_candidates (task_id, candidate_id, candidate_source_id, matched_position, first_matched_at, last_matched_at)
SELECT DISTINCT ON (r.task_id, s.candidate_id)
  r.task_id,
  s.candidate_id,
  s.id,
  COALESCE(r.criteria->>'position', r.criteria->>'keyword'),
  COALESCE(s.first_seen_at, r.started_at),
  COALESCE(s.last_seen_at, r.finished_at, r.started_at)
FROM candidate_sources s
JOIN scrape_runs r ON r.id = s.run_id
WHERE r.task_id IS NOT NULL
ORDER BY r.task_id, s.candidate_id, s.last_seen_at DESC
ON CONFLICT (task_id, candidate_id) DO NOTHING;
