/**
 * อีเมลที่ห้ามเก็บเป็นอีเมลของผู้สมัคร — ใช้ทุกทางที่อ่านหรือเขียนอีเมลลง candidates
 * (ตัวอ่านหน้าเรซูเม่ · ตัวเติมจากข้อความ · เติมจาก OCR · บันทึกครั้งแรก · เติมช่องที่ขาด · ตัวตัดสินว่าติดต่อได้)
 *
 * 25 พ.ย. 2569: JobThai แปะอีเมลตัวอย่าง (@example.com) ในหน้าเรซูเม่ตอนยังไม่เปิดข้อมูลติดต่อ
 * ตัวเติมช่องว่างจากข้อความหยิบไปเป็นอีเมลผู้สมัคร ตัวตัดสินนับว่า "ติดต่อได้"
 * ผู้สมัคร 134 คนใน 3 วันขึ้น "ผ่านเกณฑ์" ใน Jarvis ทั้งที่ไม่มีเบอร์และไม่มีอีเมลจริง
 */

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** โดเมนตัวอย่าง (RFC 2606) และอีเมลที่ถูกปิดด้วย x */
export function isPlaceholderEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) return false;
  return /@(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/.test(e) || /x{4,}/.test(e);
}

/** อีเมลที่ใช้ติดต่อผู้สมัครได้จริง (รูปแบบถูก และไม่ใช่อีเมลตัวอย่าง) */
export function isRealEmail(email) {
  const e = String(email ?? '').trim();
  return EMAIL_SHAPE.test(e) && !isPlaceholderEmail(e);
}

/** คืน record ที่ตัดอีเมลตัวอย่างออก (email = '') */
export function dropUnstorableEmail(record) {
  if (!record || !record.email || !isPlaceholderEmail(record.email)) return record;
  return { ...record, email: '' };
}
