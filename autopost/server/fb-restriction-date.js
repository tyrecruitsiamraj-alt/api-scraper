/**
 * อ่านวันปลดล็อกจากข้อความหน้า "สถานะบัญชี" ของ Facebook (เจ้าของเคาะ 13 พ.ย. 2569)
 * ป๊อปอัปตอนโดนจำกัดไม่บอกวัน ("…เป็นระยะเวลานึง… ลองใหม่อีกครั้งในภายหลัง" ทุกครั้งที่บันทึกไว้ 2–11 พ.ย.)
 * เครื่องโพสต์จึงเปิดหน้าสถานะบัญชีแล้วส่งข้อความมาให้ฟังก์ชันนี้หา "จนถึง/until <วันที่>"
 * ยังไม่เคยเห็นหน้าจริง — รูปแบบที่รับได้ตั้งจากถ้อยคำที่ Facebook ใช้ทั่วไป ข้อความดิบบันทึกไว้ในบันทึกรอบทุกครั้ง
 * อ่านไม่ได้ = null แล้วผู้เรียกพักตามขั้นเดิม (บันทึกบอกว่าอ่านไม่ได้ ไม่เงียบ)
 */

const TH_MONTHS = [
  ['มกราคม', 'ม.ค.'], ['กุมภาพันธ์', 'ก.พ.'], ['มีนาคม', 'มี.ค.'], ['เมษายน', 'เม.ย.'], ['พฤษภาคม', 'พ.ค.'], ['มิถุนายน', 'มิ.ย.'],
  ['กรกฎาคม', 'ก.ค.'], ['สิงหาคม', 'ส.ค.'], ['กันยายน', 'ก.ย.'], ['ตุลาคม', 'ต.ค.'], ['พฤศจิกายน', 'พ.ย.'], ['ธันวาคม', 'ธ.ค.'],
];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** วันปลดล็อกต้องอยู่ในอนาคตไม่เกิน 60 วัน (นอกนั้นน่าจะอ่านผิดที่ ไม่ใช้) */
const MAX_AHEAD_DAYS = 60;

function monthIndex(word) {
  const w = String(word || '').toLowerCase().replace(/\s+/g, '');
  const th = TH_MONTHS.findIndex(([full, short]) => w === full || w === short || w === short.replace(/\./g, ''));
  if (th >= 0) return th;
  const en = EN_MONTHS.findIndex((m) => w.startsWith(m));
  return en;
}

/** เวลาไทย (UTC+7) → Date */
function bangkokDate(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month, day, hour - 7, minute));
}

function hour24(h, ampm) {
  let n = Number(h);
  const p = String(ampm || '').toLowerCase();
  if (/pm|บ่าย|เย็น/.test(p) && n < 12) n += 12;
  if (/am/.test(p) && n === 12) n = 0;
  return n;
}

const TH_MONTH_RE = TH_MONTHS.flat().map((m) => m.replace(/\./g, '\\.')).join('|');
const EN_MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const TIME_RE = '(?:\\s*(?:เวลา|at|,)?\\s*(\\d{1,2})[:.](\\d{2})\\s*(น\\.|am|pm|a\\.m\\.|p\\.m\\.)?)?';
const CUE_RE = '(?:จนถึง|ถึงวันที่|ถึง|สิ้นสุด(?:ใน)?(?:วันที่)?|ปลดล็อก(?:ใน)?(?:วันที่)?|until|ends?\\s+on|through|lifted\\s+on)';

/**
 * @param {string} text ข้อความจากหน้า Facebook
 * @param {number} [now]
 * @returns {Date|null}
 */
function parseRestrictionEnd(text, now = Date.now()) {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!t) return null;
  const candidates = [];

  // ไทย: จนถึง 18 พฤศจิกายน 2569 เวลา 10:15 น. · ถึง 18 พ.ย.
  const th = new RegExp(`${CUE_RE}\\s*(?:วัน\\S*\\s*)?(\\d{1,2})\\s*(${TH_MONTH_RE})\\s*(\\d{4})?${TIME_RE}`, 'gi');
  for (const m of t.matchAll(th)) candidates.push({ day: +m[1], month: monthIndex(m[2]), year: m[3] ? +m[3] : null, h: m[4], mi: m[5], ap: m[6] });

  // อังกฤษ: until November 18, 2025 at 10:15 AM · until Nov 18
  const en1 = new RegExp(`${CUE_RE}\\s*(?:\\w+day,?\\s*)?(${EN_MONTH_RE})\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?${TIME_RE}`, 'gi');
  for (const m of t.matchAll(en1)) candidates.push({ day: +m[2], month: monthIndex(m[1]), year: m[3] ? +m[3] : null, h: m[4], mi: m[5], ap: m[6] });

  // อังกฤษ: until 18 November 2025
  const en2 = new RegExp(`${CUE_RE}\\s*(\\d{1,2})\\s*(${EN_MONTH_RE})\\s*(\\d{4})?${TIME_RE}`, 'gi');
  for (const m of t.matchAll(en2)) candidates.push({ day: +m[1], month: monthIndex(m[2]), year: m[3] ? +m[3] : null, h: m[4], mi: m[5], ap: m[6] });

  const out = [];
  for (const c of candidates) {
    if (c.month < 0 || c.day < 1 || c.day > 31) continue;
    const hh = c.h != null ? hour24(c.h, c.ap) : 23;
    const mm = c.mi != null ? Number(c.mi) : 59;
    let year = c.year;
    if (year && year > 2400) year -= 543; // พ.ศ.
    if (!year) {
      // ไม่บอกปี = ครั้งถัดไปที่ถึงวันนั้น
      year = new Date(now + 7 * 3_600_000).getUTCFullYear();
      if (bangkokDate(year, c.month, c.day, hh, mm).getTime() < now) year += 1;
    }
    // 31 พ.ย. ไม่มีจริง — Date.UTC เลื่อนไปเดือนถัดไป ไม่ใช้
    const check = new Date(Date.UTC(year, c.month, c.day));
    if (check.getUTCMonth() !== c.month || check.getUTCDate() !== c.day) continue;
    out.push(bangkokDate(year, c.month, c.day, hh, mm));
  }

  // อีก 3 วัน · in 3 days
  const rel = t.match(/(?:อีก|ภายใน|in)\s*(\d{1,2})\s*(วัน|days?)/i);
  if (rel) out.push(new Date(now + Number(rel[1]) * 86_400_000));

  const valid = out.filter((d) => d.getTime() > now && d.getTime() <= now + MAX_AHEAD_DAYS * 86_400_000);
  if (!valid.length) return null;
  // หลายวันในหน้าเดียว (หลายข้อจำกัด) = ใช้วันที่ปลดช้าสุด
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

/** หน้าที่เครื่องโพสต์เปิดหาวันปลดล็อก ตามลำดับ (หน้าแรกที่อ่านวันได้ชนะ) */
const RESTRICTION_PAGES = [
  'https://www.facebook.com/account_status',
  'https://www.facebook.com/support',
];

module.exports = { parseRestrictionEnd, RESTRICTION_PAGES, MAX_AHEAD_DAYS };
