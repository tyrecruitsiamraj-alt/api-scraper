-- schema-027: persist scrape operational failure lessons (no PII)
SET search_path TO "so-candidate-data";

CREATE TABLE IF NOT EXISTS scrape_failure_lessons (
  lesson_key text PRIMARY KEY,
  category text NOT NULL DEFAULT 'unknown',
  lesson text NOT NULL DEFAULT '',
  prevention text NOT NULL DEFAULT '',
  last_error_signature text NOT NULL DEFAULT '',
  last_task_id uuid,
  last_run_id uuid,
  last_platform text NOT NULL DEFAULT '',
  occurrence_count integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_failure_lessons_updated
  ON scrape_failure_lessons(updated_at DESC);

INSERT INTO scrape_failure_lessons (lesson_key, category, lesson, prevention, occurrence_count)
VALUES
  ('jobbkk_employer_login', 'login', 'JobBKK หน้า login นายจ้างเป็น Ant Design ปุ่มเข้าสู่ระบบอยู่นอกฟอร์ม', 'กดปุ่มเข้าสู่ระบบของนายจ้าง (#username/#password) ห้ามกด Enter อย่างเดียวหรือปุ่มผู้สมัคร', 0),
  ('jobbkk_readonly_placeholder_click', 'jobbkk_ui', 'ช่องตำแหน่ง JobBKK เป็น div readOnly มี placeholder ไม่ใช่ input', 'คลิกเฉพาะ input ที่พิมพ์ได้ใน Ant Select ห้ามคลิก wrapper ที่ readonly', 0),
  ('jobthai_latest_sort', 'jobthai_ui', 'JobThai บางหน้าไม่มี #mainsort แต่ยังมี Resume card', 'ขอ sort เริ่มต้นของ JobThai แล้วดึง card ต่อ ห้าม abort ทั้งงานเพราะไม่เจอกล่องเรียง', 0),
  ('connector_daily_cap', 'quota', 'โควต้า Connector รายวันเต็ม ทำให้งานขึ้นแดงทั้งที่ไม่เกี่ยวกับคำค้น', 'ตรวจ cap ก่อนเริ่มค้น ถ้าเต็มให้จบแบบโควต้า ไม่ไล่คลิกฟอร์มต่อ', 0),
  ('jobbkk_filter_not_applied', 'jobbkk_ui', 'ชื่อตำแหน่งยาว/ไม่ตรงชิป ทำให้ไม่ยืนยันตัวกรองแล้วงานแดง', 'ย่อเนื้องานเป็นชิปสั้นในสายงานเดียวกันก่อนกรอก Normal Search', 0),
  ('login_timeout', 'login', 'เข้าสู่ระบบไม่เสร็จภายในเวลา ทำให้ทั้งงานขึ้นแดง', 'จำกัดเวลา login แล้วปิดเบราว์เซอร์ ค่อยให้คิวเริ่มใหม่ ห้ามปล่อยงานค้างกำลังทำงาน', 0),
  ('session_relogin_exhausted', 'login', 'session หลุดซ้ำจนครบโควต้า relogin แล้วยังเปิด Resume ไม่ได้', 'ปิดเบราว์เซอร์แล้ว login ใหม่แบบ takeover ห้ามดึง Resume ต่อบน session ที่หลุด', 0),
  ('captcha_or_checkpoint', 'login', 'เจอ CAPTCHA/หน้ายืนยันตัวตน แล้วงานแดงถ้าเดาคลิกต่อ', 'หยุดบัญชีนั้นทันที ห้ามเดาคลิก แจ้งคนตรวจบัญชีแล้วเริ่มใหม่', 0),
  ('local_filter_wipeout', 'yield', 'เว็บมี Resume แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไขในระบบ', 'ค้นบนเว็บด้วยตำแหน่ง/คำค้นอย่างเดียว กรองอายุวุฒิเพศเงินเดือนในระบบ แล้วขยายคำในสายงานเดียวกันถ้าผ่าน 0', 0),
  ('zero_qualified_yield', 'yield', 'เปิด Resume แล้วผ่านเกณฑ์ 0 คน ทำให้การ์ดแดง/ยังไม่ครบเป้า', 'ห้ามวนคำค้นเดิมที่เปิดมากแล้วผ่าน 0 ให้ขยายตำแหน่ง 🟢 ใน Job Family เดียวกัน', 0)
ON CONFLICT (lesson_key) DO UPDATE SET
  category = EXCLUDED.category,
  lesson = EXCLUDED.lesson,
  prevention = EXCLUDED.prevention;
