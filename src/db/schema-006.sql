-- ============================================================
--  Migration 006 — unified connector view v2 (console: one Connector page)
--  รวมบัญชีทุก platform ไว้ที่เดียว: scraper connectors + Facebook (autopost users)
--  พร้อมสุขภาพบัญชี FB (paused_until / pause_reason / โพสต์วันนี้) เพื่อดูผลของ
--  ระบบกัน block (cap/circuit breaker) ในคอนโซล.
--  Non-destructive: แค่ DROP+CREATE VIEW (ไม่มีใครพึ่ง v_connectors). Idempotent.
--  Guard: สาขา facebook รวมเฉพาะถ้า schema/ตาราง + คอลัมน์ควบคุมโพสต์มีจริง
--  (ถ้ายังไม่เคยรัน autopost server จะได้เฉพาะ scraper — ไม่พัง).
-- ============================================================
SET search_path TO "so-candidate-data";

DROP VIEW IF EXISTS "so-candidate-data".v_connectors;

DO $mig$
DECLARE
  has_fb_users boolean;
  has_post_control boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'so_autopost_jobs' AND table_name = 'users'
  ) INTO has_fb_users;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'so_autopost_jobs' AND table_name = 'users' AND column_name = 'paused_until'
  ) INTO has_post_control;

  IF has_fb_users AND has_post_control THEN
    -- FB สาขาเต็ม: มีคอลัมน์ paused_until / pause_reason / daily_cap + นับโพสต์วันนี้
    EXECUTE $v$
      CREATE VIEW "so-candidate-data".v_connectors AS
        SELECT
          c.platform || ':' || c.id::text          AS key,
          c.platform                                AS platform,
          c.label                                   AS label,
          c.username                                AS username,
          c.scrape_limit                            AS scrape_limit,
          c.daily_cap                               AS daily_cap,
          c.enabled                                 AS enabled,
          c.cooldown_until                          AS cooldown_until,
          c.last_login_at                           AS last_login_at,
          c.created_at                              AS created_at,
          NULL::timestamptz                         AS paused_until,
          NULL::text                                AS pause_reason,
          NULL::integer                             AS used_today
        FROM "so-candidate-data".connectors c
        UNION ALL
        SELECT
          'facebook:' || u.id::text                 AS key,
          'facebook'                                AS platform,
          COALESCE(NULLIF(TRIM(u.name), ''), u.id)  AS label,
          u.email                                   AS username,
          NULL::integer                             AS scrape_limit,
          COALESCE(u.daily_cap, 15)                 AS daily_cap,
          true                                      AS enabled,
          NULL::timestamptz                         AS cooldown_until,
          NULL::timestamptz                         AS last_login_at,
          u.created_at                              AS created_at,
          u.paused_until                            AS paused_until,
          u.pause_reason                            AS pause_reason,
          (
            SELECT count(*)::int
            FROM "so_autopost_jobs".post_logs pl
            WHERE pl.user_id = u.id
              AND (pl.created_at AT TIME ZONE 'Asia/Bangkok')::date
                  = (now() AT TIME ZONE 'Asia/Bangkok')::date
          )                                         AS used_today
        FROM "so_autopost_jobs".users u
    $v$;

  ELSIF has_fb_users THEN
    -- FB สาขาแบบ minimal: ตาราง users มี แต่ยังไม่มีคอลัมน์ควบคุมโพสต์ (ยังไม่รัน autopost ใหม่)
    EXECUTE $v$
      CREATE VIEW "so-candidate-data".v_connectors AS
        SELECT
          c.platform || ':' || c.id::text          AS key,
          c.platform, c.label, c.username, c.scrape_limit, c.daily_cap,
          c.enabled, c.cooldown_until, c.last_login_at, c.created_at,
          NULL::timestamptz AS paused_until, NULL::text AS pause_reason, NULL::integer AS used_today
        FROM "so-candidate-data".connectors c
        UNION ALL
        SELECT
          'facebook:' || u.id::text,
          'facebook', COALESCE(NULLIF(TRIM(u.name), ''), u.id), u.email,
          NULL::integer, 15, true, NULL::timestamptz, NULL::timestamptz, u.created_at,
          NULL::timestamptz, NULL::text, NULL::integer
        FROM "so_autopost_jobs".users u
    $v$;

  ELSE
    -- ไม่มี autopost schema: เฉพาะ scraper connectors (คอลัมน์ชุดเดียวกันเพื่อ interface คงที่)
    EXECUTE $v$
      CREATE VIEW "so-candidate-data".v_connectors AS
        SELECT
          c.platform || ':' || c.id::text          AS key,
          c.platform, c.label, c.username, c.scrape_limit, c.daily_cap,
          c.enabled, c.cooldown_until, c.last_login_at, c.created_at,
          NULL::timestamptz AS paused_until, NULL::text AS pause_reason, NULL::integer AS used_today
        FROM "so-candidate-data".connectors c
    $v$;
  END IF;
END
$mig$;
