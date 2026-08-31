-- schema-026: preserve provider search order after the provider's newest-first
-- gate has verified it. This rank is more useful than the timestamp at which
-- our sequential scraper happened to write the row.
SET search_path TO "so-candidate-data";

ALTER TABLE candidate_sources ADD COLUMN IF NOT EXISTS search_rank integer;

CREATE INDEX IF NOT EXISTS idx_candidate_sources_recent_rank
  ON candidate_sources(run_id, search_rank, last_seen_at DESC);
