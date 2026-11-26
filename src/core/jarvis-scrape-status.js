/**
 * งาน Scrap ที่ค้นจบ → ใบใน Jarvis ปิดเองตามผลจริง ไม่ต้องมีคนกดตรวจรับ (เจ้าของ 17 พ.ย. 2569)
 * เดิมรอคนกด "ยืนยันข้อมูลผู้สมัคร" ไม่มีใครกด ใบค้าง "กำลังทำ" (LAO6911016 ได้ 24 คนตั้งแต่ 13 พ.ย.)
 * เจ้าของ "แสดงตามจริง เสร็จ เจอบางส่วน ไม่สำเร็จ" — Jarvis มีแค่ completed/rejected (CHECK ใน jarvis_rm)
 * จึงบอกระดับผลด้วยคำนำหน้าใน notes ("ได้ครบ: " / "เจอบางส่วน: " / "ตีกลับ: ") ให้ Jarvis แยกป้ายเอง
 * เปลี่ยนเฉพาะใบ Scrap ที่ Jarvis ยัง in_progress · สั่งใหม่ งานกลับเป็น idle/queued ก่อน ใบใหม่จึงไม่ถูกปิดด้วยผลรอบเก่า
 */
export const FINISHED_JARVIS_SCRAPES_SQL = `SELECT t.source_request_no AS request_no,
         COALESCE(NULLIF(t.target_count, 0), t.progress_target, 0)::int AS target,
         count(c.candidate_id) FILTER (WHERE c.qualification_status = 'qualified')::int AS qualified,
         count(c.candidate_id) FILTER (WHERE c.qualification_status = 'needs_review')::int AS waiting
    FROM scrape_tasks t
    JOIN "jarvis_rm".job_posting_requests r
      ON r.request_no = t.source_request_no AND r.status = 'in_progress' AND to_jsonb(r)->>'request_type' = 'scraping'
    LEFT JOIN scrape_task_candidates c ON c.task_id = t.id
   WHERE t.source_request_no IS NOT NULL AND t.status IN ('done', 'partial')
   GROUP BY t.id`;

/** $1 = request_no · $2 = status · $3 = notes — ปิดเมื่องานยังจบอยู่จริง (กันสั่งใหม่แทรกระหว่างอ่านกับเขียน) */
export const CLOSE_JARVIS_SCRAPE_SQL = `UPDATE "jarvis_rm".job_posting_requests r
    SET status = $2, notes = $3, updated_at = now()
   FROM scrape_tasks t
  WHERE r.request_no = $1 AND t.source_request_no = r.request_no
    AND t.status IN ('done', 'partial')
    AND r.status = 'in_progress'
    AND to_jsonb(r)->>'request_type' = 'scraping'
  RETURNING r.request_no`;

/**
 * ผลของงานที่ค้นจบ → สถานะ + notes ที่เขียนลงใบ Jarvis
 * ครบเป้า = เสร็จ · ผ่านเกณฑ์บางส่วน = เจอบางส่วน (Jarvis ยังเป็น completed) · ไม่มีใครผ่านเกณฑ์ = ไม่สำเร็จ (สั่งใหม่ได้)
 */
export function scrapeOutcome({ target, qualified, waiting = 0 }) {
  const goal = Math.max(0, Number(target) || 0);
  const got = Math.max(0, Number(qualified) || 0);
  const pending = Math.max(0, Number(waiting) || 0);
  const waitText = pending > 0 ? ` · รอตรวจอีก ${pending} คน` : '';
  if (got > 0 && got >= goal) {
    return { status: 'completed', label: 'เสร็จ', notes: `ได้ครบ: ผ่านเกณฑ์ ${got}${goal ? `/${goal}` : ''} คน` };
  }
  if (got > 0) {
    return { status: 'completed', label: 'เจอบางส่วน', notes: `เจอบางส่วน: ผ่านเกณฑ์ ${got}/${goal} คน${waitText}` };
  }
  return { status: 'rejected', label: 'ไม่สำเร็จ', notes: `ตีกลับ: ค้นครบทุกคำแล้ว ไม่เจอคนผ่านเกณฑ์${waitText}` };
}

/**
 * งาน Scrap ที่มาจาก Jarvis ล้มจนหมดรอบลองใหม่ → เขียนใบใน Jarvis เป็น "ไม่สำเร็จ" พร้อมเหตุ
 * เดิมไม่เขียนอะไรกลับ ใบค้าง "กำลังทำ" และ Jarvis ล็อกปุ่มสั่งใหม่ (LMO6911012 ล้ม 13 พ.ย. 2569 ยังค้างถึง 16 พ.ย.)
 * Jarvis อ่าน status 'rejected' = "ไม่สำเร็จ" แสดงเหตุจาก notes (ตัด "ตีกลับ: " ออก) และเปิดปุ่ม "สั่งใหม่"
 */

