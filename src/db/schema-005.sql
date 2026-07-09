-- ============================================================
--  Migration 005 — contacts link-layer (merge phase 3)
--  Non-destructive: read-only view only. Unifies scraped resumes (candidates) and
--  Facebook leads (phones harvested from post comments) keyed by normalized phone,
--  WITHOUT moving data. Each module keeps its own raw tables (fail-isolated).
--  Guarded: the FB-lead branch is included only if the autopost schema exists.
-- ============================================================
SET search_path TO "so-candidate-data";

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'so_autopost_jobs' AND table_name = 'post_logs'
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW "so-candidate-data".v_contacts AS
        -- scraped resumes
        SELECT c.phone_norm AS phone,
               NULLIF(c.email_norm, '') AS email,
               NULLIF(btrim(concat_ws(' ', c.prefix, c.first_name, c.last_name)), '') AS name,
               'scrape'::text AS source,
               'candidate:' || c.id::text AS ref
          FROM "so-candidate-data".candidates c
         WHERE c.phone_norm IS NOT NULL AND c.phone_norm <> ''
        UNION ALL
        -- Facebook leads: each phone found in a post's collected comments. customer_phone
        -- may hold several phones in any delimiter, so extract every 0XXXXXXXX(X) token.
        SELECT m.arr[1] AS phone,
               NULL::text AS email,
               NULLIF(pl.group_name, '') AS name,
               'fb_lead'::text AS source,
               'post_log:' || pl.id::text AS ref
          FROM "so_autopost_jobs".post_logs pl
          CROSS JOIN LATERAL regexp_matches(pl.customer_phone, '0[0-9]{8,9}', 'g') AS m(arr)
         WHERE pl.customer_phone IS NOT NULL AND pl.customer_phone <> ''
    $v$;
  ELSE
    EXECUTE $v$
      CREATE OR REPLACE VIEW "so-candidate-data".v_contacts AS
        SELECT c.phone_norm AS phone,
               NULLIF(c.email_norm, '') AS email,
               NULLIF(btrim(concat_ws(' ', c.prefix, c.first_name, c.last_name)), '') AS name,
               'scrape'::text AS source,
               'candidate:' || c.id::text AS ref
          FROM "so-candidate-data".candidates c
         WHERE c.phone_norm IS NOT NULL AND c.phone_norm <> ''
    $v$;
  END IF;
END
$mig$;
