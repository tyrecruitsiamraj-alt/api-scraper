-- schema-012: job_trends — เก็บ SEO/keyword trend ต่อ Job Family ให้ jd-analyzer + content-orchestrator ใช้
-- อัปเดตโดย skill seo-trend-updater (manual "รัน seo update" หรือผ่าน worker) — ไม่มี auto-cron บนเครื่อง org
CREATE TABLE IF NOT EXISTS job_trends (
  id           bigserial PRIMARY KEY,
  family       text NOT NULL,                 -- A–F (ตรงกับ job-family taxonomy)
  keyword      text NOT NULL,                 -- คำค้นตำแหน่ง (ภาษาไทย)
  volume       integer,                       -- ประมาณการ search/ความต้องการ (มาก=มาแรง)
  competition  text,                          -- low | medium | high
  note         text,                          -- insight สั้น ๆ
  source       text,                          -- ที่มา (search/manual/ฯลฯ)
  captured_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family, keyword)
);
CREATE INDEX IF NOT EXISTS job_trends_family_idx ON job_trends (family, captured_at DESC);