/** เหตุ 1 ประโยคที่คนสั่งงานอ่านรู้เรื่อง — ข้อความดิบยังอยู่ในหน้างาน Scrap ของเรา */
export function scrapeFailNote(error) {
  const raw = String(error ?? '').replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  if (raw.includes('JOBBKK_FILTER_NOT_APPLIED') && raw.includes('จังหวัด')) {
    return 'JobBKK เลือกจังหวัดในหน้าค้นหาไม่ได้ ระบบจึงหยุดเพื่อไม่ดึงคนทั้งประเทศมาปน';
  }
  if (raw.includes('JOBBKK_FILTER_NOT_APPLIED')) {
    return 'JobBKK เลือกตำแหน่งในหน้าค้นหาไม่ได้ ระบบจึงหยุดเพื่อไม่ดึงคนตำแหน่งอื่นมาปน';
  }
  if (lower.includes('captcha') || lower.includes('checkpoint') || raw.includes('ยืนยันตัวตน')) {
    return 'เว็บหางานขอยืนยันตัวตน ต้องให้คนเข้าไปตรวจบัญชีก่อน';
  }
  if (raw.includes('รหัสผ่านไม่ถูกต้อง') || lower.includes('wrong password')) return 'รหัสบัญชีเว็บหางานไม่ถูกต้อง';
  if (raw.includes('เครื่องค้นหาเข้าเว็บหางานไม่ได้') || /net::err_(cert|ssl|name_not|internet_disc|connection|timed_out|proxy|address_unr|tunnel|network)/.test(lower)) {
    return 'เครื่องค้นหาเข้าเว็บหางานไม่ได้ติดกันเกิน 3 วัน ต้องให้ IT ตรวจอินเทอร์เน็ตของเครื่องค้นหา';
  }
  if (lower.includes('daily cap reached') || lower.includes('provider daily cap')) return 'โควต้าค้นหาวันนี้เต็มแล้ว';
  if (raw.includes('CONTACT_REVEAL_BLOCKED')) return 'เว็บหางานไม่เปิดเบอร์ผู้สมัคร ต้องให้คนตรวจบัญชีและแพ็กเกจดูเบอร์ของเว็บหางานก่อน';
  if (lower.includes('locator.click') || lower.includes('timeout')) return 'กดช่องค้นหาบนเว็บหางานไม่สำเร็จ';
  const first = raw.split(' · ')[0];
  return (first || 'ค้นหาไม่สำเร็จ').slice(0, 200);
}

/**
 * SQL ปิดใบ Scrap ใน Jarvis ของงานนี้เป็นไม่สำเร็จ · $1 = scrape_tasks.id · $2 = notes
 * เปลี่ยนเฉพาะใบที่ยังเปิดอยู่ (pending/in_progress) และเป็นชนิด scraping — ใบโพสต์ของเลขเดียวกันไม่โดน
 */
export const REJECT_JARVIS_SCRAPE_SQL = `UPDATE "jarvis_rm".job_posting_requests r
    SET status = 'rejected', notes = $2, updated_at = now()
   FROM scrape_tasks t
  WHERE t.id = $1 AND t.source_request_no IS NOT NULL AND r.request_no = t.source_request_no
    AND r.status IN ('pending', 'in_progress')
    AND to_jsonb(r)->>'request_type' = 'scraping'
  RETURNING r.request_no`;

export function rejectJarvisScrapeParams(taskId, error) {
  return [taskId, `ตีกลับ: ${scrapeFailNote(error)}`];
}

/**
 * งาน Scrap ที่รอคิวเพราะโควต้าค้นหาวันนี้เต็ม: ใบใน Jarvis คง "กำลังทำ" แต่จดเหตุไว้ใน notes (ไม่ตีกลับ ไม่ต้องสั่งใหม่)
 * $1 = scrape task id · $2 = notes
 */
export const WAIT_JARVIS_SCRAPE_SQL = `UPDATE "jarvis_rm".job_posting_requests r
    SET notes = $2, updated_at = now()
   FROM scrape_tasks t
  WHERE t.id::text = $1 AND r.request_no = t.source_request_no
    AND r.status = 'in_progress'
    AND to_jsonb(r)->>'request_type' = 'scraping'
  RETURNING r.request_no`;

