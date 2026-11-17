/**
 * งาน Scrap ที่ค้นจบ (ครบเป้าหรือไม่ครบ) → ใบใน Jarvis เป็น "เสร็จ" ทันที ไม่ต้องมีคนกดตรวจรับ (เจ้าของ 17 พ.ย. 2569)
 * เดิมรอคนกด "ยืนยันข้อมูลผู้สมัคร" ไม่มีใครกด ใบค้าง "กำลังทำ" (LAO6911016 ได้ 24 คนตั้งแต่ 13 พ.ย.)
 * เปลี่ยนเฉพาะใบ Scrap ที่ Jarvis ยัง in_progress · สั่งใหม่ งานกลับเป็น idle/queued ก่อน ใบใหม่จึงไม่ถูกปิดด้วยผลรอบเก่า
 */
export const COMPLETE_JARVIS_SCRAPES_SQL = `UPDATE "jarvis_rm".job_posting_requests r
    SET status = 'completed', updated_at = now()
   FROM scrape_tasks t
  WHERE t.source_request_no IS NOT NULL AND r.request_no = t.source_request_no
    AND t.status IN ('done', 'partial')
    AND r.status = 'in_progress'
    AND to_jsonb(r)->>'request_type' = 'scraping'
  RETURNING r.request_no`;

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
  if (lower.includes('daily cap reached') || lower.includes('provider daily cap')) return 'โควต้าค้นหาวันนี้เต็มแล้ว';
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
