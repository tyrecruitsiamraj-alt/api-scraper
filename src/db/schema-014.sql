-- schema-014: แนว content ที่ "ไม่เวิร์ค" (คนสนใจน้อย) — คู่ขนานกับ content_winning_patterns
-- measure บันทึกตอน campaign ได้คะแนนต่ำทั้งหมด → draft ดึงมาเป็นตัวอย่าง "ห้ามทำแนวนี้ซ้ำ"
CREATE TABLE IF NOT EXISTS content_losing_patterns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_family   text,
  platform          text NOT NULL DEFAULT 'facebook',
  caption_style     text,
  sample_content_id uuid REFERENCES campaign_contents(id) ON DELETE SET NULL,
  avg_engagement    numeric,
  engagement_score  numeric,
  campaign_id       uuid,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- กันบันทึกซ้ำต่อ content เดียว (content เดิมวัดหลายรอบ = อัปเดตคะแนนล่าสุด)
CREATE UNIQUE INDEX IF NOT EXISTS uq_losepat_content ON content_losing_patterns(sample_content_id)
  WHERE sample_content_id IS NOT NULL;
