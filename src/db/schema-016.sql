-- schema-016: "เทรนด์ที่กำลังมา" — คนกรอกเทรนด์/มีมที่อยากให้คอนเทนต์เกาะ (เช่น ไอติมอัลตร้าสมูท)
-- worker ดึงตัวที่ active ไปใส่ตอนคิดแคปชัน/รูป เพื่อตามเทรนด์ให้ทัน (ไม่ต้อง scrape)
CREATE TABLE IF NOT EXISTS content_trends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,                 -- ชื่อเทรนด์
  note         text,                          -- วิธีเกาะ/บริบท (optional)
  for_caption  boolean NOT NULL DEFAULT true, -- เอาไปใช้กับแคปชัน
  for_image    boolean NOT NULL DEFAULT true, -- เอาไปใช้กับรูป
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_trends_active ON content_trends(active) WHERE active;
