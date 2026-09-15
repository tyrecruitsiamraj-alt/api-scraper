/**
 * Operational lessons from scrape failures.
 * Stores cause + prevention only — never passwords, tokens, or resume PII.
 */

export const SCRAPE_FAILURE_LESSONS = [
  {
    key: 'jobbkk_employer_login',
    category: 'login',
    match: /employer session|employer_login|jobbkk-postlogin|#sign_in_emp/i,
    lesson: 'JobBKK หน้า login นายจ้างเป็น Ant Design ปุ่มเข้าสู่ระบบอยู่นอกฟอร์ม',
    prevention: 'กดปุ่มเข้าสู่ระบบของนายจ้าง (#username/#password) ห้ามกด Enter อย่างเดียวหรือปุ่มผู้สมัคร',
  },
  {
    key: 'jobbkk_readonly_placeholder_click',
    category: 'jobbkk_ui',
    match: /locator\.click: timeout 15000ms|getByPlaceholder|ค้นหาชื่อตำแหน่งงาน/i,
    lesson: 'ช่องตำแหน่ง JobBKK เป็น div readOnly มี placeholder ไม่ใช่ input',
    prevention: 'คลิกเฉพาะ input ที่พิมพ์ได้ใน Ant Select ห้ามคลิก wrapper ที่ readonly',
  },
  {
    key: 'jobthai_latest_sort',
    category: 'jobthai_ui',
    match: /ไม่ยืนยันการเรียง|วันที่แก้ไขล่าสุด|mainsort/i,
    lesson: 'JobThai บางหน้าไม่มี #mainsort แต่ยังมี Resume card',
    prevention: 'ขอ sort เริ่มต้นของ JobThai แล้วดึง card ต่อ ห้าม abort ทั้งงานเพราะไม่เจอกล่องเรียง',
  },
  {
    key: 'connector_daily_cap',
    category: 'quota',
    match: /daily cap reached|provider daily cap/i,
    lesson: 'โควต้า Connector รายวันเต็ม ทำให้งานขึ้นแดงทั้งที่ไม่เกี่ยวกับคำค้น',
    prevention: 'ตรวจ cap ก่อนเริ่มค้น ถ้าเต็มให้จบแบบโควต้า ไม่ไล่คลิกฟอร์มต่อ',
  },
  {
    key: 'jobbkk_filter_not_applied',
    category: 'jobbkk_ui',
    match: /jobbkk_filter_not_applied|ไม่ยืนยันตำแหน่งหรือ keyword/i,
    lesson: 'ชื่อตำแหน่งยาว/ไม่ตรงชิป ทำให้ไม่ยืนยันตัวกรองแล้วงานแดง',
    prevention: 'ย่อเนื้องานเป็นชิปสั้นในสายงานเดียวกันก่อนกรอก Normal Search',
  },
  {
    key: 'login_timeout',
    category: 'login',
    match: /เข้าสู่ระบบไม่สำเร็จภายใน|timeout:login|login_timeout/i,
    lesson: 'เข้าสู่ระบบไม่เสร็จภายในเวลา ทำให้ทั้งงานขึ้นแดง',
    prevention: 'จำกัดเวลา login แล้วปิดเบราว์เซอร์ ค่อยให้คิวเริ่มใหม่ ห้ามปล่อยงานค้างกำลังทำงาน',
  },
  {
    key: 'session_relogin_exhausted',
    category: 'login',
    match: /session_relogin_exhausted/i,
    lesson: 'session หลุดซ้ำจนครบโควต้า relogin แล้วยังเปิด Resume ไม่ได้',
    prevention: 'ปิดเบราว์เซอร์แล้ว login ใหม่แบบ takeover ห้ามดึง Resume ต่อบน session ที่หลุด',
  },
  {
    key: 'search_timeout',
    category: 'infra',
    match: /timeout:search/i,
    lesson: 'ค้นหาค้างจนหมดเวลา ทั้งที่เบราว์เซอร์ยังเปิดอยู่',
    prevention: 'ปิด Chromium เมื่อค้นหาหมดเวลา แล้วให้คิวเริ่มรอบใหม่ ห้ามปล่อยสถานะกำลังทำงานปลอม',
  },
  {
    key: 'local_filter_wipeout',
    category: 'yield',
    match: /ถูกคัดออกทั้งหมดด้วยเงื่อนไข/i,
    lesson: 'เว็บมี Resume แต่ถูกคัดออกทั้งหมดด้วยเงื่อนไขในระบบ',
    prevention: 'ค้นบนเว็บด้วยตำแหน่ง/คำค้นอย่างเดียว กรองอายุวุฒิเพศเงินเดือนในระบบ แล้วขยายคำในสายงานเดียวกันถ้าผ่าน 0',
  },
  {
    key: 'zero_qualified_yield',
    category: 'yield',
    match: /ผ่านเกณฑ์ 0|qualified 0/i,
    lesson: 'เปิด Resume แล้วผ่านเกณฑ์ 0 คน ทำให้การ์ดแดง/ยังไม่ครบเป้า',
    prevention: 'ห้ามวนคำค้นเดิมที่เปิดมากแล้วผ่าน 0 ให้ขยายตำแหน่ง 🟢 ใน Job Family เดียวกัน',
  },
];

const ZERO_YIELD_LESSON = SCRAPE_FAILURE_LESSONS.find((lesson) => lesson.key === 'zero_qualified_yield');

export function classifyScrapeFailure(error) {
  const text = String(error || '').trim();
  if (!text) return null;
  for (const lesson of SCRAPE_FAILURE_LESSONS) {
    if (lesson.match.test(text)) {
      return {
        key: lesson.key,
        category: lesson.category,
        lesson: lesson.lesson,
        prevention: lesson.prevention,
        signature: text.slice(0, 240),
      };
    }
  }
  return {
    key: 'scrape_unclassified',
    category: 'unknown',
    lesson: 'งานค้นหาล้มเหลวด้วยสาเหตุที่ยังไม่จัดหมวด',
    prevention: 'เก็บลายเซ็น error แล้วตรวจ Worker/หน้าเว็บก่อนกดรันซ้ำแบบเดา',
    signature: text.slice(0, 240),
  };
}

export function classifyScrapeOutcome({
  error = null,
  opened = 0,
  qualified = 0,
  rejected = 0,
} = {}) {
  if (error) {
    const hit = classifyScrapeFailure(error);
    if (hit?.key !== 'scrape_unclassified') return hit;
    if (opened > 0 && qualified === 0 && rejected > 0) {
      return toHit(ZERO_YIELD_LESSON, String(error).slice(0, 240));
    }
    return hit;
  }
  if (opened > 0 && qualified === 0 && rejected > 0) {
    return toHit(ZERO_YIELD_LESSON, `opened=${opened} qualified=0 rejected=${rejected}`);
  }
  return null;
}

function toHit(lesson, signature) {
  return {
    key: lesson.key,
    category: lesson.category,
    lesson: lesson.lesson,
    prevention: lesson.prevention,
    signature,
  };
}

export function rememberedPreventionLog(hits) {
  if (!hits?.length) return '  [lesson] ไม่มีบทเรียน scrape ที่บันทึกไว้';
  return hits.map((hit) => `  [lesson] จำแล้ว ${hit.key}: ${hit.prevention}`).join('\n');
}

export function lessonRowsToLogHits(rows) {
  if (!rows?.length) {
    return SCRAPE_FAILURE_LESSONS.map((lesson) => ({
      key: lesson.key,
      prevention: lesson.prevention,
    }));
  }
  return rows.map((row) => ({
    key: row.lesson_key || row.key,
    prevention: row.prevention,
  }));
}
