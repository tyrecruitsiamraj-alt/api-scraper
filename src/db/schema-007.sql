-- ============================================================
--  Migration 007 — adjacent-position expansion
--  เมื่อ scrape ตำแหน่งหนึ่งได้ไม่ครบ target ระบบจะขยายไปค้นหาตำแหน่ง
--  ใกล้เคียงใน Job Family เดียวกันอัตโนมัติ (AI จัดกลุ่ม + เสนอตำแหน่ง).
--  - scrape_tasks.expand_adjacent : เปิด/ปิด feature ต่อ task
--  - scrape_tasks.adjacent_plan   : ผล AI (family, tiers, green ที่ใช้แล้ว, 🟡🔴 ที่เสนอ)
--  - job_family_cache             : cache ผล AI ต่อ (position, platform) กันเรียกซ้ำ
--  Non-destructive + idempotent (ADD COLUMN / CREATE TABLE IF NOT EXISTS).
-- ============================================================
SET search_path TO "so-candidate-data";

ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS expand_adjacent boolean NOT NULL DEFAULT true;
ALTER TABLE scrape_tasks ADD COLUMN IF NOT EXISTS adjacent_plan   jsonb;

CREATE TABLE IF NOT EXISTS job_family_cache (
  position_norm text        NOT NULL,
  platform      text        NOT NULL DEFAULT '',
  plan          jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (position_norm, platform)
);
