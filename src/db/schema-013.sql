-- schema-013: สถิติ "ช่วงเวลาโพสต์ที่ได้ผล" — best-time-update.mjs วิเคราะห์จาก post_logs
-- ของ autopost (เวลาโพสต์ × คอมเมนต์/lead) แล้ว upsert; เว็บใช้แนะนำเวลาโพสต์
CREATE TABLE IF NOT EXISTS post_time_insights (
  dow        int NOT NULL,  -- 0=อาทิตย์ … 6=เสาร์ (ตาม EXTRACT(dow))
  hour       int NOT NULL,  -- 0-23 (เวลาไทย)
  posts      int NOT NULL DEFAULT 0,
  comments   int NOT NULL DEFAULT 0,
  leads      int NOT NULL DEFAULT 0,
  score      numeric,       -- (comments + leads*5) / posts
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dow, hour)
);
