import { getJobthaiSession } from './session.js';
import { fetchResumeHtml, resumeDetailUrl, revealContact, searchResumeIds } from './client.js';
import { externalId, parseResumeHtml as parseJobthaiResumeHtml } from './parser.js';
import { finalizeCandidateRecord } from '../jobbkk/parser.js';
import { isResumeBodyComplete } from '../../core/resume-completeness.js';
import { collectAssetsForDb } from './assets.js';

const isReal = (v) => v && !/x{3,}|click|กรุณา|ดูข้อมูล/i.test(v);

/**
 * ข้อมูลติดต่อยังถูกปิดอยู่: JobThai ตอบข้อความ "เพื่อความปลอดภัย... กรุณาติดต่อเจ้าหน้าที่ โทร 02-…"
 * พร้อมเบอร์ call center และอีเมลตัวอย่าง (@example.com) แทนข้อมูลจริง — ห้ามเก็บเป็นของผู้สมัคร
 * (เคยติดไปกับผู้สมัคร 268 คน ตรวจพบ 28 ต.ค. 2569)
 */
export function isHiddenContactBlob(blob) {
  const s = String(blob || '');
  // 20 พ.ย. 2569: JobThai ตอบ "Error" พร้อมเบอร์ call center 02-480-9999 (ไม่มีประโยคเดิม) — เบอร์นี้ถูกเก็บเป็นเบอร์ผู้สมัคร
  // แล้วโปรไฟล์ JobThai 824 ใบถูกรวมเป็นคนเดียวตั้งแต่ 30 ต.ค. · คำตอบที่มีท่อน Error = ยังไม่เปิดข้อมูลติดต่อ
  if (s.split('####').some((seg) => /^error$/i.test(seg.trim()))) return true;
  return /เพื่อความปลอดภัย|ติดต่อเจ้าหน้าที่|@example\.(com|org|net)\b/i.test(s);
}

/** เบอร์มือถือไทย (06/08/09 + 8 หลัก หรือขึ้นต้น 66) — เบอร์บ้าน/เบอร์สำนักงานจากคำตอบของเว็บไม่ใช่เบอร์ผู้สมัคร */
export const isThaiMobile = (digits) => /^(?:0|66)[689]\d{8}$/.test(String(digits || ''));

export const jobthaiProvider = {
  id: 'jobthai',
  label: 'JobThai',

  getSession: getJobthaiSession,
  searchResumeIds,
  fetchResumeHtml,
  resumeDetailUrl,
  parseResumeHtml(html, opts) {
    return finalizeCandidateRecord(parseJobthaiResumeHtml(html, opts));
  },
  finalizeCandidateRecord,
  isResumeBodyComplete,
  collectAssetsForDb,
  externalId,

  /**
   * Reveal masked contacts via ajaxCheckViewStatusV2.php (costs view quota).
   * ONE call (type=mobile) returns all contacts as a "####"-delimited blob:
   *   ####<phone>####<email>####<line>####<code>####<code>
   * so we make a single request (not three) and split it.
   */
  async enrichContacts(request, id, record) {
    const blob = await revealContact(request, id, 'mobile');
    if (!blob) return record;
    // contact_hidden = เว็บไม่ยอมเปิดข้อมูลติดต่อ (ให้ตัวรันนับ แล้วหยุดถ้าโดนติดกัน ไม่เปิดโปรไฟล์ต่อให้เปลืองโควต้า)
    if (isHiddenContactBlob(blob)) {
      record.contact_hidden = true;
      return record;
    }
    const segs = blob.split('####').map((s) => s.trim()).filter(isReal);
    const phone = segs.find((s) => /^\+?\d[\d\s-]{7,}$/.test(s) && isThaiMobile(s.replace(/\D/g, '')));
    const email = segs.find((s) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s));
    // line id: a non-numeric token that isn't phone/email (exclude internal codes like "20.225", "1618")
    const line = segs.find((s) => s !== phone && s !== email && !/^\d+(\.\d+)?$/.test(s) && !/^\+?\d[\d\s-]{7,}$/.test(s));
    if (phone) record.phone = phone.replace(/\D/g, '');
    if (email) record.email = email;
    if (line) record.line_id = line;
    if (!phone && !email) record.contact_hidden = true;
    if (record.name && (record.phone || record.email)) record.parse_status = 'success';
    return record;
  },
};
