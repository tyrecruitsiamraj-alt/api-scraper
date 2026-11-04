/**
 * ค้นในคลังผู้สมัครก่อนออกไปค้นเว็บ (เจ้าของ 4 พ.ย. 2569)
 * ใบใหม่ได้คนที่เรามีอยู่แล้วทันที ไม่เสียโควตาเว็บ และไม่นับคนเดิมเป็น "ซ้ำ" อีก
 * (JobThai 2 สัปดาห์ก่อน 4 พ.ย. เปิดดู 15 คนต่อรอบ ซ้ำกับคลัง 208 คน)
 */
import { query, withTransaction } from '../db/pool.js';
import { linkCandidateToTask } from '../db/repositories.js';
import { evaluateResumeQualification } from './resume-qualification.js';

export const BANK_MATCH_LABEL = 'จากคลังผู้สมัคร';
const SCAN_LIMIT = 400;

const clean = (v) => String(v ?? '').trim();

/** คำที่ใช้หาคนในคลัง: ตำแหน่ง คำค้น และตำแหน่งที่ AI เสนอ */
export function bankSearchTerms(criteria = {}, qualificationSpec = {}) {
  return [...new Set(
    [criteria.position, criteria.keyword, ...(qualificationSpec.accepted_positions || [])].map(clean).filter(Boolean),
  )];
}

/**
 * คัดคนในคลังด้วยเกณฑ์เดียวกับคนที่เพิ่งค้นมา คืนเฉพาะคนผ่านเกณฑ์ เรียงคะแนน (ตำแหน่งตรงขึ้นก่อน) แล้วใหม่สุดก่อน
 * @param {Array<Record<string, unknown>>} rows แถวจากตาราง candidates
 */
export function rankBankCandidates(rows, { criteria = {}, qualificationSpec = {}, limit = 20 } = {}) {
  const ranked = [];
  for (const row of rows) {
    const candidate = { ...row, name: row.name || row.full_name };
    const qualification = evaluateResumeQualification(candidate, { criteria, sourcingSpec: qualificationSpec });
    if (qualification.status !== 'qualified') continue;
    ranked.push({ row, qualification });
  }
  ranked.sort((a, b) => (b.qualification.score - a.qualification.score)
    || (Date.parse(b.row.last_updated_at || 0) - Date.parse(a.row.last_updated_at || 0)));
  return ranked.slice(0, Math.max(1, limit));
}

/**
 * ผูกคนในคลังที่ผ่านเกณฑ์เข้ากับใบงาน คืนจำนวนที่ผ่านเกณฑ์ใหม่ของใบนี้
 * ข้ามคนที่ใบนี้มีอยู่แล้ว · กรองจังหวัดในฐานก่อน (คลังมีเป็นพัน) ส่วน เพศ/อายุ คัดด้วยกติกาเดียวกับคนใหม่
 */
export async function matchBankCandidates({ taskId, criteria = {}, qualificationSpec = {}, target = 10 }) {
  const terms = bankSearchTerms(criteria, qualificationSpec);
  if (!taskId || !terms.length) return { scanned: 0, linked: 0, qualified: 0 };
  const params = [taskId, terms.map((t) => `%${t}%`)];
  const where = [
    'NOT EXISTS (SELECT 1 FROM scrape_task_candidates tc WHERE tc.task_id = $1 AND tc.candidate_id = c.id)',
    '(c.desired_positions ILIKE ANY($2) OR c.work_experience::text ILIKE ANY($2))',
  ];
  const province = clean(criteria.province);
  if (province) {
    params.push(`%${province}%`);
    where.push(`(c.desired_work_area ILIKE $${params.length} OR c.province ILIKE $${params.length} OR c.address ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT c.*,
            (SELECT s.id FROM candidate_sources s WHERE s.candidate_id = c.id
              ORDER BY s.last_seen_at DESC NULLS LAST LIMIT 1) AS source_id
       FROM candidates c
      WHERE ${where.join(' AND ')}
      ORDER BY c.last_updated_at DESC NULLS LAST
      LIMIT ${SCAN_LIMIT}`,
    params,
  );
  const ranked = rankBankCandidates(rows, { criteria, qualificationSpec, limit: Math.max(target * 2, 10) });
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
