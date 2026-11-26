/**
 * ═══ คนคอมเมนต์ทิ้งเบอร์ใต้โพสต์ → Jarvis (เจ้าของ 26 พ.ย. 2569 "ทำเลย") ═══
 * Jarvis ทำเส้นรับไว้ตั้งแต่ 22 ต.ค. 2569 แต่ฝั่งเราไม่เคยส่ง คนฝากเบอร์ 18 คนไม่มีใครโทรหา
 *
 * POST {JARVIS}/api/integrations/so-scraping/leads    — ส่งทีละคอมเมนต์ (Jarvis สร้างใบสมัคร/ผูกใบเดิม กันซ้ำด้วย comment_url)
 * POST {JARVIS}/api/integrations/so-scraping/ai-call  — คนที่เจ้าหน้าที่กด "ส่ง AI โทร" บนหน้าคนคอมเมนต์
 * ยืนยันตัว: header x-api-key (key ชื่อ so-scraping ออกจากหน้าตั้งค่าของ Jarvis) · เราเก็บ key เข้ารหัสในตาราง integration_secrets
 *
 * ผลต่อแถว (comment_leads):
 * - ส่งได้ → jarvis_sent_at + jarvis_lead_id
 * - Jarvis ปฏิเสธถาวร (ใบปิด/ไม่พบใบ/ข้อมูลผิด) → jarvis_error เป็นคำไทย ไม่ส่งซ้ำ
 * - key ผิด/ยังไม่ตั้ง (401/403/503) → หยุดรอบนี้ ไม่แตะแถว (ตั้ง key แล้วส่งต่อเอง)
 * - Jarvis ล่ม/เน็ตหลุด → ไม่แตะแถว รอบถัดไปลองใหม่ (ส่งซ้ำได้ปลอดภัย Jarvis คืนแถวเดิม)
 */

export const JARVIS_LEADS_SECRET = 'jarvis-leads-key';
export const JARVIS_BASE_DEFAULT = 'https://jarvis.siamrajathanee.dev';
export const LEADS_PATH = '/api/integrations/so-scraping/leads';
export const AI_CALL_PATH = '/api/integrations/so-scraping/ai-call';

const REQUEST_NO = /^[A-Za-z]{2,4}\d{7}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** เบอร์มือถือ 10 หลัก (ตัวเดียวกับที่ Jarvis รับ: ตัด +66/66 ให้) · ไม่ใช่ = null */
export function mobilePhone10(raw) {
  if (raw === null || raw === undefined) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('66') && d.length === 11) d = `0${d.slice(2)}`;
  return /^0[689]\d{8}$/.test(d) ? d : null;
}

/**
 * แถวคอมเมนต์ → body ที่ Jarvis รับ · ส่งไม่ได้ = { error }
 * comment_url ใช้กันซ้ำฝั่ง Jarvis — คอมเมนต์ที่อ่านลิงก์ไม่ได้ ใช้ลิงก์โพสต์ + รหัสคอมเมนต์ของเรา (คงที่ทุกครั้ง)
 */
export function commentLeadPayload(row) {
  const requestNo = String(row?.request_no ?? '').trim().toUpperCase();
  if (!REQUEST_NO.test(requestNo)) return { error: 'ไม่รู้ว่าเป็นของใบขอไหน' };
  const phone = mobilePhone10(row.phone);
  if (!phone) return { error: 'เบอร์ไม่ใช่เบอร์มือถือ' };
  const http = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
  const postUrl = http(row.post_link);
  const commentUrl = http(row.comment_url) ?? (postUrl && row.comment_key ? `${postUrl}#so-comment=${encodeURIComponent(row.comment_key)}` : null);
  if (!commentUrl) return { error: 'ไม่มีลิงก์คอมเมนต์หรือลิงก์โพสต์' };
  const at = row.first_seen_at ? new Date(row.first_seen_at) : null;
  return {
    body: {
      request_no: requestNo,
      commenter_name: row.commenter_name || null,
      phone,
      comment_text: row.comment_text || null,
      comment_url: commentUrl,
      post_url: postUrl,
      group_name: row.group_name || null,
      commented_at: at && Number.isFinite(at.getTime()) ? at.toISOString() : null,
    },
  };
}

