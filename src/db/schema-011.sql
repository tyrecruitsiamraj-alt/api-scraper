-- schema-011: Worker heartbeat — ให้เว็บเห็นว่า "เครื่อง worker ไหนยังมีชีวิต"
-- ปัญหาที่แก้: worker ตายเงียบ (เช่น โพสต์ fail 4 ครั้งติดโดยไม่มีใครรู้ 2 วัน)
-- runner pool upsert แถวของตัวเองทุก ~15 วิ; เว็บถือว่าออฟไลน์เมื่อ last_seen เก่ากว่า ~2 นาที
CREATE TABLE IF NOT EXISTS workers (
  name       text PRIMARY KEY,                     -- ชื่อเครื่อง (hostname) — นิ่ง ไม่มี pid
  kind       text NOT NULL DEFAULT 'scraper',      -- scraper | orchestrator | ...
  last_seen  timestamptz NOT NULL DEFAULT now(),
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb    -- pid, types ที่รองรับ ฯลฯ (ไว้ debug)
);
