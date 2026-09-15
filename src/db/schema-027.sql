-- schema-027: persist scrape operational failure lessons (no PII)
SET search_path TO "so-candidate-data";

CREATE INDEX IF NOT EXISTS idx_scrape_failure_lessons_updated
  ON scrape_failure_lessons(updated_at DESC);

INSERT INTO scrape_failure_lessons (lesson_key, category, lesson, prevention, occurrence_count)
VALUES
  ('jobbkk_employer_login', 'login', 'JobBKK หน้า login นายจ้างเป็น Ant Design ปุ่มเข้าสู่ระบบอยู่นอกฟอร์ม', 'กดปุ่มเข้าสู่ระบบของนายจ้าง (#username/#password) ห้ามกด Enter อย่างเดียวหรือปุ่มผู้สมัคร', 0),
  ('jobbkk_readonly_placeholder_click', 'jobbkk_ui', 'ช่องตำแหน่ง JobBKK เป็น div readOnly มี placeholder ไม่ใช่ input', 'คลิกเฉพาะ input ที่พิมพ์ได้ใน Ant Select ห้ามคลิก wrapper ที่ readonly', 0),
  ('jobthai_latest_sort', 'jobthai_ui', 'JobThai บางหน้าไม่มี #mainsort แต่ยังมี Resume card', 'ขอ sort เริ่มต้นของ JobThai แล้วดึง card ต่อ ห้าม abort ทั้งงานเพราะไม่เจอกล่องเรียง', 0)
ON CONFLICT (lesson_key) DO NOTHING;
