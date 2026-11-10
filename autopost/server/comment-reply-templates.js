/**
 * ข้อความที่บอทตอบใต้คอมเมนต์เอง — ทีมแก้ได้จากหน้า Autopost → คนคอมเมนต์ (เจ้าของสั่ง 10 พ.ย. 2569)
 * เดิมเขียนตายตัวในโค้ด (8a9f43a, 22 ต.ค. 2569) · ที่นี่ที่เดียวที่นิยามข้อความตั้งต้น คำแทน และวิธีเติมคำ
 * ใช้ทั้งตัวเก็บคอมเมนต์ (เขียนคำตอบ) และหน้าเว็บ (แก้ + ดูตัวอย่าง) — ไฟล์นี้ไม่ require อะไร ให้หน้าเว็บฝั่ง browser ใช้ได้
 */

/** คอมเมนต์ 2 แบบที่บอทตอบเอง · แบบอื่น (คำถาม / ข้อความอื่น) ส่งให้คนตอบเสมอ */
const REPLY_KINDS = ['phone', 'interest'];

const REPLY_KIND_LABELS = {
  phone: 'คนฝากเบอร์ไว้',
  interest: 'คนบอกว่าสนใจ',
};

/** ข้อความตั้งต้น = ข้อความเดิมที่บอทใช้ตั้งแต่ 22 ต.ค. 2569 */
const DEFAULT_REPLY_TEMPLATES = {
  phone: 'ขอบคุณ {ชื่อ}ค่ะ ได้รับเบอร์แล้ว เจ้าหน้าที่จะติดต่อกลับเร็ว ๆ นี้ค่ะ',
  interest: [
    'สวัสดีค่ะ {ชื่อ} ขอบคุณที่สนใจ{ตำแหน่ง}ค่ะ',
    'สมัครได้ที่ {ลิงก์สมัคร}',
    'โทร {เบอร์} ({ผู้ติดต่อ})',
    'หรือฝากเบอร์ไว้ในคอมเมนต์ เจ้าหน้าที่จะโทรกลับค่ะ',
  ].join('\n'),
};

/** คำแทนที่ใช้ได้ + ความหมายบนจอ */
const REPLY_PLACEHOLDERS = [
  { key: 'ชื่อ', hint: 'คุณ + ชื่อแรกของคนคอมเมนต์ (อ่านชื่อไม่ได้ = ตัดออก)' },
  { key: 'ตำแหน่ง', hint: 'ตำแหน่ง + ชื่อตำแหน่งงาน (ไม่มี = งานนี้)' },
  { key: 'ลิงก์สมัคร', hint: 'ลิงก์สมัครในโพสต์ (ไม่มี = ตัดบรรทัดนี้)' },
  { key: 'เบอร์', hint: 'เบอร์ติดต่อในโพสต์ (ไม่มี = ตัดบรรทัดนี้)' },
  { key: 'ผู้ติดต่อ', hint: 'ชื่อผู้ติดต่อในโพสต์ (ไม่มี = ตัดวงเล็บนี้ หรือตัดบรรทัด)' },
];

const MAX_REPLY_LENGTH = 1000;

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * ค่าของคำแทนจากข้อมูลคอมเมนต์ + โพสต์
 * @param {{ name?: string|null, position?: string|null, link?: string|null, phone?: string|null, contactName?: string|null }} p
 * @returns {Record<string, string>}
 */
function replyValues({ name, position, link, phone, contactName }) {
  const first = firstName(name);
  return {
    ชื่อ: first ? `คุณ${first}` : '',
    ตำแหน่ง: position ? `ตำแหน่ง${position}` : 'งานนี้',
    ลิงก์สมัคร: link || '',
    เบอร์: phone || '',
    ผู้ติดต่อ: contactName || '',
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * เติมคำแทนลงข้อความ — ข้อความว่าง = ไม่ตอบเอง (คืน null ให้คนตอบ)
 * คำแทนที่ไม่มีค่า: {ชื่อ} ตัดออกพร้อมช่องว่างหน้า · อยู่ในวงเล็บ = ตัดทั้งวงเล็บ · อื่น ๆ = ตัดทั้งบรรทัด
 */
function renderReply(template, values) {
  const body = String(template ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) return null;
  const out = [];
  for (const rawLine of body.split('\n')) {
    let line = rawLine;
    let drop = false;
    for (const { key } of REPLY_PLACEHOLDERS) {
      const token = `{${key}}`;
      if (!line.includes(token)) continue;
      const value = String(values?.[key] ?? '');
      if (value) {
        line = line.split(token).join(value);
        continue;
      }
      if (key === 'ชื่อ') {
        line = line.replace(new RegExp(` ?${escapeRe(token)}`, 'g'), '');
        continue;
      }
      const inParens = new RegExp(`\\s*\\([^()\\n]*${escapeRe(token)}[^()\\n]*\\)`, 'g');
      if (inParens.test(line)) {
        line = line.replace(inParens, '');
        continue;
      }
      drop = true;
      break;
    }
    if (!drop) out.push(line.replace(/[ \t]+$/g, ''));
  }
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

/** ตรวจข้อความก่อนบันทึก — คืนข้อความเตือนภาษาคน หรือ null = ใช้ได้ */
function replyTemplateProblem(template) {
  const body = String(template ?? '').trim();
  if (body.length > MAX_REPLY_LENGTH) return `ยาวเกิน ${MAX_REPLY_LENGTH.toLocaleString('en-US')} ตัวอักษร`;
  const known = new Set(REPLY_PLACEHOLDERS.map((p) => p.key));
  const unknown = [...body.matchAll(/\{([^{}\n]+)\}/g)].map((m) => m[1]).filter((k) => !known.has(k));
  if (unknown.length) return `ไม่รู้จักคำแทน ${[...new Set(unknown)].map((k) => `{${k}}`).join(' ')} ใช้ได้แค่ ${[...known].map((k) => `{${k}}`).join(' ')}`;
  return null;
}

/** ตารางเก็บข้อความ (เพิ่มอย่างเดียว) + ข้อความตั้งต้น 2 แถว ไม่ทับที่ทีมแก้ไว้ */
function replyTemplatesTableSql(table = 'comment_reply_templates') {
  return `CREATE TABLE IF NOT EXISTS ${table} (
    kind        VARCHAR(16) PRIMARY KEY,
    body        TEXT NOT NULL DEFAULT '',
    updated_by  TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

async function ensureReplyTemplates(db, table = 'comment_reply_templates') {
  await db.query(replyTemplatesTableSql(table));
  for (const kind of REPLY_KINDS) {
    await db.query(`INSERT INTO ${table} (kind, body) VALUES ($1, $2) ON CONFLICT (kind) DO NOTHING`, [
      kind,
      DEFAULT_REPLY_TEMPLATES[kind],
    ]);
  }
}

async function loadReplyTemplates(db, table = 'comment_reply_templates') {
  const { rows } = await db.query(`SELECT kind, body FROM ${table}`);
  const out = { ...DEFAULT_REPLY_TEMPLATES };
  for (const r of rows || []) if (REPLY_KINDS.includes(r.kind)) out[r.kind] = r.body ?? '';
  return out;
}

module.exports = {
  REPLY_KINDS,
  REPLY_KIND_LABELS,
  DEFAULT_REPLY_TEMPLATES,
  REPLY_PLACEHOLDERS,
  MAX_REPLY_LENGTH,
  replyValues,
  renderReply,
  replyTemplateProblem,
  replyTemplatesTableSql,
  ensureReplyTemplates,
  loadReplyTemplates,
};
