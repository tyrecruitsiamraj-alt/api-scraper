/**
 * ใบสั่งโพสต์ใน Jarvis ที่ยัง "กำลังดำเนินการ" — ดูผลของรอบโพสต์ที่สั่งหลังใบนั้น แล้วเปลี่ยนสถานะใน Jarvis
 * - มีกลุ่มที่โพสต์สำเร็จหรือได้ลิงก์ → posted
 * - ทุกรอบจบแล้วไม่สำเร็จสักกลุ่ม → rejected พร้อม notes "ตีกลับ: เหตุ" ให้คนสั่งแก้แล้วสั่งใหม่
 *
 * นิยามเดียว ใช้สองที่: หน้าเว็บ (ตอนเปิดหน้า) และเครื่อง worker (ทุก 5 นาที) — Jarvis ไม่ได้ถามสถานะเอง
 * ใบขอเดียวกันมีได้หลายแถวใน Jarvis จึงแก้ทีละแถวด้วย id เท่านั้น
 *
 * @param {(sql: string, params?: unknown[]) => Promise<any[]>} rowsOf คืน rows ของ query
 * @param {{ autopostSchema: string }} opts
 */
export async function syncJarvisPostOrders(rowsOf, { autopostSchema }) {
  if (!/^[A-Za-z0-9_-]+$/.test(autopostSchema)) throw new Error(`autopost schema ไม่ถูกต้อง: ${autopostSchema}`);
  const AP = `"${autopostSchema}"`;
  const rows = await rowsOf(
    `SELECT r.id::text AS id, r.request_no, r.created_at
       FROM "jarvis_rm".job_posting_requests r
      WHERE r.status = 'in_progress'
        AND COALESCE(NULLIF(to_jsonb(r)->>'request_type', ''), 'content') = 'content'
        AND to_jsonb(r)->'job_snapshot' ? 'caption'
        AND r.created_at > now() - interval '30 days'`,
  );
  const result = { posted: [], rejected: [] };
  for (const row of rows) {
    const jobId = `jv-${String(row.request_no).toLowerCase()}`;
    const runs = await rowsOf(
      `SELECT run_id, status, error FROM ${AP}.post_run_queue
        WHERE created_at >= $2
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(assignment_ids::jsonb) a
                       WHERE a = $1 OR a LIKE $1 || '-r%')
        ORDER BY created_at DESC`,
      [jobId, row.created_at],
    );
    if (!runs.length) continue;
    const runIds = runs.map((r) => r.run_id).filter(Boolean);
    const evidence = runIds.length
      ? await rowsOf(
        `SELECT (SELECT count(*) FROM ${AP}.run_logs WHERE run_id = ANY($1::text[]) AND level = 'success')
              + (SELECT count(*) FROM ${AP}.post_logs WHERE run_id = ANY($1::text[]) AND COALESCE(post_link, '') <> '') AS n`,
        [runIds],
      )
      : [{ n: 0 }];
    if (Number(evidence[0]?.n ?? 0) > 0) {
      if (await setRowStatus(rowsOf, row.id, 'posted', null)) result.posted.push(row.request_no);
      continue;
    }
    if (runs.some((r) => r.status === 'queued' || r.status === 'running')) continue;
    const attempts = runIds.length
      ? await rowsOf(
        `SELECT l.group_id, g.name AS group_name, l.level, l.message
           FROM ${AP}.run_logs l
           LEFT JOIN ${AP}.groups g ON g.fb_group_id::text = l.group_id
          WHERE l.run_id = ANY($1::text[]) AND l.group_id IS NOT NULL AND l.level IN ('success', 'warn', 'error')
          ORDER BY l.created_at DESC`,
        [runIds],
      )
      : [];
    const note = `ตีกลับ: ${postRoundFailureReason(runs[0], attempts)}`;
    if (await setRowStatus(rowsOf, row.id, 'rejected', note)) result.rejected.push(row.request_no);
  }
  return result;
}

async function setRowStatus(rowsOf, rowId, status, note) {
  const changed = await rowsOf(
    `UPDATE "jarvis_rm".job_posting_requests
        SET status = $2, notes = COALESCE($3, notes), updated_at = now()
      WHERE id::text = $1 AND status = 'in_progress'
      RETURNING id`,
    [rowId, status, note],
  );
  return changed.length > 0;
}

/**
 * เหตุที่ใบนี้โพสต์ไม่ได้สักกลุ่ม ให้คนสั่งอ่านใน Jarvis
 * @param {{ status: string, error: string | null }} latestRun รอบล่าสุดของใบนี้
 * @param {{ group_id: string | null, group_name?: string | null, level: string, message: string | null }[]} attempts ล่าสุดก่อน
 */
export function postRoundFailureReason(latestRun, attempts) {
  if (latestRun.status === 'cancelled') return 'รอบโพสต์ถูกยกเลิก';
  const parts = [];
  if (latestRun.status === 'failed') {
    const err = String(latestRun.error ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    const why = /WORKER_POST_JOB_MAX_MS|stale_running/i.test(err)
      ? 'ใช้เวลานานเกินกำหนด เครื่องหยุดงานนี้'
      : err.slice(0, 200) || 'ไม่ทราบสาเหตุ';
    parts.push(`รอบโพสต์หยุดก่อนจบ (${why})`);
  }
  const failed = new Map();
  for (const a of attempts) {
    if (a.level === 'success' || !a.group_id || failed.has(a.group_id)) continue;
    failed.set(a.group_id, {
      name: a.group_name || a.group_id,
      msg: String(a.message ?? 'โพสต์ไม่สำเร็จ').replace(/\s+/g, ' ').slice(0, 160),
    });
  }
  if (failed.size) {
    const lines = [...failed.values()].slice(0, 3).map((f) => `${f.name}: ${f.msg}`);
    const more = failed.size > 3 ? ` และอีก ${failed.size - 3} กลุ่ม` : '';
    parts.push(`ไม่สำเร็จ ${failed.size} กลุ่ม · ${lines.join(' · ')}${more}`);
  }
  return parts.length ? parts.join(' · ') : 'ไม่มีกลุ่มที่โพสต์ได้ในรอบนี้';
}
