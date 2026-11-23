-- 032: ผู้สมัครที่ซ่อนชื่อบนเว็บหางาน (JobThai "เจ้าของเรซูเม่ปิดข้อมูลนี้") — Jarvis ขึ้น "ผู้สมัครซ่อนชื่อ" แทน "ไม่มีชื่อ" (23 พ.ย. 2569)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS name_hidden boolean NOT NULL DEFAULT false;
