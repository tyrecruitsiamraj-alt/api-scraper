/**
 * เบอร์ที่ห้ามเก็บเป็นเบอร์ของผู้สมัคร — ใช้ทุกทางที่เขียนเบอร์ลง candidates (บันทึกครั้งแรก · เติมช่องที่ขาด · เติมจาก OCR)
 *
 * 24 พ.ย. 2569: JobThai แปะ "ติดต่อเจ้าหน้าที่ 02-480-9999" ในหน้าเรซูเม่ตอนไม่เปิดเบอร์
 * ตอนบันทึกครั้งแรกตัวกันเบอร์กลางตัดทิ้งแล้ว แต่ขั้นเติมช่องที่ขาดหลังจบงาน (tasks-worker) อ่านข้อความหน้าเดิมซ้ำ
 * แล้วเขียนเบอร์นี้ทับโดยไม่ผ่านตัวกัน — ผู้สมัคร 846 คนใน 2 วันได้เบอร์ call center ไป 151 คนอยู่ในรายชื่อผ่านเกณฑ์
 */

/** เบอร์ของเว็บหางานเอง (9 หลักท้าย) — รู้แน่ว่าไม่ใช่ของผู้สมัคร แม้ยังไม่มีใครในฐานใช้ร่วม */
export const SITE_PHONES = new Set([
  '024809999', // JobThai call center
]);

const digits = (v) => String(v ?? '').replace(/\D/g, '');

export function isSitePhone(phone) {
  const d = digits(phone);
  if (d.length < 9) return false;
  return SITE_PHONES.has(`0${d.slice(-8)}`) || SITE_PHONES.has(d.slice(-9));
}

/**
 * คืน record ที่ตัดเบอร์ที่ห้ามเก็บออก (phone = '')
 * - เบอร์ของเว็บหางาน
 * - เบอร์ที่ผู้สมัครคนอื่นในฐานใช้ร่วมกันตั้งแต่ sharedMin คนขึ้นไป (เบอร์กลาง)
 * @param {(sql: string, params: unknown[]) => Promise<{ rows: Array<{ n: number }> }>} exec
 */
export async function dropUnstorablePhone(exec, candidateId, record, sharedMin = 5) {
  const d = digits(record?.phone);
  if (!d) return record;
  if (isSitePhone(d)) return { ...record, phone: '' };
  if (d.length >= 9) {
    const { rows } = await exec(
      `SELECT count(*)::int AS n FROM candidates
        WHERE length(phone_norm) >= 9 AND right(phone_norm, 9) = right($1, 9)
          AND id::text <> COALESCE($2::text, '')`,
      [d, candidateId ?? null],
    );
    if ((rows[0]?.n ?? 0) >= sharedMin) return { ...record, phone: '' };
  }
  return record;
}
