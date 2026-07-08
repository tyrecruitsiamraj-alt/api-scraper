-- ============================================================
--  Migration 004 — unified work queue + connector view (merge phase 2, step 1)
--  Non-destructive: adds new table + view only. Does NOT touch existing tables
--  or the autopost schema. Idempotent.
-- ============================================================
SET search_path TO "so-candidate-data";

-- One queue for every job type across modules. Locking is per ACCOUNT via
-- connector_key (a string like 'jobbkk:<uuid>' / 'jobthai:<uuid>' / 'facebook:<id>')
-- so we never merge the two modules' account tables (fail-isolated).
CREATE TABLE IF NOT EXISTS work_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL,                       -- scrape | post | collect
  module           text NOT NULL,                       -- scraper | autopost
  connector_key    text NOT NULL,                       -- per-account lock key: '<platform>:<id>'
  ref_id           text,                                -- module-side row id (scrape_tasks.id / assignment / schedule)
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- criteria / assignment_ids / groups
  owner_user       text,                                -- who enqueued (for later affinity/scoping)
  preferred_worker text,                                -- pin account -> worker/container (stable FB IP)
  status           text NOT NULL DEFAULT 'queued',      -- queued | running | done | error
  worker_id        text,                                -- worker/container that claimed it
  locked_at        timestamptz,                         -- for stale-lock recovery
  priority         int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  last_error       text
);
CREATE INDEX IF NOT EXISTS idx_work_queue_claim ON work_queue (status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_work_queue_conn  ON work_queue (connector_key, status);

-- Unified account list for the console (scrape connectors + FB accounts) WITHOUT
-- moving data. Guarded: the facebook UNION branch is included only if the autopost
-- schema/table exists, so this migration never hard-depends on the other module.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'so_autopost_jobs' AND table_name = 'users'
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW "so-candidate-data".v_connectors AS
        SELECT platform || ':' || id::text AS key, platform, label,
               daily_cap, enabled, cooldown_until
          FROM "so-candidate-data".connectors
        UNION ALL
        SELECT 'facebook:' || id::text, 'facebook', COALESCE(name, id),
               15, true, NULL::timestamptz
          FROM "so_autopost_jobs".users
    $v$;
  ELSE
    EXECUTE $v$
      CREATE OR REPLACE VIEW "so-candidate-data".v_connectors AS
        SELECT platform || ':' || id::text AS key, platform, label,
               daily_cap, enabled, cooldown_until
          FROM "so-candidate-data".connectors
    $v$;
  END IF;
END
$mig$;
