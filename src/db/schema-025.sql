-- schema-025: candidate follow-up activity (read/viewed + phone calls)
-- Keep an append-only audit trail so the candidate warehouse can answer both
-- the current status and who/when an activity happened.
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS candidate_activity (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('viewed', 'called')),
  actor         text,
  note          text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_activity_candidate_time
  ON candidate_activity(candidate_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_activity_type_time
  ON candidate_activity(activity_type, occurred_at DESC);
