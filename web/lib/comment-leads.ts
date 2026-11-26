import 'server-only';
import { pool, q } from './db';
import { encryptSecret } from './crypto';
import { INTEGRATION_SECRETS_DDL, JARVIS_LEADS_SECRET } from '../../src/core/jarvis-comment-leads.js';
import {
  DEFAULT_REPLY_TEMPLATES,
  REPLY_KIND_LABELS,
  REPLY_KINDS,
  ensureReplyTemplates,
  replyValues,
} from '../../autopost/server/comment-reply-templates.js';
import { contactFromCaption } from '../../autopost/server/comment-leads.js';

// ผู้สนใจจากคอมเมนต์ (ตาราง comment_leads ที่ตัวเก็บคอมเมนต์ของ Auto-Post เขียน)
const AP_SCHEMA = process.env.AUTOPOST_SCHEMA || 'so_autopost_apiscraper';
if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(AP_SCHEMA)) throw new Error(`AUTOPOST_SCHEMA ไม่ถูกต้อง: ${AP_SCHEMA}`);
const AP = `"${AP_SCHEMA}"`;

export type CommentLead = {
  id: string;
  request_no: string | null;
  job_title: string | null;
  group_name: string | null;
  post_link: string | null;
  comment_url: string | null;
  commenter_name: string | null;
  commenter_profile_url: string | null;
  comment_text: string | null;
  phone: string | null;
  kind: 'phone' | 'interest' | 'question' | 'other' | null;
  needs_human: boolean;
  first_seen_at: string;
  reply_text: string | null;
  reply_source: string | null;
  replied_at: string | null;
  reply_error: string | null;
  jarvis_sent_at: string | null;
  jarvis_error: string | null;
  ai_call_requested_at: string | null;
  ai_call_requested_by: string | null;
  ai_call_batch_id: string | null;
  ai_call_error: string | null;
};

export type JarvisLeadsStatus = {
  /** ตั้ง key แล้ว (เครื่อง RM009 ส่งทุก 5 นาที) */
  configured: boolean;
  keyUpdatedAt: string | null;
  keyUpdatedBy: string | null;
  /** คนฝากเบอร์: ส่งเข้า Jarvis แล้ว · รอส่ง · Jarvis ไม่รับ */
  sent: number;
  waiting: number;
  rejected: number;
  lastSentAt: string | null;
};

/** สถานะการส่งคนฝากเบอร์เข้า Jarvis — นับจากฐานตรง ๆ ทุกครั้ง */
export async function jarvisLeadsStatus(): Promise<JarvisLeadsStatus> {
  let key: { updated_at: string; updated_by: string | null } | undefined;
  try {
    [key] = await q<{ updated_at: string; updated_by: string | null }>(
      `SELECT updated_at, updated_by FROM integration_secrets WHERE name = $1`,
      [JARVIS_LEADS_SECRET],
    );
  } catch {
    key = undefined; // ตารางยังไม่ถูกสร้าง = ยังไม่เคยตั้ง key
  }
  let counts = { sent: 0, waiting: 0, rejected: 0, last_sent_at: null as string | null };
  try {
    const [c] = await q<{ sent: number; waiting: number; rejected: number; last_sent_at: string | null }>(
      `SELECT count(*) FILTER (WHERE jarvis_sent_at IS NOT NULL)::int AS sent,
              count(*) FILTER (WHERE jarvis_sent_at IS NULL AND jarvis_error IS NULL)::int AS waiting,
              count(*) FILTER (WHERE jarvis_sent_at IS NULL AND jarvis_error IS NOT NULL)::int AS rejected,
              max(jarvis_sent_at) AS last_sent_at
         FROM ${AP}.comment_leads WHERE phone IS NOT NULL`,
    );
    if (c) counts = c;
  } catch {
    // ตาราง comment_leads ยังไม่ถูกสร้าง
  }
  return {
    configured: Boolean(key),
    keyUpdatedAt: key?.updated_at ?? null,
    keyUpdatedBy: key?.updated_by ?? null,
    sent: counts.sent,
    waiting: counts.waiting,
    rejected: counts.rejected,
    lastSentAt: counts.last_sent_at,
  };
}

