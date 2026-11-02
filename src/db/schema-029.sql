-- ============================================================
--  Migration 029 — บัญชีค้นหาผู้สมัครแยกธุรกิจ (2 พ.ย. 2569)
--  connectors.department : รหัสธุรกิจ LBD / LBA / LM / DS / SN (ชุดเดียวกับ
--  jarvis_rm.users.department_code) ให้รายงานนับการใช้งานต่อแผนกได้
--  NULL = ไม่ระบุธุรกิจ · บัญชี Facebook ใช้ so_autopost_apiscraper.users.department
--  (เพิ่มแบบ runtime ในเว็บเหมือนคอลัมน์ daily_cap / skip_warmup)
--  Non-destructive + idempotent.
-- ============================================================
SET search_path TO "so-candidate-data";

ALTER TABLE connectors ADD COLUMN IF NOT EXISTS department text;
