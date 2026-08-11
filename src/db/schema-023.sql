-- schema-023: evidence-based Content Second Brain.
-- One row is one measured Facebook group post. No applicant PII is stored here.
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS content_learning_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref            text NOT NULL UNIQUE,
  campaign_post_id      uuid NOT NULL REFERENCES campaign_posts(id) ON DELETE CASCADE,
  campaign_id           uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  content_id            uuid REFERENCES campaign_contents(id) ON DELETE SET NULL,
  position_family       text,
  platform              text NOT NULL DEFAULT 'facebook',
  group_ref             text,
  group_name            text,
  account_ref           text,
  posted_at             timestamptz,
  caption_style         text,
  image_style           text,
  posting_slot          text,
  likes                 integer NOT NULL DEFAULT 0,
  comments              integer NOT NULL DEFAULT 0,
  shares                integer NOT NULL DEFAULT 0,
  lead_count            integer NOT NULL DEFAULT 0,
  qualified_lead_count  integer NOT NULL DEFAULT 0,
  hire_count            integer NOT NULL DEFAULT 0,
  member_count          integer,
  engagement_score      numeric NOT NULL DEFAULT 0,
  outcome               text NOT NULL CHECK (outcome IN ('high', 'low')),
  score_version         text NOT NULL DEFAULT 'business_v3',
  measured_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_learning_family
  ON content_learning_events (position_family, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_learning_content
  ON content_learning_events (content_id, measured_at DESC);

-- Separate dimensions avoid an over-specific caption+image+time+group combination
-- that would almost never collect enough evidence. Confidence reaches 1 only
-- after the same pattern has results from at least three distinct campaigns.
CREATE OR REPLACE VIEW content_pattern_stats AS
WITH observations AS (
  SELECT e.*,
         p.pattern_type,
         p.pattern_value
    FROM content_learning_events e
    CROSS JOIN LATERAL (VALUES
      ('caption_style'::text, NULLIF(TRIM(e.caption_style), '')),
      ('image_style'::text, NULLIF(TRIM(e.image_style), '')),
      ('posting_slot'::text, NULLIF(TRIM(e.posting_slot), '')),
      ('facebook_group'::text, NULLIF(TRIM(COALESCE(e.group_name, e.group_ref)), '')),
      ('facebook_account'::text, NULLIF(TRIM(e.account_ref), ''))
    ) AS p(pattern_type, pattern_value)
   WHERE p.pattern_value IS NOT NULL
), ranked AS (
  SELECT o.*,
         row_number() OVER (
           PARTITION BY COALESCE(NULLIF(TRIM(o.position_family), ''), 'ทุกตำแหน่ง'),
                        o.platform, o.pattern_type, o.pattern_value
           ORDER BY o.engagement_score DESC, o.measured_at DESC
         ) AS representative_rank
    FROM observations o
)
SELECT COALESCE(NULLIF(TRIM(position_family), ''), 'ทุกตำแหน่ง') AS position_family,
       platform,
       pattern_type,
       pattern_value,
       count(DISTINCT campaign_id)::integer AS campaign_count,
       count(*)::integer AS post_count,
       count(*) FILTER (WHERE outcome='high')::integer AS high_count,
       count(*) FILTER (WHERE outcome='low')::integer AS low_count,
       round(avg(engagement_score), 2) AS avg_engagement_score,
       sum(lead_count)::integer AS lead_count,
       sum(qualified_lead_count)::integer AS qualified_lead_count,
       sum(hire_count)::integer AS hire_count,
       LEAST(1::numeric, count(DISTINCT campaign_id)::numeric / 3) AS confidence,
       (array_agg(content_id ORDER BY engagement_score DESC, measured_at DESC)
          FILTER (WHERE representative_rank=1))[1] AS representative_content_id,
       max(measured_at) AS last_measured_at
  FROM ranked
 GROUP BY COALESCE(NULLIF(TRIM(position_family), ''), 'ทุกตำแหน่ง'),
          platform, pattern_type, pattern_value;
