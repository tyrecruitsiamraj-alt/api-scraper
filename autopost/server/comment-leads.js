/**
 * ผู้สนใจจากคอมเมนต์ใต้โพสต์รับสมัครงาน (1 แถว = 1 คอมเมนต์)
 *
 * ตัวเก็บคอมเมนต์เขียนแถวที่นี่ → ตอบตามแม่แบบให้อัตโนมัติเฉพาะคอมเมนต์ที่ตอบได้แน่
 * (ฝากเบอร์ / แค่บอกว่าสนใจ) ส่วนคำถามหรือข้อความแปลก ๆ ทำเครื่องหมาย needs_human
 * ให้คนตอบจากหน้าเว็บ แล้วรอบเก็บถัดไปจะโพสต์คำตอบนั้นให้
 *
 * ไฟล์นี้ไม่ require pg — db ต้องมี query(sql, params) แบบ server/db.js
 */

const crypto = require('crypto');

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS comment_leads (
  id                    VARCHAR(64) PRIMARY KEY,
  comment_key           TEXT NOT NULL UNIQUE,
  post_log_id           VARCHAR(255),
  user_id               VARCHAR(255),
  job_id                VARCHAR(255),
  group_id              VARCHAR(255),
  request_no            VARCHAR(64),
  post_link             TEXT,
  comment_url           TEXT,
  commenter_name        TEXT,
  commenter_profile_url TEXT,
  comment_text          TEXT,
  phone                 VARCHAR(32),
  kind                  VARCHAR(16),
  needs_human           BOOLEAN NOT NULL DEFAULT false,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reply_text            TEXT,
  reply_source          VARCHAR(16),
  reply_requested_by    TEXT,
  reply_requested_at    TIMESTAMPTZ,
  replied_at            TIMESTAMPTZ,
  reply_error           TEXT,
  jarvis_lead_id        TEXT,
  jarvis_sent_at        TIMESTAMPTZ,
  jarvis_error          TEXT,
  ai_call_requested_at  TIMESTAMPTZ,
  ai_call_requested_by  TEXT,
  ai_call_batch_id      TEXT,
  ai_call_error         TEXT
);
CREATE INDEX IF NOT EXISTS comment_leads_post_idx ON comment_leads (post_log_id);
CREATE INDEX IF NOT EXISTS comment_leads_request_idx ON comment_leads (request_no);
`;

async function ensureCommentLeadsTable(db) {
  for (const stmt of TABLE_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}

const PHONE_RE = /(?:\+?66|0)[\s.-]?\d(?:[\s.-]?\d){7,8}/g;

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('66') && d.length === 11) d = `0${d.slice(2)}`;
  return /^0\d{8,9}$/.test(d) ? d : null;
}

function phonesIn(text) {
  return [...String(text || '').matchAll(PHONE_RE)].map((m) => normalizePhone(m[0])).filter(Boolean);
}

/** คำถาม = มีเครื่องหมายคำถาม หรือคำถามภาษาไทยที่พบบ่อยในคอมเมนต์รับสมัครงาน */
const QUESTION_RE =
  /[?？]|ไหม|มั้ย|มั๊ย|หรือเปล่า|รึเปล่า|เท่าไ[รห]|ยังไง|อย่างไร|ที่ไหน|ตรงไหน|กี่|เมื่อไ[รห]|ได้ป่าว|ได้ปะ|ได้รึ|ขอรายละเอียด|ถามหน่อย|สอบถาม/u;
/** แค่บอกว่าสนใจ — ตอบด้วยแม่แบบได้ */
const INTEREST_RE = /^(สนใจ|สนใจค่ะ|สนใจครับ|สนใจคะ|สนใจจ้า|สนใจงาน|สนใจครับผม|interested|ส่งแล้ว|ทักแล้ว|ขอ|ขอค่ะ|ขอครับ|\.|\.\.|\+1|ดัน|up)[\s!.~ๆ]*$/iu;

/**
 * @returns {'phone'|'interest'|'question'|'other'}
 */
function classifyComment(text) {
  const t = String(text || '').trim();
  if (phonesIn(t).length) return 'phone';
  if (QUESTION_RE.test(t)) return 'question';
  // ไม่มีข้อความ (สติกเกอร์/รูป หรืออ่านคอมเมนต์ไม่ออก) — ไม่ตอบเอง ให้คนดู
  if (!t) return 'other';
  if (INTEREST_RE.test(t) || (/^สนใจ/u.test(t) && t.length <= 40)) return 'interest';
  return 'other';
}

/** เบอร์และลิงก์สมัครจากแคปชั่น (บรรทัด "โทร…" / "สมัคร…https://") */
function contactFromCaption(caption) {
  const text = String(caption || '');
  const link = (text.match(/https?:\/\/\S+/) || [null])[0];
  const phoneLine = text.split(/\r?\n/).find((l) => /โทร/u.test(l) && phonesIn(l).length) || '';
  const phone = phonesIn(phoneLine)[0] || null;
  const contactName = ((phoneLine.match(/\(([^)]+)\)/) || [])[1] || '').trim() || null;
  return { link, phone, contactName };
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * ข้อความตอบตามแม่แบบ — คืน null เมื่อไม่ควรตอบเอง (คำถาม/ข้อความอื่น ให้คนตอบ)
 */
function buildAutoReply({ kind, name, caption, position }) {
  if (kind !== 'phone' && kind !== 'interest') return null;
  const who = firstName(name) ? `คุณ${firstName(name)}` : '';
  if (kind === 'phone') {
    return `ขอบคุณ${who ? ` ${who}` : ''}ค่ะ ได้รับเบอร์แล้ว เจ้าหน้าที่จะติดต่อกลับเร็ว ๆ นี้ค่ะ`;
  }
  const { link, phone, contactName } = contactFromCaption(caption);
  const lines = [`สวัสดีค่ะ${who ? ` ${who}` : ''} ขอบคุณที่สนใจ${position ? `ตำแหน่ง${position}` : 'งานนี้'}ค่ะ`];
  if (link) lines.push(`สมัครได้ที่ ${link}`);
  if (phone) lines.push(`${link ? 'หรือ' : ''}โทร ${phone}${contactName ? ` (${contactName})` : ''}`);
  lines.push('หรือฝากเบอร์ไว้ในคอมเมนต์ เจ้าหน้าที่จะโทรกลับค่ะ');
  return lines.join('\n');
}

/** jv-lbm6903001-r2 → LBM6903001 */
function requestNoFromJobId(jobId) {
  const m = /^jv-(.+?)(?:-r\d+)?$/i.exec(String(jobId || ''));
  return m ? m[1].toUpperCase() : null;
}

function commentKey(c, postLink) {
  if (c.commentUrl) {
    const id = (String(c.commentUrl).match(/comment_id=(\d+)/) || [])[1];
    if (id) return `fb:${id}`;
  }
  return `h:${crypto.createHash('sha1').update(`${postLink}|${c.name}|${c.text}`).digest('hex')}`;
}

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

/**
 * บันทึกคอมเมนต์ของโพสต์หนึ่ง (ซ้ำ = อัปเดต last_seen_at) แล้วคืนแถวทั้งหมดของโพสต์นั้น
 * @param {{ query: Function }} db
 * @param {{ post_log_id: string, post_link: string, job_id?: string, group_id?: string, user_id?: string, caption?: string, position?: string }} post
 * @param {Array<{ name: string, text: string, commentUrl?: string|null, profileUrl?: string|null }>} comments
 */
async function saveComments(db, post, comments) {
  const requestNo = requestNoFromJobId(post.job_id);
  for (const c of comments) {
    const kind = classifyComment(c.text);
    const reply = buildAutoReply({ kind, name: c.name, caption: post.caption, position: post.position });
    await db.query(
      `INSERT INTO comment_leads (id, comment_key, post_log_id, user_id, job_id, group_id, request_no, post_link,
          comment_url, commenter_name, commenter_profile_url, comment_text, phone, kind, needs_human, reply_text, reply_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (comment_key) DO UPDATE SET last_seen_at = now()`,
      [
        newId(), commentKey(c, post.post_link), post.post_log_id || null, post.user_id || null, post.job_id || null,
        post.group_id || null, requestNo, post.post_link, c.commentUrl || null, String(c.name || '').slice(0, 200),
        c.profileUrl || null, String(c.text || '').slice(0, 2000), phonesIn(c.text)[0] || null, kind,
        reply === null, reply, reply === null ? null : 'auto',
      ]
    );
  }
  const { rows } = await db.query(
    `SELECT * FROM comment_leads WHERE post_link = $1 ORDER BY first_seen_at`,
    [post.post_link]
  );
  return rows;
}

/** คอมเมนต์ของโพสต์นี้ที่มีข้อความตอบรอโพสต์ (อัตโนมัติหรือคนพิมพ์ไว้) */
function pendingReplies(rows) {
  return rows.filter((r) => r.reply_text && !r.replied_at && !r.reply_error);
}

async function markReplied(db, id, error) {
  await db.query(
    error
      ? `UPDATE comment_leads SET reply_error = $2 WHERE id = $1`
      : `UPDATE comment_leads SET replied_at = now(), reply_error = NULL WHERE id = $1`,
    error ? [id, String(error).slice(0, 300)] : [id]
  );
}

module.exports = {
  ensureCommentLeadsTable,
  classifyComment,
  contactFromCaption,
  buildAutoReply,
  requestNoFromJobId,
  commentKey,
  phonesIn,
  saveComments,
  pendingReplies,
  markReplied,
};
