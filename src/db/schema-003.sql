-- ============================================================
--  Migration 003 — multi-phase task progress (scrape → ocr → enrich)
--  Idempotent. Applied after schema-002.sql by migrate.js.
-- ============================================================
SET search_path TO "so-candidate-data";

-- Current phase of a running task so the UI can narrate progress.
--   idle | scraping | ocr | enrich | done | error
-- progress_got / progress_target are reused as the counter for the active phase.
ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'idle';
