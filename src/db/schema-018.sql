-- schema-018: reliable queue leases + structured human feedback for content learning

SET search_path TO "so-candidate-data";

ALTER TABLE work_queue ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE work_queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE work_queue ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_work_queue_available
  ON work_queue (status, available_at, priority DESC, created_at);

CREATE TABLE IF NOT EXISTS content_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  content_id  uuid NOT NULL REFERENCES campaign_contents(id) ON DELETE CASCADE,
  decision    text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason_codes text[] NOT NULL DEFAULT '{}',
  note        text,
  reviewer    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_feedback_campaign
  ON content_feedback (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_feedback_content
  ON content_feedback (content_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_feedback_decision
  ON content_feedback (content_id, decision);

ALTER TABLE content_winning_patterns ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'measured';
ALTER TABLE content_losing_patterns ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'measured';

ALTER TABLE campaign_posts ADD COLUMN IF NOT EXISTS sample_size integer NOT NULL DEFAULT 0;
ALTER TABLE campaign_posts ADD COLUMN IF NOT EXISTS score_version text;
