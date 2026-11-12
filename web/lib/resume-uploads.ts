import 'server-only';
import { createHash } from 'node:crypto';
import { pool, q } from './db';
import { kickWorker } from './worker-kick';
import { RESUME_UPLOADS_DDL } from '../../src/db/resume-uploads-ddl.js';
import { LIST_FIELDS, TEXT_FIELDS, diffCandidate } from '../../src/core/resume-fields.js';
import type { CandidateDiffRow } from '../../src/core/resume-fields.js';

/**
 * อัปโหลดเรซูเม่ (เจ้าของ 12 พ.ย. 2569): เว็บเก็บไฟล์ + อ่านตัวหนังสือ PDF/Word ไว้ก่อน
 * แล้วส่งงาน resume_upload ให้เครื่องอ่านไฟล์ (workers/runner.js) ใช้ AI ของบริษัทแยกช่อง
 */

export type UploadStatus = 'queued' | 'reading' | 'saved' | 'review' | 'merged' | 'skipped' | 'failed';

export const UPLOAD_STATUS_LABEL: Record<UploadStatus, string> = {
  queued: 'รออ่าน',
  reading: 'กำลังอ่าน',
  saved: 'บันทึกแล้ว',
  review: 'มีคนนี้แล้ว รอเลือกข้อมูล',
  merged: 'อัปเดตคนเดิมแล้ว',
  skipped: 'ไม่ใช้ไฟล์นี้',
  failed: 'อ่านไม่ได้',
};

let ensured = false;
export async function ensureResumeUploads() {
  if (ensured) return;
  await q(RESUME_UPLOADS_DDL);
  ensured = true;
}

/** ชื่อเล่นจาก Jarvis ถ้ามี ไม่งั้นชื่อในบัญชี Microsoft */
export async function uploaderName(email: string | null, fallback: string | null): Promise<string | null> {
  if (email) {
    const rows = await q<{ name: string | null }>(
      `SELECT COALESCE(NULLIF(TRIM(nickname), ''), NULLIF(TRIM(full_name), '')) AS name
         FROM "jarvis_rm".users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    ).catch(() => []);
    if (rows[0]?.name) return rows[0].name;
  }
  return fallback || email;
}

/** งาน Scrap ให้เลือกผูก (ล่าสุดก่อน) — คนที่อัปโหลดเข้าใบนับว่าผ่านของใบนั้น */
export async function listUploadTaskOptions(): Promise<{ id: string; label: string }[]> {
  const rows = await q<{ id: string; request_no: string | null; title: string | null }>(
    `SELECT id, source_request_no AS request_no,
            COALESCE(NULLIF(criteria->>'position', ''), NULLIF(criteria->>'keyword', ''), name) AS title
       FROM scrape_tasks
      WHERE created_at > now() - interval '90 days'
      ORDER BY created_at DESC
      LIMIT 150`,
  );
  return rows.map((r) => ({ id: r.id, label: [r.request_no, r.title].filter(Boolean).join(' · ') || 'งาน Scrap' }));
}

/** เครื่องอ่านไฟล์ที่ออนไลน์และรับงาน resume_upload ได้ + AI ของเครื่องนั้นพร้อมแค่ไหน */
export async function resumeReaderStatus(): Promise<{ online: boolean; textModel: string | null; ocrModel: string | null; pdfTool: boolean }> {
  const rows = await q<{ text_model: string | null; ocr_model: string | null; pdf_tool: boolean | null }>(
    `SELECT meta->'ai'->>'text_model' AS text_model, meta->'ai'->>'ocr_model' AS ocr_model,
            (meta->'ai'->>'pdf_tool')::boolean AS pdf_tool
       FROM workers
      WHERE last_seen > now() - interval '2 minutes'
        AND COALESCE(meta->'types', '[]'::jsonb) ? 'resume_upload'
      ORDER BY (meta->'ai'->>'text_model') IS NOT NULL DESC, last_seen DESC
      LIMIT 1`,
  ).catch(() => []);
  const w = rows[0];
  return { online: Boolean(w), textModel: w?.text_model ?? null, ocrModel: w?.ocr_model ?? null, pdfTool: Boolean(w?.pdf_tool) };
}

/** ส่งรอบอัปโหลดให้เครื่องอ่านไฟล์ (กดหลังส่งไฟล์ครบทุกไฟล์ · กดซ้ำได้ ไม่เข้าคิวซ้ำ) */
export async function startUploadBatch(batchId: string, owner: string | null) {
  await q(
    `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user)
     SELECT 'resume_upload', 'scraper', $1, $2, '{}'::jsonb, $3
      WHERE NOT EXISTS (
        SELECT 1 FROM work_queue w WHERE w.ref_id = $2 AND w.type = 'resume_upload' AND w.status IN ('queued', 'running'))`,
    [`upload:${batchId}`, batchId, owner],
  );
  kickWorker();
}

/**
 * เก็บไฟล์หนึ่งไฟล์ (ส่งทีละไฟล์ — ไฟล์ละไม่เกิน 10 MB ไม่ต้องส่งก้อนใหญ่ทีเดียว)
 * batchId ว่าง = เริ่มรอบใหม่ · คืนเลขรอบ
 */
export async function addUploadFile(input: {
  batchId: string | null;
  file: { name: string; mime: string; content: Buffer; text: string };
  uploadedBy: string | null;
  uploadedByName: string | null;
  taskId: string | null;
}): Promise<string> {
  await ensureResumeUploads();
  const batchId = input.batchId || (await q<{ id: string }>('SELECT gen_random_uuid()::text AS id'))[0].id;
  const f = input.file;
  await q(
    `INSERT INTO resume_uploads (batch_id, uploaded_by, uploaded_by_name, file_name, mime, byte_size, sha256, content, task_id, raw_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      batchId,
      input.uploadedBy,
      input.uploadedByName,
      f.name,
      f.mime || null,
      f.content.length,
      createHash('sha256').update(f.content).digest('hex'),
      f.content,
      input.taskId,
      f.text || null,
    ],
  );
  return batchId;
}

