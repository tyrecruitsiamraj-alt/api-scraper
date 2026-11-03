-- 030: เก็บว่ารอบค้นใส่ตัวกรองไหนติด/ไม่ติดบนเว็บ (JobBKK Normal Search applied/skipped + ชิปที่เห็น)
-- ใช้ไล่ว่าผลค้นที่ไม่ตรงตำแหน่งเกิดจากเว็บไม่รับตัวกรอง ไม่ใช่เกณฑ์คัดของเรา (3 พ.ย. 2569)
ALTER TABLE resume_search_attempts ADD COLUMN IF NOT EXISTS search_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