/** เก็บ key ที่ออกจากหน้าตั้งค่าของ Jarvis (เข้ารหัส) · ตารางยังไม่มี = สร้างก่อน (ตารางใหม่ ไม่มีใครล็อกอยู่) */
export async function saveJarvisLeadsKey(key: string, by: string | null): Promise<void> {
  const enc = encryptSecret(key);
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '3s'`);
    await client.query(INTEGRATION_SECRETS_DDL);
    await client.query(
      `INSERT INTO integration_secrets (name, secret_enc, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (name) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JARVIS_LEADS_SECRET, enc, by],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function listCommentLeads(opts: { requestNo?: string | null; limit?: number } = {}): Promise<CommentLead[]> {
  try {
    return await q<CommentLead>(
      `SELECT c.id, c.request_no, j.title AS job_title, COALESCE(g.name, c.group_id) AS group_name,
              c.post_link, c.comment_url, c.commenter_name, c.commenter_profile_url, c.comment_text, c.phone,
              c.kind, c.needs_human, c.first_seen_at, c.reply_text, c.reply_source, c.replied_at, c.reply_error,
              c.jarvis_sent_at, c.jarvis_error, c.ai_call_requested_at, c.ai_call_requested_by, c.ai_call_batch_id, c.ai_call_error
         FROM ${AP}.comment_leads c
         LEFT JOIN ${AP}.jobs j ON j.id = c.job_id
         LEFT JOIN ${AP}.groups g ON g.fb_group_id = c.group_id
        WHERE ($1::text IS NULL OR c.request_no = $1)
        ORDER BY c.first_seen_at DESC
        LIMIT $2`,
      [opts.requestNo || null, Math.max(1, Math.min(1000, opts.limit ?? 300))],
    );
  } catch {
    // ตารางยังไม่ถูกสร้าง (ตัวเก็บคอมเมนต์ยังไม่เคยรันด้วยโค้ดใหม่)
    return [];
  }
}

/** คนพิมพ์คำตอบให้คอมเมนต์ — รอบเก็บคอมเมนต์ถัดไปจะโพสต์คำตอบนี้ใต้คอมเมนต์ */
export async function saveManualReply(id: string, text: string, by: string | null): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE ${AP}.comment_leads
        SET reply_text = $2, reply_source = 'human', reply_requested_by = $3, reply_requested_at = now(),
            reply_error = NULL, needs_human = false
      WHERE id = $1 AND replied_at IS NULL
      RETURNING id`,
    [id, text, by],
  );
  return rows.length > 0;
}

/** ไม่ต้องตอบคอมเมนต์นี้ (เช่น สแปม/ไม่เกี่ยว) */
export async function dismissCommentLead(id: string): Promise<void> {
  await q(`UPDATE ${AP}.comment_leads SET needs_human = false WHERE id = $1 AND replied_at IS NULL`, [id]);
}

/**
 * ขอให้ AI โทร — บันทึกว่ามีคนขอแล้ว เฉพาะคนที่มีเบอร์และยังไม่เคยขอ
 * เครื่อง RM009 ส่งต่อให้ Jarvis เองทุก 5 นาที หลังคนนั้นเข้า Jarvis แล้ว (src/core/jarvis-comment-leads.js)
 */
export async function requestAiCall(ids: string[], by: string | null): Promise<{ requested: number; skipped: number }> {
  if (!ids.length) return { requested: 0, skipped: 0 };
  const rows = await q<{ id: string }>(
    `UPDATE ${AP}.comment_leads
        SET ai_call_requested_at = now(), ai_call_requested_by = $2, ai_call_error = NULL
      WHERE id = ANY($1::text[]) AND phone IS NOT NULL AND ai_call_requested_at IS NULL
      RETURNING id`,
    [ids, by],
  );
  return { requested: rows.length, skipped: ids.length - rows.length };
}

// ── ข้อความที่บอทตอบเอง (ทีมแก้ได้) — นิยามข้อความตั้งต้น/คำแทนอยู่ที่ autopost/server/comment-reply-templates.js ที่เดียว

const TEMPLATES_TABLE = `${AP}.comment_reply_templates`;

export type ReplyKind = 'phone' | 'interest';

export type ReplyTemplateView = {
  kind: ReplyKind;
  label: string;
  body: string;
  updated_by: string | null;
  updated_at: string | null;
  /** ค่าคำแทนจากคอมเมนต์จริงล่าสุดของแบบนี้ ใช้ทำตัวอย่างบนจอ */
  sample: { comment: string | null; values: Record<string, string> };
};

/** อ่านอย่างเดียว — ตารางยังไม่มี (ยังไม่เคยมีใครแก้ และตัวเก็บคอมเมนต์ยังไม่ได้อัปเดต) = ข้อความตั้งต้น */
export async function listReplyTemplates(): Promise<ReplyTemplateView[]> {
  let saved: { kind: string; body: string; updated_by: string | null; updated_at: string | null }[] = [];
  try {
    saved = await q(`SELECT kind, body, updated_by, updated_at FROM ${TEMPLATES_TABLE}`);
  } catch {
    saved = [];
  }
  const out: ReplyTemplateView[] = [];
  for (const kind of REPLY_KINDS as ReplyKind[]) {
    const row = saved.find((r) => r.kind === kind);
    let sample: ReplyTemplateView['sample'] = { comment: null, values: replyValues({ name: 'สมชาย ใจดี', position: 'พนักงานขับรถ' }) };
    try {
      const [latest] = await q<{ commenter_name: string | null; comment_text: string | null; caption: string | null; title: string | null }>(
        `SELECT c.commenter_name, c.comment_text, j.caption, j.title
           FROM ${AP}.comment_leads c LEFT JOIN ${AP}.jobs j ON j.id = c.job_id
          WHERE c.kind = $1 ORDER BY c.first_seen_at DESC LIMIT 1`,
        [kind],
      );
      if (latest) {
        const { link, phone, contactName } = contactFromCaption(latest.caption);
        sample = {
          comment: latest.comment_text,
          values: replyValues({
            name: latest.commenter_name,
            position: String(latest.title || '').split(' · ')[0],
            link,
            phone,
            contactName,
          }),
        };
      }
    } catch {
      /* ยังไม่มีคอมเมนต์ = ใช้ชื่อสมมุติ */
    }
    out.push({
      kind,
      label: (REPLY_KIND_LABELS as Record<string, string>)[kind],
      body: row ? row.body : (DEFAULT_REPLY_TEMPLATES as Record<string, string>)[kind],
      updated_by: row?.updated_by ?? null,
      updated_at: row?.updated_at ?? null,
      sample,
    });
  }
  return out;
}

export async function saveReplyTemplate(kind: ReplyKind, body: string, by: string | null): Promise<void> {
  await ensureReplyTemplates({ query: async (sql: string, params?: unknown[]) => ({ rows: await q(sql, params) }) }, TEMPLATES_TABLE);
  await q(
    `INSERT INTO ${TEMPLATES_TABLE} (kind, body, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (kind) DO UPDATE SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [kind, body, by],
  );
}
