-- ============================================================
--  Migration 008 — Recruitment Content Orchestrator
--  เมื่อใบขอกำลังคน (จาก ERP/SQL Server) หาคนไม่ได้ → คิด content ทำการตลาดสรรหา
--  → อนุมัติ → โพสต์ → วัด engagement → ปรับ content. ตารางเก็บ campaign/สถานะ/
--  content draft (มี version)/การโพสต์+engagement/แนวที่เวิร์ค.
--  Non-destructive + idempotent (CREATE TABLE / INDEX IF NOT EXISTS).
-- ============================================================
SET search_path TO "so-candidate-data";

-- staging ใบขอจาก ERP (SQL Server) — worker (PC, เครือข่ายภายใน) query แล้ว sync มาที่นี่
-- เพื่อให้เว็บ (Vercel) อ่านจาก Postgres ได้โดยไม่ต้องต่อ SQL Server ภายในตรง ๆ
CREATE TABLE IF NOT EXISTS erp_open_requests (
  request_no     text PRIMARY KEY,
  snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb,     -- แถวใบขอเต็มจาก query
  title          text,
  province       text,
  qty            integer,
  remaining_qty  integer,
  request_date   timestamptz,
  want_date_from timestamptz,
  campaign_id    uuid,                                   -- ตั้งเมื่อสร้าง campaign แล้ว (กันสร้างซ้ำ)
  synced_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_open_remaining ON erp_open_requests(remaining_qty) WHERE campaign_id IS NULL;

-- 1 campaign = 1 ใบขอที่เข้าโหมด content (คนกดสั่งต่อใบ)
CREATE TABLE IF NOT EXISTS recruit_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no       text UNIQUE,                          -- เลขใบขอจาก ERP (st_request_head.request_no)
  request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,   -- ข้อมูลใบขอ ณ ตอนดึง (site/qty/rate/…)
  title            text,                                 -- ตำแหน่ง/ชื่องานสำหรับแสดง
  positions        text,
  province         text,
  qty              integer,
  remaining_qty    integer,
  -- pipeline: new→researching→drafting→pending_approval→approved→posting→measuring→done (+low_engagement)
  status           text NOT NULL DEFAULT 'new',
  status_note      text,
  created_by       text,
  approved_by      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON recruit_campaigns(status);

-- draft content ต่อ campaign — เก็บหลาย version (regen เมื่อ engagement ต่ำ)
CREATE TABLE IF NOT EXISTS campaign_contents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  version          integer NOT NULL DEFAULT 1,
  platform         text NOT NULL DEFAULT 'facebook',
  caption          text,
  image_bytes      bytea,
  image_mime       text,
  video_brief      text,
  gen_model        text,
  status           text NOT NULL DEFAULT 'draft',        -- draft|approved|rejected|posted
  engagement_score numeric,
  reject_reason    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contents_campaign ON campaign_contents(campaign_id, version);

-- การโพสต์จริง + engagement ที่วัดได้
CREATE TABLE IF NOT EXISTS campaign_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES recruit_campaigns(id) ON DELETE CASCADE,
  content_id    uuid REFERENCES campaign_contents(id) ON DELETE SET NULL,
  platform      text NOT NULL DEFAULT 'facebook',
  account_ref   text,                                    -- บัญชีที่โพสต์ (so_autopost_jobs.users)
  post_link     text,
  posted_at     timestamptz,
  likes         integer DEFAULT 0,
  comments      integer DEFAULT 0,
  shares        integer DEFAULT 0,
  reach         integer DEFAULT 0,
  lead_count    integer DEFAULT 0,                       -- คนทัก/ให้เบอร์ (จาก collect)
  verdict       text DEFAULT 'pending',                  -- high|low|pending
  measured_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cposts_campaign ON campaign_posts(campaign_id);

-- แนว content ที่คนสนใจเยอะ (บันทึกไว้ใช้ซ้ำ)
CREATE TABLE IF NOT EXISTS content_winning_patterns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_family  text,
  platform         text NOT NULL DEFAULT 'facebook',
  caption_style    text,
  sample_content_id uuid REFERENCES campaign_contents(id) ON DELETE SET NULL,
  avg_engagement   numeric,
  created_at       timestamptz NOT NULL DEFAULT now()
);