/**
 * ผลตอบของ Jarvis → ทำอะไรต่อ
 * sent: ส่งได้ · final: Jarvis ไม่รับคนนี้ (จดเหตุ ไม่ส่งซ้ำ) · stop: key/การตั้งค่าผิด หยุดทั้งรอบ · retry: ลองรอบหน้า
 */
export function classifyJarvisReply(status, body) {
  const msg = String(body?.message || body?.error || '').trim();
  if (status === 200 || status === 201) return { kind: 'sent' };
  if (status === 401 || status === 403) return { kind: 'stop', message: 'Jarvis ไม่รับ key ที่ตั้งไว้ ให้ออก key ใหม่ในหน้าตั้งค่าของ Jarvis แล้ววางใหม่' };
  if (status === 503) return { kind: 'stop', message: msg || 'Jarvis ยังไม่ได้ตั้ง key ของ So Scraping' };
  if (status === 409) return { kind: 'final', message: msg || 'ใบขอนี้ปิดแล้ว' };
  if (status === 404) return { kind: 'final', message: msg || 'Jarvis ไม่พบใบขอนี้ที่ยังเปิดอยู่' };
  if (status === 400) return { kind: 'final', message: msg || 'Jarvis บอกว่าข้อมูลไม่ครบ' };
  return { kind: 'retry', message: `Jarvis ตอบ ${status}${msg ? ` ${msg}` : ''}` };
}

async function postJson(fetchImpl, url, apiKey, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(timer);
  }
}

function schemaName(autopostSchema) {
  if (!/^[A-Za-z0-9_-]+$/.test(autopostSchema)) throw new Error(`autopost schema ไม่ถูกต้อง: ${autopostSchema}`);
  return `"${autopostSchema}"`;
}

/** คอมเมนต์ที่มีเบอร์ ยังไม่ได้ส่ง และไม่เคยถูกปฏิเสธ */
export function pendingLeadsSql(AP) {
  return `SELECT c.id, c.comment_key, c.request_no, c.post_link, c.comment_url, c.commenter_name, c.comment_text,
                 c.phone, c.first_seen_at, COALESCE(g.name, pl.group_name) AS group_name
            FROM ${AP}.comment_leads c
            LEFT JOIN ${AP}.post_logs pl ON pl.id = c.post_log_id
            LEFT JOIN ${AP}.groups g ON g.fb_group_id = c.group_id
           WHERE c.phone IS NOT NULL AND c.jarvis_sent_at IS NULL AND c.jarvis_error IS NULL
           ORDER BY c.first_seen_at
           LIMIT $1`;
}

/** คนที่เจ้าหน้าที่กด "ส่ง AI โทร" แล้ว เข้า Jarvis แล้ว แต่ยังไม่ได้ส่งเข้า AI โทร */
export function pendingAiCallsSql(AP) {
  return `SELECT c.id, c.request_no, c.jarvis_lead_id
            FROM ${AP}.comment_leads c
           WHERE c.ai_call_requested_at IS NOT NULL AND c.ai_call_batch_id IS NULL AND c.ai_call_error IS NULL
             AND c.jarvis_lead_id IS NOT NULL
           ORDER BY c.ai_call_requested_at
           LIMIT 200`;
}

/**
 * ส่งรอบหนึ่ง · rowsOf(sql, params) คืน rows · ไม่มี key = ไม่ทำอะไร
 * @returns {Promise<{ sent: number, rejected: number, aiAdded: number, aiSkipped: number, stopped: string|null, retry: string|null }>}
 */
