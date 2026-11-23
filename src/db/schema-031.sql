-- 031: ลบบัญชีค้นหาผู้สมัคร ห้ามลากงาน Scrap กับประวัติการค้นไปด้วย (23 พ.ย. 2569)
-- เดิม ON DELETE CASCADE: กดลบบัญชี jobthai (LBA) กับ JobBKK-HR1 แล้วงาน 39 ใบ + รายชื่อที่ผูก + ประวัติการค้น JobBKK หายทั้งหมด
-- ปุ่ม "ลบ" ตอนนี้แค่ปิดและซ่อนบัญชี (deleted_at) · ฐานกันทางอื่นที่อาจลบแถวจริง
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE scrape_tasks DROP CONSTRAINT IF EXISTS scrape_tasks_connector_id_fkey;
ALTER TABLE scrape_tasks ADD CONSTRAINT scrape_tasks_connector_id_fkey
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE RESTRICT;

ALTER TABLE scrape_runs DROP CONSTRAINT IF EXISTS scrape_runs_connector_id_fkey;
ALTER TABLE scrape_runs ADD CONSTRAINT scrape_runs_connector_id_fkey
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE RESTRICT;
