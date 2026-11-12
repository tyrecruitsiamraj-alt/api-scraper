/**
 * งานอ่านเรซูเม่ที่อัปโหลด — รันในเครื่องอ่านไฟล์ (workers/runner.js งานชนิด resume_upload)
 * คนใหม่บันทึกทันที · คนที่มีอยู่แล้ว (เบอร์/อีเมล/ชื่อ-นามสกุลตรง) เก็บผลไว้ให้คนเลือกช่องบนหน้าเว็บ
 */
import { createHash } from 'node:crypto';
import { query, withTransaction } from './pool.js';
import { RESUME_UPLOADS_DDL } from './resume-uploads-ddl.js';
import { SHARED_PHONE_MIN, linkCandidateToTask, saveAsset, upsertCandidate, upsertSource } from './repositories.js';
import { ResumeReadError, extractResumeText, fileKind, missingEssentials, structureResume } from '../core/resume-upload.js';

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await query(RESUME_UPLOADS_DDL);
  ensured = true;
}

const nameKey = (first, last) => `${first ?? ''}${last ?? ''}`.toLowerCase().replace(/\s+/g, '');

/** คนเดิมในคลัง: เบอร์ (9 หลักท้าย ไม่ใช่เบอร์กลาง) → อีเมล → ชื่อ+นามสกุลตรงกัน */
export async function findExistingCandidate(parsed) {
  const phone = String(parsed.phone ?? '').replace(/\D/g, '');
  const email = String(parsed.email ?? '').trim().toLowerCase();
  const name = parsed.first_name && parsed.last_name ? nameKey(parsed.first_name, parsed.last_name) : '';
  if (phone.length >= 9) {
    const { rows } = await query(
      `SELECT id, count(*) OVER ()::int AS n FROM candidates
        WHERE length(phone_norm) >= 9 AND right(phone_norm, 9) = right($1, 9)
        ORDER BY (phone_norm = $1) DESC, last_updated_at DESC`,
      [phone],
    );
    if (rows[0] && rows[0].n < SHARED_PHONE_MIN) return rows[0].id;
  }
  if (email) {
    const { rows } = await query(`SELECT id FROM candidates WHERE email_norm = $1 ORDER BY last_updated_at DESC LIMIT 1`, [email]);
    if (rows[0]) return rows[0].id;
  }
  if (name.length >= 4) {
    const { rows } = await query(
      `SELECT id FROM candidates
        WHERE lower(regexp_replace(COALESCE(first_name, '') || COALESCE(last_name, ''), '\\s+', '', 'g')) = $1
        ORDER BY last_updated_at DESC LIMIT 1`,
      [name],
    );
    if (rows[0]) return rows[0].id;
  }
  return null;
}

async function setStatus(id, status, fields = {}) {
  await query(
    `UPDATE resume_uploads
        SET status = $2, error = $3, candidate_id = COALESCE($4, candidate_id),
            parsed = COALESCE($5::jsonb, parsed), raw_text = COALESCE($6, raw_text),
            finished_at = CASE WHEN $2 IN ('queued', 'reading') THEN NULL ELSE now() END
      WHERE id = $1`,
    [id, status, fields.error ?? null, fields.candidateId ?? null, fields.parsed ? JSON.stringify(fields.parsed) : null, fields.rawText ?? null],
  );
}

/** บันทึกคนใหม่ + แนบไฟล์ต้นฉบับ + ผูกใบ (ผูกใบ = นับว่าผ่านของใบนั้น) */
async function saveNewCandidate(row, parsed, text) {
  return withTransaction(async (client) => {
    const { id: candidateId } = await upsertCandidate(client, { ...parsed, name: parsed.full_name }, { platform: 'upload', externalId: row.id });
    const sourceId = await upsertSource(client, candidateId, { platform: 'upload', externalId: row.id, parseStatus: 'upload', rawText: text });
    await attachFile(client, candidateId, sourceId, row, text);
    if (row.task_id) {
      await linkCandidateToTask(client, {
        taskId: row.task_id,
        candidateId,
        sourceId,
        matchedPosition: null,
        qualification: { status: 'qualified', reasons: [`อัปโหลดเข้าใบนี้โดย ${row.uploaded_by_name || row.uploaded_by || '-'}`], score: 100, evidence: { upload_id: row.id } },
      });
    }
    return candidateId;
  });
}

