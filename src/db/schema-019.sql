-- schema-019: Content AI Team — contracts, supervisor trace, quality scorecard,
-- evidence-backed example library and campaign handoffs.
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS content_agent_contracts (
  agent_key text PRIMARY KEY,
  display_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  responsibility text NOT NULL,
  playbook_path text,
  reads jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  hard_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_agent_contracts ADD COLUMN IF NOT EXISTS playbook_path text;

CREATE TABLE IF NOT EXISTS campaign_stage_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  agent_key text NOT NULL REFERENCES content_agent_contracts(agent_key),
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'running',
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  prompt_version text,
  quality_score numeric,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_campaign_stage_runs_campaign
  ON campaign_stage_runs(campaign_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_stage_runs_status
  ON campaign_stage_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS campaign_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  status text NOT NULL DEFAULT 'accepted',
  stage_run_id uuid REFERENCES campaign_stage_runs(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_campaign_handoffs_campaign
  ON campaign_handoffs(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL UNIQUE REFERENCES campaign_contents(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  overall_score numeric NOT NULL,
  hard_gate_passed boolean NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluator_version text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_quality_campaign
  ON content_quality_scores(campaign_id, overall_score DESC);

CREATE TABLE IF NOT EXISTS content_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL UNIQUE REFERENCES campaign_contents(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  job_family text,
  position text,
  platform text NOT NULL DEFAULT 'facebook',
  outcome text NOT NULL,
  quality_score numeric,
  engagement_per_group numeric,
  sample_size integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_examples_retrieval
  ON content_examples(job_family, outcome, engagement_per_group DESC)
  WHERE active=true;

ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS quality_score numeric;
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS quality_gate boolean NOT NULL DEFAULT false;
ALTER TABLE recruit_campaigns ADD COLUMN IF NOT EXISTS current_stage text;

INSERT INTO content_agent_contracts
  (agent_key, display_name, version, responsibility, playbook_path, reads, steps, output_schema, hard_rules)
VALUES
  ('content_supervisor', 'ผู้อำนวยการคอนเทนต์สรรหา', 1,
   'จัดลำดับงาน รับส่งผลลัพธ์ และหยุด pipeline เมื่อ hard gate ไม่ผ่าน',
   '.agents/skills/recruitment-content-director/SKILL.md',
   '["campaign","stage_runs","quality_gate"]',
   '["route","verify_handoff","stop_or_continue"]',
   '{"next_stage":"string","decision":"continue|stop|repair"}',
   '["never bypass hard gate","never publish without human approval"]'),
  ('spec_agent', 'นักวิเคราะห์งานสรรหา', 1,
   'ยืนยันตำแหน่งจริงและ Candidate Spec จากใบขอ',
   '.agents/skills/candidate-spec-analyzer/SKILL.md',
   '["title","positions","request_snapshot"]',
   '["resolve position","classify job family","separate client and workplace"]',
   '{"position":"string","job_family":"string","source":"string","confidence":"number"}',
   '["never infer role from workplace","missing position stops pipeline"]'),
  ('trend_agent', 'นักกลยุทธ์คอนเทนต์', 1,
   'คัดมุมสื่อสารและ trend ที่เกี่ยวข้องพร้อม provenance',
   '.agents/skills/recruitment-content-director/references/content-strategy.md',
   '["job_spec","observed_trends","example_library"]',
   '["filter same family","label evidence type","propose angles"]',
   '{"angles":"array","hooks":"array","trends":"array","evidence":"array"}',
   '["AI estimate is not search volume","never use unrelated family"]'),
  ('copy_agent', 'นักเขียนคอนเทนต์สรรหา', 1,
   'เขียน Caption A/B และ video brief จาก facts ที่อนุญาต',
   '.agents/skills/recruitment-content-director/references/copywriting.md',
   '["job_spec","research_pack","approved_claims","examples"]',
   '["draft A","draft B","self-check claims"]',
   '{"variants":"array","model":"string"}',
   '["no invented salary or benefits","position must appear in caption"]'),
  ('visual_agent', 'ผู้กำกับศิลป์งานสรรหา', 1,
   'กำหนด poster direction และสร้าง visual ตาม Job Family',
   '.agents/skills/recruitment-content-director/references/visual-direction.md',
   '["job_spec","research_pack","poster_facts"]',
   '["select direction","render variants","mobile readability check"]',
   '{"poster_fields":"object","direction":"object","images_created":"number"}',
   '["poster title equals resolved position","no unsupported claims"]'),
  ('quality_agent', 'ผู้ตรวจคุณภาพครีเอทีฟ', 1,
   'ให้ scorecard และบังคับ factual/identity gates ก่อนอนุมัติ',
   '.agents/skills/recruitment-content-director/references/review-scorecard.md',
   '["campaign","caption","poster","factual_validation"]',
   '["score dimensions","apply hard gates","return blockers"]',
   '{"overall_score":"number","hard_gate_passed":"boolean","dimensions":"object","blockers":"array"}',
   '["minimum score 70","factual and poster gates are mandatory"]')
ON CONFLICT (agent_key) DO UPDATE SET
  display_name=EXCLUDED.display_name,
  version=EXCLUDED.version,
  responsibility=EXCLUDED.responsibility,
  playbook_path=EXCLUDED.playbook_path,
  reads=EXCLUDED.reads,
  steps=EXCLUDED.steps,
  output_schema=EXCLUDED.output_schema,
  hard_rules=EXCLUDED.hard_rules,
  updated_at=now();
