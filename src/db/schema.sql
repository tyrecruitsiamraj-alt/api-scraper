-- ============================================================
--  so-candidate-data schema  (PostgreSQL, db: ocr_service)
--  Central multi-platform candidate store with source provenance.
--  Schema name has a hyphen → always quoted: "so-candidate-data"
-- ============================================================

CREATE SCHEMA IF NOT EXISTS "so-candidate-data";
SET search_path TO "so-candidate-data";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---- connectors: 1 platform may have many (e.g. several JobBKK accounts) ----
CREATE TABLE IF NOT EXISTS connectors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform       text NOT NULL,                       -- jobbkk | jobthai | ...
  label          text NOT NULL,                        -- "JobBKK - HR1"
  username       text NOT NULL,
  password_enc   text NOT NULL,                         -- AES-256-GCM, app-key encrypted
  scrape_limit   integer NOT NULL DEFAULT 15,           -- max candidates per round
  daily_cap      integer NOT NULL DEFAULT 200,          -- safety cap per account/day
  enabled        boolean NOT NULL DEFAULT true,
  session_state  jsonb,                                 -- persisted Playwright storageState
  settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_login_at  timestamptz,
  cooldown_until timestamptz,                           -- set when soft-ban detected
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, label)
);

-- ---- scrape_runs: one row per scrape execution ----
CREATE TABLE IF NOT EXISTS scrape_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  platform     text NOT NULL,
  criteria     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'running',         -- running|success|partial|failed|cooldown
  requested    integer DEFAULT 0,
  found        integer DEFAULT 0,
  new_count    integer DEFAULT 0,
  updated_count integer DEFAULT 0,
  failed       integer DEFAULT 0,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_runs_connector ON scrape_runs(connector_id, started_at DESC);

-- ---- candidates: canonical person (deduped across platforms) ----
CREATE TABLE IF NOT EXISTS candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key       text UNIQUE NOT NULL,                -- phone:/email:/name: based
  prefix           text,
  first_name       text,
  last_name        text,
  full_name        text,
  phone            text,
  phone_norm       text,                                -- digits only, for matching
  email            text,
  email_norm       text,
  line_id          text,
  facebook         text,
  gender           text,
  age              text,
  birth_date       text,
  nationality      text,
  religion         text,
  height           text,
  weight           text,
  marital_status   text,
  military_status  text,
  vehicle          text,
  driving_license  text,
  driving_ability  text,
  address          text,
  province         text,
  intro            text,
  desired_positions text,
  desired_work_area text,
  job_type         text,
  expected_salary  text,
  available_start  text,
  education        jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_experience  jsonb NOT NULL DEFAULT '[]'::jsonb,
  hard_skills      jsonb NOT NULL DEFAULT '[]'::jsonb,
  soft_skills      jsonb NOT NULL DEFAULT '[]'::jsonb,
  language_skills  jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates(phone_norm);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email_norm);

-- ---- candidate_sources: provenance "tags" — many per candidate ----
CREATE TABLE IF NOT EXISTS candidate_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  platform      text NOT NULL,                          -- jobbkk | jobthai | ...
  connector_id  uuid REFERENCES connectors(id) ON DELETE SET NULL,
  external_id   text,                                   -- resume id on that platform
  source_url    text,
  run_id        uuid REFERENCES scrape_runs(id) ON DELETE SET NULL,
  parse_status  text,
  raw_text      text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_sources_candidate ON candidate_sources(candidate_id);
CREATE INDEX IF NOT EXISTS idx_sources_platform ON candidate_sources(platform);

-- ---- candidate_assets: profile image + attachments (variable count) ----
CREATE TABLE IF NOT EXISTS candidate_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_source_id uuid REFERENCES candidate_sources(id) ON DELETE SET NULL,
  kind               text NOT NULL,                     -- profile | attachment
  title              text,
  source_url         text,
  file_type          text,                              -- pdf|docx|jpg|png|...
  mime               text,
  byte_size          integer,
  sha256             text,
  storage_kind       text NOT NULL DEFAULT 'db',         -- db (bytea) | s3 | disk
  content            bytea,                              -- stored inline (storage_kind=db)
  storage_path       text,                              -- used when storage_kind != db
  download_status    text NOT NULL DEFAULT 'pending',
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_assets_candidate ON candidate_assets(candidate_id);