/** ไฟล์ต้นฉบับเป็นไฟล์แนบของผู้สมัคร · ข้อความที่อ่านแล้วใส่ไว้เลย ตัวอ่านไฟล์แนบจะไม่อ่านซ้ำ */
export async function attachFile(client, candidateId, sourceId, row, text) {
  const ext = String(row.file_name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? null;
  const sha = row.sha256 || createHash('sha256').update(row.content).digest('hex');
  await saveAsset(client, candidateId, sourceId, {
    kind: 'attachment',
    title: row.file_name,
    file_type: ext,
    mime: row.mime,
    byte_size: row.byte_size,
    sha256: sha,
    content: row.content,
    download_status: 'success',
  });
  await client.query(
    `UPDATE candidate_assets SET extract_status = 'success', extracted_text = $3
      WHERE candidate_id = $1 AND sha256 = $2`,
    [candidateId, sha, text || null],
  );
}

/** อ่านไฟล์หนึ่งไฟล์ · ไม่ throw — ผลอยู่ใน status ของแถว */
export async function processResumeUpload(id) {
  const { rows } = await query(`SELECT * FROM resume_uploads WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row || !['queued', 'reading'].includes(row.status)) return row?.status ?? 'missing';
  await setStatus(id, 'reading');
  try {
    const kind = fileKind(row.file_name, row.mime);
    if (!kind) throw new ResumeReadError('รับเฉพาะไฟล์ PDF, Word (.docx) และรูป (JPG, PNG)');
    // เว็บอ่านตัวหนังสือจาก PDF/Word ไว้ตั้งแต่ตอนรับไฟล์ (raw_text) — ไม่มี = PDF สแกน/รูป ต้องให้ AI อ่านรูป
    const text = String(row.raw_text ?? '').trim() || (await extractResumeText(row.content, kind)).text;
    if (!text || text.replace(/\s+/g, '').length < 30) throw new ResumeReadError('ในไฟล์แทบไม่มีตัวหนังสือ อาจเป็นไฟล์ว่างหรือภาพไม่ชัด');
    const { parsed } = await structureResume(text);
    const missing = missingEssentials(parsed);
    if (missing) throw new ResumeReadError(missing);
    const existing = await findExistingCandidate(parsed);
    if (existing) {
      await setStatus(id, 'review', { candidateId: existing, parsed, rawText: text });
      return 'review';
    }
    const candidateId = await saveNewCandidate(row, parsed, text);
    await setStatus(id, 'saved', { candidateId, parsed, rawText: text });
    return 'saved';
  } catch (e) {
    const reason = e instanceof ResumeReadError ? e.message : `ระบบขัดข้องตอนอ่านไฟล์ (${String(e?.message ?? e).slice(0, 160)})`;
    await setStatus(id, 'failed', { error: reason });
    return 'failed';
  }
}

/** งานหนึ่งรอบอัปโหลด: อ่านทุกไฟล์ที่ยังไม่อ่านตามลำดับ */
export async function processResumeBatch(batchId) {
  await ensureTable();
  const { rows } = await query(
    `SELECT id FROM resume_uploads WHERE batch_id = $1 AND status IN ('queued', 'reading') ORDER BY created_at, file_name`,
    [batchId],
  );
  const counts = { saved: 0, review: 0, failed: 0 };
  for (const r of rows) {
    const status = await processResumeUpload(r.id);
    if (status in counts) counts[status] += 1;
  }
  return { batch_id: batchId, files: rows.length, ...counts };
}