export type UploadRow = {
  id: string;
  file_name: string;
  status: UploadStatus;
  error: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  parsed_name: string | null;
  task_label: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  finished_at: string | null;
  diff: CandidateDiffRow[];
};

export async function getUploadBatch(batchId: string): Promise<UploadRow[]> {
  await ensureResumeUploads();
  const rows = await q<Omit<UploadRow, 'diff'> & { parsed: Record<string, unknown> | null; current: Record<string, unknown> | null }>(
    `SELECT u.id, u.file_name, u.status, u.error, u.candidate_id, c.full_name AS candidate_name,
            u.parsed->>'full_name' AS parsed_name, u.uploaded_by_name, u.created_at, u.finished_at,
            CASE WHEN t.id IS NULL THEN NULL
                 ELSE concat_ws(' · ', t.source_request_no, COALESCE(NULLIF(t.criteria->>'position', ''), t.name)) END AS task_label,
            CASE WHEN u.status = 'review' THEN u.parsed END AS parsed,
            CASE WHEN u.status = 'review' THEN to_jsonb(c) END AS current
       FROM resume_uploads u
       LEFT JOIN candidates c ON c.id = u.candidate_id
       LEFT JOIN scrape_tasks t ON t.id = u.task_id
      WHERE u.batch_id = $1
      ORDER BY u.created_at, u.file_name`,
    [batchId],
  );
  return rows.map(({ parsed, current, ...r }) => ({ ...r, diff: parsed ? diffCandidate(current, parsed) : [] }));
}

export async function listRecentBatches(limit = 10) {
  await ensureResumeUploads();
  return q<{ batch_id: string; uploaded_by_name: string | null; created_at: string; files: number; saved: number; review: number; failed: number; waiting: number }>(
    `SELECT batch_id, max(uploaded_by_name) AS uploaded_by_name, min(created_at) AS created_at,
            count(*)::int AS files,
            count(*) FILTER (WHERE status IN ('saved', 'merged'))::int AS saved,
            count(*) FILTER (WHERE status = 'review')::int AS review,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status IN ('queued', 'reading'))::int AS waiting
       FROM resume_uploads
      GROUP BY batch_id
      ORDER BY min(created_at) DESC
      LIMIT $1`,
    [limit],
  );
}

/** ไฟล์ที่อ่านไม่ได้ ส่งให้อ่านใหม่ทั้งรอบ (เช่นหลัง IT ลงโมเดล AI แล้ว) */
export async function retryFailedUploads(batchId: string, owner: string | null): Promise<number> {
  const rows = await q<{ id: string }>(
    `UPDATE resume_uploads SET status = 'queued', error = NULL, finished_at = NULL
      WHERE batch_id = $1 AND status = 'failed' RETURNING id`,
    [batchId],
  );
  if (rows.length) await startUploadBatch(batchId, owner);
  return rows.length;
}

/** ไม่ใช้ไฟล์นี้ (คนเดิมไม่เปลี่ยน) */
export async function skipUpload(uploadId: string): Promise<string | null> {
  const rows = await q<{ batch_id: string }>(
    `UPDATE resume_uploads SET status = 'skipped', finished_at = now() WHERE id = $1 AND status = 'review' RETURNING batch_id`,
    [uploadId],
  );
  return rows[0]?.batch_id ?? null;
}

const TEXT_KEYS = new Set(TEXT_FIELDS.map((f) => f.key));
const LIST_KEYS = new Set(LIST_FIELDS.map((f) => f.key));

/**
 * คนที่มีอยู่แล้ว: เอาเฉพาะช่องที่ติ๊กจากไฟล์ใหม่ไปทับ แนบไฟล์ต้นฉบับ และผูกใบ (ถ้าเลือกใบไว้)
 * ไม่ติ๊กสักช่อง = แนบไฟล์อย่างเดียว ข้อมูลคนเดิมไม่เปลี่ยน
 */
