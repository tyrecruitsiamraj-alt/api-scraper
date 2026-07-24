-- schema-017: แหล่งสำรวจเทรนด์ (กลุ่ม FB) + ทำให้ content_trends รองรับ "เทรนด์ที่ระบบค้นเจอเอง"
-- ระบบสำรวจกลุ่ม → เสนอเทรนด์ (source='discovered', active=false รอคนกดอนุมัติ) แทนให้คนพิมพ์เอง

-- กลุ่ม FB ที่ใช้เป็นแหล่งสำรวจเทรนด์ (แยกจาก autopost.groups ที่ใช้โพสต์)
CREATE TABLE IF NOT EXISTS content_group_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_group_id  text NOT NULL UNIQUE,        -- เลขกลุ่ม หรือ slug (เช่น konkubrod)
  url          text,
  note         text,
  active       boolean NOT NULL DEFAULT true,
  last_scanned_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- content_trends: มาจากคนพิมพ์ ('manual') หรือระบบค้นเจอ ('discovered')
ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE content_trends ADD COLUMN IF NOT EXISTS discovered_at timestamptz;
-- กันเสนอซ้ำ label เดิมที่ระบบค้นเจอ
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_trends_label ON content_trends(lower(label));
