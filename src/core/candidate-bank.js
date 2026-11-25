/**
 * ค้นในคลังผู้สมัครก่อนออกไปค้นเว็บ (เจ้าของ 4 พ.ย. 2569)
 * ใบใหม่ได้คนที่เรามีอยู่แล้วทันที ไม่เสียโควตาเว็บ และไม่นับคนเดิมเป็น "ซ้ำ" อีก
 * (JobThai 2 สัปดาห์ก่อน 4 พ.ย. เปิดดู 15 คนต่อรอบ ซ้ำกับคลัง 208 คน)
 *
 * 18 พ.ย. 2569 เจ้าของ: โทรไปแล้วหลายคน "ได้งานแล้ว" — 30 วันก่อนหน้า 355/364 คนที่ส่งให้ใบขอมาจากคลัง
 * ใบวันนั้น 6 ใบได้จากคลังล้วน คนเดียวถูกส่งซ้ำถึง 8 ใบ จึงกำหนดว่า
 * - เอาเฉพาะคนที่เราเจอบนเว็บหางานไม่เกิน 30 วัน (เว็บเรียงเรซูเม่อัปเดตล่าสุด · last_seen_at ขยับเฉพาะตอนเปิดจากผลค้น)
 * - ไม่เอาคนที่ส่งให้ใบอื่นไปแล้วใน 30 วัน
 * - คลังเติมได้ไม่เกินครึ่งเป้า ที่เหลือทุกใบต้องค้นเว็บใหม่
 */
import { query, withTransaction } from '../db/pool.js';
import { linkCandidateToTask } from '../db/repositories.js';
import { evaluateResumeQualification } from './resume-qualification.js';
import { taskEntryGaps } from './resume-completeness.js';

export const BANK_MATCH_LABEL = 'จากคลังผู้สมัคร';
const SCAN_LIMIT = 400;
export const BANK_FRESH_DAYS = 30;
export const BANK_RESEND_DAYS = 30;

/** คลังเติมได้ไม่เกินครึ่งเป้า (ปัดลง) */
export function bankLimit(target) {
  return Math.floor(Math.max(0, Number(target) || 0) / 2);
}

/** จำนวนที่ต้องค้นเว็บ: อย่างน้อยครึ่งเป้า (ปัดขึ้น) แม้คลังหรือรอบก่อนให้มาพอแล้ว */
export function webSearchTarget(target, matched) {
  const goal = Math.max(1, Number(target) || 0);
  return Math.max(Math.ceil(goal / 2), goal - Math.max(0, Number(matched) || 0));
}

const clean = (v) => String(v ?? '').trim();

/** คำที่ใช้หาคนในคลัง: ตำแหน่ง คำค้น และตำแหน่งที่ AI เสนอ */
export function bankSearchTerms(criteria = {}, qualificationSpec = {}) {
  return [...new Set(
    [criteria.position, criteria.keyword, ...(qualificationSpec.accepted_positions || [])].map(clean).filter(Boolean),
  )];
}

/**
 * คัดคนในคลังด้วยเกณฑ์เดียวกับคนที่เพิ่งค้นมา คืนเฉพาะคนผ่านเกณฑ์ เรียงคะแนน (ตำแหน่งตรงขึ้นก่อน) แล้วเจอบนเว็บล่าสุดก่อน
 * @param {Array<Record<string, unknown>>} rows แถวจากตาราง candidates
 */
export function rankBankCandidates(rows, { criteria = {}, qualificationSpec = {}, limit = 20 } = {}) {
  const ranked = [];
  for (const row of rows) {
    const candidate = { ...row, name: row.name || row.full_name };
    // คลังก็ใช้กติกาเดียวกับคนที่เพิ่งค้น: ต้องมีชื่อ นามสกุล และเบอร์หรืออีเมลจริง (เจ้าของ 25 พ.ย. 2569)
    if (taskEntryGaps(candidate).length) continue;
    const qualification = evaluateResumeQualification(candidate, { criteria, sourcingSpec: qualificationSpec });
    if (qualification.status !== 'qualified') continue;
    ranked.push({ row, qualification });
  }
  ranked.sort((a, b) => (b.qualification.score - a.qualification.score)
    || (Date.parse(b.row.last_seen_at || 0) - Date.parse(a.row.last_seen_at || 0)));
  return ranked.slice(0, Math.max(1, limit));
}

/**
 * ผูกคนในคลังที่ผ่านเกณฑ์เข้ากับใบงาน คืนจำนวนที่ผ่านเกณฑ์ใหม่ของใบนี้
 * ข้ามคนที่ใบนี้มีอยู่แล้ว · กรองจังหวัดในฐานก่อน (คลังมีเป็นพัน) ส่วน เพศ/อายุ คัดด้วยกติกาเดียวกับคนใหม่
 */
export async function matchBankCandidates({ taskId, criteria = {}, qualificationSpec = {}, target = 10 }) {
  const terms = bankSearchTerms(criteria, qualificationSpec);
  if (!taskId || !terms.length) return { scanned: 0, linked: 0, qualified: 0 };
  const limit = Math.max(0, Number(target) || 0);
  if (!limit) return { scanned: 0, linked: 0, qualified: 0 };
  const params = [taskId, terms.map((t) => `%${t}%`)];
  const where = [
    'NOT EXISTS (SELECT 1 FROM scrape_task_candidates tc WHERE tc.task_id = $1 AND tc.candidate_id = c.id)',
    `NOT EXISTS (SELECT 1 FROM scrape_task_candidates o WHERE o.candidate_id = c.id AND o.task_id <> $1
       AND o.qualification_status = 'qualified' AND o.first_matched_at >= now() - interval '${BANK_RESEND_DAYS} days')`,
    '(c.desired_positions ILIKE ANY($2) OR c.work_experience::text ILIKE ANY($2))',
  ];
  const province = clean(criteria.province);
  if (province) {
    params.push(`%${province}%`);
    where.push(`(c.desired_work_area ILIKE $${params.length} OR c.province ILIKE $${params.length} OR c.address ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT c.*, s.id AS source_id, s.last_seen_at
       FROM candidates c
       JOIN LATERAL (SELECT id, last_seen_at FROM candidate_sources
                      WHERE candidate_id = c.id ORDER BY last_seen_at DESC NULLS LAST LIMIT 1) s ON true
      WHERE ${where.join(' AND ')}
        AND s.last_seen_at >= now() - interval '${BANK_FRESH_DAYS} days'
      ORDER BY s.last_seen_at DESC
      LIMIT ${SCAN_LIMIT}`,
    params,
  );
  const ranked = rankBankCandidates(rows, { criteria, qualificationSpec, limit });
  let qualified = 0;
  if (ranked.length) {
    await withTransaction(async (client) => {
      for (const { row, qualification } of ranked) {
        const link = await linkCandidateToTask(client, {
          taskId,
          candidateId: row.id,
          sourceId: row.source_id ?? null,
          matchedPosition: BANK_MATCH_LABEL,
          qualification,
        });
        if (link.becameQualified) qualified += 1;
      }
    });
  }
  return { scanned: rows.length, linked: ranked.length, qualified };
}