export async function sendCommentLeadsToJarvis({ rowsOf, fetchImpl = fetch, baseUrl = JARVIS_BASE_DEFAULT, apiKey, autopostSchema, limit = 50, timeoutMs = 20_000 }) {
  const out = { sent: 0, rejected: 0, aiAdded: 0, aiSkipped: 0, stopped: null, retry: null };
  if (!apiKey) return out;
  const AP = schemaName(autopostSchema);
  const base = String(baseUrl || JARVIS_BASE_DEFAULT).replace(/\/+$/, '');

  for (const row of await rowsOf(pendingLeadsSql(AP), [limit])) {
    const p = commentLeadPayload(row);
    if (p.error) {
      await rowsOf(`UPDATE ${AP}.comment_leads SET jarvis_error = $2 WHERE id = $1 AND jarvis_sent_at IS NULL`, [row.id, p.error]);
      out.rejected += 1;
      continue;
    }
    let reply;
    try {
      reply = await postJson(fetchImpl, `${base}${LEADS_PATH}`, apiKey, p.body, timeoutMs);
    } catch (e) {
      out.retry = `ต่อ Jarvis ไม่ได้: ${e?.message ?? e}`;
      return out;
    }
    const r = classifyJarvisReply(reply.status, reply.body);
    if (r.kind === 'sent') {
      const leadId = typeof reply.body?.lead_id === 'string' && UUID.test(reply.body.lead_id) ? reply.body.lead_id : null;
      await rowsOf(
        `UPDATE ${AP}.comment_leads SET jarvis_sent_at = now(), jarvis_lead_id = $2, jarvis_error = NULL WHERE id = $1`,
        [row.id, leadId],
      );
      out.sent += 1;
    } else if (r.kind === 'final') {
      await rowsOf(`UPDATE ${AP}.comment_leads SET jarvis_error = $2 WHERE id = $1 AND jarvis_sent_at IS NULL`, [row.id, r.message.slice(0, 300)]);
      out.rejected += 1;
    } else if (r.kind === 'stop') {
      out.stopped = r.message;
      return out;
    } else {
      out.retry = r.message;
      return out;
    }
  }

  // ส่ง AI โทร: แยกตามใบขอ (Jarvis รับทีละใบ)
  const byReq = new Map();
  for (const row of await rowsOf(pendingAiCallsSql(AP))) {
    const req = String(row.request_no || '').toUpperCase();
    if (!byReq.has(req)) byReq.set(req, []);
    byReq.get(req).push(row);
  }
  for (const [requestNo, rows] of byReq) {
    let reply;
    try {
      reply = await postJson(fetchImpl, `${base}${AI_CALL_PATH}`, apiKey, { request_no: requestNo, lead_ids: rows.map((r) => r.jarvis_lead_id) }, timeoutMs);
    } catch (e) {
      out.retry = `ต่อ Jarvis ไม่ได้: ${e?.message ?? e}`;
      return out;
    }
    const r = classifyJarvisReply(reply.status, reply.body);
    if (r.kind === 'stop') {
      out.stopped = r.message;
      return out;
    }
    if (r.kind === 'retry') {
      out.retry = r.message;
      return out;
    }
    const byLead = new Map(rows.map((x) => [x.jarvis_lead_id, x.id]));
    if (r.kind === 'final') {
      for (const x of rows) await rowsOf(`UPDATE ${AP}.comment_leads SET ai_call_error = $2 WHERE id = $1`, [x.id, r.message.slice(0, 300)]);
      out.aiSkipped += rows.length;
      continue;
    }
    const batchId = String(reply.body?.batch_id || '');
    for (const a of Array.isArray(reply.body?.added) ? reply.body.added : []) {
      const id = byLead.get(a?.lead_id);
      if (!id) continue;
      await rowsOf(`UPDATE ${AP}.comment_leads SET ai_call_batch_id = $2, ai_call_error = NULL WHERE id = $1`, [id, batchId || 'sent']);
      byLead.delete(a.lead_id);
      out.aiAdded += 1;
    }
    for (const s of Array.isArray(reply.body?.skipped) ? reply.body.skipped : []) {
      const id = byLead.get(s?.lead_id);
      if (!id) continue;
      await rowsOf(`UPDATE ${AP}.comment_leads SET ai_call_error = $2 WHERE id = $1`, [id, String(s.reason || 'Jarvis ไม่ส่งเข้า AI โทร').slice(0, 300)]);
      byLead.delete(s.lead_id);
      out.aiSkipped += 1;
    }
  }
  return out;
}

/** key ที่ตั้งจากหน้าเว็บ (เข้ารหัส) · ตารางยังไม่มี/ยังไม่ตั้ง = null */
export async function loadJarvisLeadsKey(rowsOf, decrypt) {
  let rows;
  try {
    rows = await rowsOf(`SELECT secret_enc FROM "so-candidate-data".integration_secrets WHERE name = $1`, [JARVIS_LEADS_SECRET]);
  } catch (e) {
    if (e?.code === '42P01') return null;
    throw e;
  }
  const enc = rows[0]?.secret_enc;
  return enc ? decrypt(enc) : null;
}

export const INTEGRATION_SECRETS_DDL = `CREATE TABLE IF NOT EXISTS "so-candidate-data".integration_secrets (
  name        TEXT PRIMARY KEY,
  secret_enc  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
