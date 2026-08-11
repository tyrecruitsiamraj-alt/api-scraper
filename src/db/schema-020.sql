-- schema-020: auditable market research collected before content generation
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS campaign_market_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  evidence_key text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('google_trends', 'facebook_post', 'manual')),
  source_url text,
  query_term text,
  source_name text,
  published_at timestamptz,
  reactions integer,
  comments integer,
  shares integer,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_market_research_campaign
  ON campaign_market_research (campaign_id, collected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_market_research_evidence
  ON campaign_market_research (campaign_id, evidence_key);
