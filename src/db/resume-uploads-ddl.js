/**
 * ตารางไฟล์เรซูเม่ที่อัปโหลด (เพิ่มอย่างเดียว) — เว็บสร้างตอนรับไฟล์ เครื่องอ่านไฟล์สร้างตอนเริ่มงาน ใครถึงก่อนก็ได้
 * status: queued รออ่าน · reading กำลังอ่าน · saved บันทึกคนใหม่แล้ว · review มีคนนี้แล้ว รอเลือกช่อง
 *         merged เลือกช่องแล้ว · skipped ไม่ใช้ไฟล์นี้ · failed อ่านไม่ได้ (เหตุใน error)
 */
export const RESUME_UPLOADS_DDL = `
CREATE TABLE IF NOT EXISTS resume_uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid NOT NULL,
  uploaded_by      text,
  uploaded_by_name text,
  file_name        text NOT NULL,
  mime             text,
  byte_size        integer,
  sha256           text,
  content          bytea,
  task_id          uuid REFERENCES scrape_tasks(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'queued',
  error            text,
  candidate_id     uuid REFERENCES candidates(id) ON DELETE SET NULL,
  parsed           jsonb,
  raw_text         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_resume_uploads_batch ON resume_uploads (batch_id, created_at);
`;
