-- schema-015: provenance ของการคิดร่างแต่ละเวอร์ชัน — "AI ใช้อะไรคิด" จริงต่อ content
-- เก็บ research angles/hooks/imageStyle + A/B style + จำนวนตัวอย่าง winning/losing ที่ใช้
ALTER TABLE campaign_contents ADD COLUMN IF NOT EXISTS gen_notes jsonb;