export async function mergeUpload(uploadId: string, keys: string[]): Promise<{ batchId: string; candidateId: string } | null> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM resume_uploads WHERE id = $1 AND status = 'review' FOR UPDATE`,
      [uploadId],
    );
    const u = rows[0];
    if (!u?.candidate_id) {
      await client.query('ROLLBACK');
      return null;
    }
    const parsed = (u.parsed ?? {}) as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [u.candidate_id];
    for (const key of keys) {
      if (TEXT_KEYS.has(key)) {
        params.push(String(parsed[key] ?? '').trim());
        sets.push(`${key} = $${params.length}`);
        if (key === 'phone') sets.push(`phone_norm = regexp_replace($${params.length}, '\\D', '', 'g')`);
        if (key === 'email') sets.push(`email_norm = lower($${params.length})`);
      } else if (LIST_KEYS.has(key)) {
        params.push(JSON.stringify(Array.isArray(parsed[key]) ? parsed[key] : []));
        sets.push(`${key} = $${params.length}::jsonb`);
      }
    }
    if (sets.length) {
      await client.query(`UPDATE candidates SET ${sets.join(', ')}, last_updated_at = now() WHERE id = $1`, params);
    }
    const src = await client.query<{ id: string }>(
      `INSERT INTO candidate_sources (candidate_id, platform, external_id, parse_status, raw_text)
       VALUES ($1, 'upload', $2, 'upload', $3)
       ON CONFLICT (platform, external_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id, last_seen_at = now()
       RETURNING id`,
      [u.candidate_id, u.id, u.raw_text],
    );
    const ext = String(u.file_name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? null;
    await client.query(
      `INSERT INTO candidate_assets
         (candidate_id, candidate_source_id, kind, title, file_type, mime, byte_size, sha256, storage_kind, content,
          download_status, extract_status, extracted_text)
       VALUES ($1, $2, 'attachment', $3, $4, $5, $6, $7, 'db', $8, 'success', 'success', $9)
       ON CONFLICT (candidate_id, sha256) DO NOTHING`,
      [u.candidate_id, src.rows[0].id, u.file_name, ext, u.mime, u.byte_size, u.sha256, u.content, u.raw_text],
    );
    if (u.task_id) {
      await client.query(
        `INSERT INTO scrape_task_candidates
           (task_id, candidate_id, candidate_source_id, qualification_status, qualification_reasons, qualification_score,
            qualification_evidence, evaluated_at)
         VALUES ($1, $2, $3, 'qualified', $4::jsonb, 100, $5::jsonb, now())
         ON CONFLICT (task_id, candidate_id) DO UPDATE
           SET qualification_status = 'qualified', qualification_reasons = EXCLUDED.qualification_reasons,
               qualification_score = 100, qualification_evidence = EXCLUDED.qualification_evidence,
               evaluated_at = now(), last_matched_at = now()`,
        [
          u.task_id,
          u.candidate_id,
          src.rows[0].id,
          JSON.stringify([`อัปโหลดเข้าใบนี้โดย ${u.uploaded_by_name || u.uploaded_by || '-'}`]),
          JSON.stringify({ upload_id: u.id }),
        ],
      );
    }
    await client.query(`UPDATE resume_uploads SET status = 'merged', finished_at = now() WHERE id = $1`, [u.id]);
    await client.query('COMMIT');
    return { batchId: u.batch_id, candidateId: u.candidate_id };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** ผู้สมัครที่บันทึกจากรอบนี้ (ไว้รวม PDF เป็น zip) */
export async function batchCandidateIds(batchId: string): Promise<string[]> {
  const rows = await q<{ candidate_id: string }>(
    `SELECT DISTINCT candidate_id FROM resume_uploads
      WHERE batch_id = $1 AND status IN ('saved', 'merged') AND candidate_id IS NOT NULL`,
    [batchId],
  );
  return rows.map((r) => r.candidate_id);
}

/** คนอัปโหลดล่าสุดของผู้สมัครแต่ละคน (โชว์คู่กับป้าย "อัปโหลด" ในแหล่งที่มา) */
export async function uploadersByCandidate(candidateIds: string[]): Promise<Map<string, string>> {
  const ids = candidateIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return new Map();
  await ensureResumeUploads();
  const rows = await q<{ candidate_id: string; name: string | null }>(
    `SELECT DISTINCT ON (candidate_id) candidate_id::text, COALESCE(uploaded_by_name, uploaded_by) AS name
       FROM resume_uploads
      WHERE candidate_id = ANY($1::uuid[]) AND status IN ('saved', 'merged')
      ORDER BY candidate_id, created_at DESC`,
    [ids],
  );
  return new Map(rows.filter((r) => r.name).map((r) => [r.candidate_id, r.name as string]));
}
