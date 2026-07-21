/**
 * "ค้นกว้าง กรองแม่น" — แก้ปัญหา ฟิลเตอร์ AND ซ้อนกันที่เว็บหางานแล้วเหลือ 0 คน
 * (พิสูจน์แล้ว: ตำแหน่งอย่างเดียว=125, ตำแหน่ง+จังหวัด=43, ซ้อนครบ=0-3)
 *
 * หลักการ: ส่งแค่ "ตำแหน่ง/คำค้น" ไปค้นที่เว็บ (ได้ volume เต็ม) แล้วเอาเงื่อนไข
 * อายุ/วุฒิ/จังหวัด/เพศ มากรองจากข้อมูลที่ parse ได้จากเรซูเม่จริงในระบบเราแทน
 * — แม่นกว่าเว็บด้วย (เว็บ JobThai กรองแค่ระดับภูมิภาค เรากรองถึงจังหวัด)
 *
 * นโยบายข้อมูลขาด: เรซูเม่ที่ "ไม่ระบุ" field ที่ใช้กรอง = ผ่าน (lenient)
 * ไม่งั้นจะทิ้งคนดีๆ ที่แค่กรอกประวัติไม่ครบ
 *
 * ปิดพฤติกรรมนี้ (กลับไปกรองที่เว็บแบบเดิม): STRICT_SITE_FILTERS=1
 */

const num = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** ระดับการศึกษา → อันดับ (สูงกว่า = มากกว่า) เพื่อเทียบ "ได้วุฒิขั้นต่ำตามที่ขอ" */
const EDU_RANKS = [
  [/ประถม/u, 1],
  [/ม\.?\s*ต้น|มัธยม.{0,6}ต้น/u, 2],
  [/ม\.?\s*ปลาย|มัธยม.{0,6}ปลาย|ปวช/u, 3],
  [/ปวส|อนุปริญญา/u, 4],
  [/ป\.?\s*ตรี|ปริญญาตรี|bachelor/iu, 5],
  [/ป\.?\s*โท|ปริญญาโท|master/iu, 6],
  [/ป\.?\s*เอก|ปริญญาเอก|doctor|ph\.?d/iu, 7],
];

function eduRank(text) {
  const t = String(text ?? '');
  let best = 0;
  for (const [re, rank] of EDU_RANKS) if (re.test(t) && rank > best) best = rank;
  return best; // 0 = ไม่รู้ระดับ
}

/** อายุของผู้สมัคร — จาก field age ตรงๆ หรือคำนวณจากปีเกิด (รองรับ พ.ศ.) */
function candidateAge(parsed) {
  const direct = num(parsed?.age);
  if (direct && direct >= 15 && direct <= 80) return direct;
  const m = String(parsed?.birth_date ?? '').match(/(\d{4})/);
  if (m) {
    let year = Number(m[1]);
    if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
    const age = new Date().getFullYear() - year;
    if (age >= 15 && age <= 80) return age;
  }
  return null;
}

/**
 * แยก criteria เป็น 2 ชั้น: ที่ส่งไปเว็บ (กว้าง) กับที่กรองในระบบ (แม่น)
 * @returns {{ siteCriteria: object, localFilters: object, active: boolean }}
 */
export function splitCriteria(criteria = {}) {
  if (process.env.STRICT_SITE_FILTERS === '1') {
    return { siteCriteria: { ...criteria }, localFilters: {}, active: false };
  }
  const {
    ageMin, ageMax, education, gender, province,
    ...siteCriteria
  } = criteria;
  const localFilters = {};
  if (num(ageMin)) localFilters.ageMin = num(ageMin);
  if (num(ageMax)) localFilters.ageMax = num(ageMax);
  if (String(education ?? '').trim()) localFilters.education = String(education).trim();
  if (String(gender ?? '').trim()) localFilters.gender = String(gender).trim();
  if (String(province ?? '').trim()) localFilters.province = String(province).trim();
  return { siteCriteria, localFilters, active: Object.keys(localFilters).length > 0 };
}

/**
 * เช็คเรซูเม่ที่ parse แล้ว กับเงื่อนไข local — คืน { ok, reason }
 * reason = เหตุผลที่ไม่ผ่าน (ไว้ log ให้คนอ่านรู้เรื่อง)
 */
export function matchesCriteria(parsed, filters = {}) {
  // อายุ
  if (filters.ageMin || filters.ageMax) {
    const age = candidateAge(parsed);
    if (age !== null) {
      if (filters.ageMin && age < filters.ageMin) return { ok: false, reason: `อายุ ${age} < ${filters.ageMin}` };
      if (filters.ageMax && age > filters.ageMax) return { ok: false, reason: `อายุ ${age} > ${filters.ageMax}` };
    }
  }
  // วุฒิ — ผ่านเมื่อวุฒิสูงสุดของผู้สมัคร >= ที่ขอ (ไม่รู้ระดับ = ผ่าน)
  if (filters.education) {
    const want = eduRank(filters.education);
    if (want > 0) {
      const texts = [
        ...(Array.isArray(parsed?.education) ? parsed.education.map((e) => JSON.stringify(e)) : []),
        parsed?.education_summary ?? '',
      ].join(' ');
      const got = eduRank(texts);
      if (got > 0 && got < want) return { ok: false, reason: `วุฒิต่ำกว่า${filters.education}` };
    }
  }
  // จังหวัด (จากที่อยู่ในเรซูเม่ — ไม่ระบุ = ผ่าน)
  if (filters.province) {
    const p = String(parsed?.province ?? '').trim();
    if (p && p !== filters.province) return { ok: false, reason: `อยู่${p} ไม่ใช่${filters.province}` };
  }
  // เพศ
  if (filters.gender) {
    const g = String(parsed?.gender ?? '').trim();
    const wantF = /หญิง|^f$/iu.test(filters.gender);
    const wantM = /ชาย|^m$/iu.test(filters.gender);
    if (g) {
      const isF = /หญิง/u.test(g);
      const isM = /ชาย/u.test(g) && !isF;
      if (wantF && isM) return { ok: false, reason: 'เพศชาย (ขอหญิง)' };
      if (wantM && isF) return { ok: false, reason: 'เพศหญิง (ขอชาย)' };
    }
  }
  return { ok: true, reason: '' };
}
