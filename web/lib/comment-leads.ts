import 'server-only';
import { q } from './db';
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
  ai_call_requested_at: string | null;
  ai_call_requested_by: string | null;
  ai_call_batch_id: string | null;
  ai_call_error: string | null;
};

/** ตั้งค่า JARVIS_LEADS_API_URL + JARVIS_LEADS_API_KEY เมื่อทีม Jarvis ทำ API รับ lead / AI โทรเสร็จ */
export function jarvisLeadsConfigured(): boolean {
  return Boolean(process.env.JARVIS_LEADS_API_URL && process.env.JARVIS_LEADS_API_KEY);
}

export async function listCommentLeads(opts: { requestNo?: string | null; limit?: number } = {}): Promise<CommentLead[]> {
  try {
    return await q<CommentLead>(
      `SELECT c.id, c.request_no, j.title AS job_title, COALESCE(g.name, c.group_id) AS group_name,
              c.post_link, c.comment_url, c.commenter_name, c.commenter_profile_url, c.comment_text, c.phone,
              c.kind, c.needs_human, c.first_seen_at, c.reply_text, c.reply_source, c.replied_at, c.reply_error,
              c.jarvis_sent_at, c.ai_call_requested_at, c.ai_call_requested_by, c.ai_call_batch_id, c.ai_call_error
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
 * เมื่อเชื่อม API ของ Jarvis แล้ว จะส่งต่อให้ Jarvis (ตอนนี้เก็บสถานะ "รอส่ง" ไว้)
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
