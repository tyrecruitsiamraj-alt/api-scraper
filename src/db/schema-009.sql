-- ============================================================
--  Migration 009 — Content Orchestrator เฟส 4 (engagement + feedback loop)
--  เชื่อมโพสต์ที่ส่งเข้า autopost กลับมาที่ campaign_posts เพื่อวัดผล แล้ววน
--  regen (คนสนใจน้อย) / บันทึกแนวที่เวิร์ค (คนสนใจเยอะ).
--  Non-destructive + idempotent.
-- ============================================================
SET search_path TO "so-candidate-data";

-- ตัวชี้ job ฝั่ง autopost (so_autopost_jobs.jobs.id) ที่สร้างตอนอนุมัติ —
-- ใช้ join กลับ post_logs เพื่ออ่าน engagement (comment_count / phones / post_link).
ALTER TABLE campaign_posts ADD COLUMN IF NOT EXISTS job_ref text;
CREATE INDEX IF NOT EXISTS idx_cposts_jobref ON campaign_posts(job_ref);

-- คะแนน engagement ที่คำนวณตอนวัดผล (comments + leads*น้ำหนัก) — ไว้จัดอันดับ/ดูย้อนหลัง
ALTER TABLE campaign_posts ADD COLUMN IF NOT EXISTS engagement_score numeric;

-- แนวที่เวิร์ค: อ้างอิง campaign ต้นทาง + คะแนน ณ ตอนบันทึก (กันบันทึกซ้ำต่อ content)
ALTER TABLE content_winning_patterns ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE content_winning_patterns ADD COLUMN IF NOT EXISTS engagement_score numeric;
CREATE UNIQUE INDEX IF NOT EXISTS uq_winpat_content ON content_winning_patterns(sample_content_id)
  WHERE sample_content_id IS NOT NULL;