/**
 * ใบ Scrap ใน Jarvis ที่ "กำลังทำ" แต่ไม่มีงานค้นในคิวเลย (26 พ.ย. 2569)
 * - LAO6909004 สั่ง 20 พ.ย. 08:20 ตอนไม่มีเครื่องค้นเปิด ระบบไม่สร้างงาน ใบค้าง 6 วัน
 * - LAO6910025 งานค้นถูกข้ามเพราะ "กำลังรันในอีกช่อง" แล้วช่องนั้นค้างตาย ไม่มีใครเขียนกลับ Jarvis
 * เจ้าของเลือก: ส่งเข้าคิวให้เอง 1 ครั้ง ถ้าค้างซ้ำค่อยตีกลับพร้อมเหตุให้สั่งใหม่
 * ไม่แตะใบที่มีงานรอ/กำลังรัน (รวมงานที่รอโควต้าหรือรอเน็ต) และงานที่ค้นจบแล้ว (completeJarvisScrapes ปิดให้)
 */
export const STUCK_SCRAPE_MINUTES = 15;
export const STUCK_JARVIS_SCRAPES_SQL = `WITH latest AS (
    SELECT DISTINCT ON (r.request_no) r.request_no, r.status, r.created_at, r.updated_at
      FROM "jarvis_rm".job_posting_requests r
     WHERE to_jsonb(r)->>'request_type' = 'scraping'
     ORDER BY r.request_no, r.created_at DESC)
  SELECT l.request_no, t.id::text AS task_id, t.connector_id::text AS connector_id, t.enabled, t.criteria, c.platform,
         (SELECT w.owner_user FROM work_queue w WHERE w.ref_id = t.id::text AND w.type = 'scrape' ORDER BY w.created_at DESC LIMIT 1) AS owner_user,
         EXISTS (SELECT 1 FROM work_queue w WHERE w.ref_id = t.id::text AND w.type = 'scrape'
                  AND w.created_at >= l.created_at AND w.payload->>'auto_requeue' = 'true') AS already_requeued
    FROM latest l
    JOIN scrape_tasks t ON t.source_request_no = l.request_no
    JOIN connectors c ON c.id = t.connector_id
   WHERE l.status = 'in_progress'
     AND l.updated_at < now() - interval '${STUCK_SCRAPE_MINUTES} minutes'
     AND t.status NOT IN ('running', 'done', 'partial')
     AND NOT EXISTS (SELECT 1 FROM work_queue w WHERE w.ref_id = t.id::text AND w.type = 'scrape' AND w.status IN ('queued', 'running'))`;

/** $1 connector_key · $2 task id · $3 payload · $4 owner · $5 preferred worker (null = เครื่องไหนก็ได้) */
export const REQUEUE_STUCK_SCRAPE_SQL = `INSERT INTO work_queue (type, module, connector_key, ref_id, payload, owner_user, preferred_worker)
  SELECT 'scrape', 'scraper', $1, $2, $3::jsonb, $4, $5
   WHERE NOT EXISTS (SELECT 1 FROM work_queue w WHERE w.ref_id = $2 AND w.status IN ('queued', 'running'))
  RETURNING id`;

export const STUCK_REQUEUE_NOTE = 'รอคิว: งานค้นหลุดจากคิว ระบบส่งค้นใหม่ให้เองแล้ว';

/** ใบค้างใบนี้ต้องทำอะไร: ส่งเข้าคิวใหม่ หรือ ตีกลับ (ส่งเองไปแล้ว 1 ครั้งยังค้าง / คนกดปิดงานไว้) */
export function stuckScrapeAction(row = {}) {
  if (row.enabled === false) {
    return { action: 'reject', notes: 'ตีกลับ: งานค้นถูกปิดไว้ในระบบ So Scraping กรุณาสั่งใหม่' };
  }
  if (row.already_requeued) {
    return { action: 'reject', notes: 'ตีกลับ: งานค้นหลุดจากคิวซ้ำ ระบบส่งค้นใหม่ให้แล้ว 1 ครั้งแต่ยังค้าง กรุณาสั่งใหม่' };
  }
  const criteria = row.criteria && typeof row.criteria === 'object' ? row.criteria : {};
  const preferred = String(criteria.preferred_worker ?? '').trim() || null;
  return {
    action: 'requeue',
    notes: STUCK_REQUEUE_NOTE,
    params: [`${row.platform}:${row.connector_id}`, String(row.task_id), JSON.stringify({ ...criteria, auto_requeue: true }), row.owner_user ?? null, preferred],
  };
}
