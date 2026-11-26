-- ค่าลับของการเชื่อมระบบภายนอก (เข้ารหัสด้วย APP_ENCRYPTION_KEY) ตั้งจากหน้าเว็บได้โดยไม่ deploy
-- jarvis-leads-key = key ชื่อ so-scraping ที่ Jarvis ออกให้ ใช้ส่งคนคอมเมนต์ทิ้งเบอร์เข้า Jarvis (26 พ.ย. 2569)
-- เพิ่มอย่างเดียว · ตารางใหม่ ไม่แตะตารางเดิม
CREATE TABLE IF NOT EXISTS integration_secrets (
  name        TEXT PRIMARY KEY,
  secret_enc  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
