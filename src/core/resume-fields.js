/**
 * ช่องข้อมูลผู้สมัครที่คนเห็น/แก้ได้ — ใช้ร่วมกันทั้งตารางเทียบตอนอัปโหลดเรซูเม่ซ้ำ และฟอร์มแก้ไขผู้สมัคร
 * (เจ้าของ 12 พ.ย. 2569: อัปโหลดเรซูเม่ · คนที่มีในระบบแล้วให้เห็นเฉพาะช่องที่ต่าง แล้วติ๊กเลือกทีละช่อง)
 */

/** ช่องข้อความ (คอลัมน์ใน candidates) */
export const TEXT_FIELDS = [
  { key: 'prefix', label: 'คำนำหน้า' },
  { key: 'first_name', label: 'ชื่อ' },
  { key: 'last_name', label: 'นามสกุล' },
  { key: 'full_name', label: 'ชื่อ-นามสกุล' },
  { key: 'phone', label: 'เบอร์โทร' },
  { key: 'email', label: 'อีเมล' },
  { key: 'line_id', label: 'LINE' },
  { key: 'gender', label: 'เพศ' },
  { key: 'age', label: 'อายุ' },
  { key: 'birth_date', label: 'วันเกิด' },
  { key: 'nationality', label: 'สัญชาติ' },
  { key: 'religion', label: 'ศาสนา' },
  { key: 'height', label: 'ส่วนสูง' },
  { key: 'weight', label: 'น้ำหนัก' },
  { key: 'marital_status', label: 'สถานภาพ' },
  { key: 'military_status', label: 'การเกณฑ์ทหาร' },
  { key: 'driving_license', label: 'ใบขับขี่' },
  { key: 'address', label: 'ที่อยู่' },
  { key: 'province', label: 'จังหวัด' },
  { key: 'desired_positions', label: 'ตำแหน่งที่ต้องการ' },
  { key: 'expected_salary', label: 'เงินเดือนที่ต้องการ' },
  { key: 'intro', label: 'แนะนำตัว' },
];

/** ช่องรายการ (jsonb) */
export const LIST_FIELDS = [
  { key: 'education', label: 'การศึกษา' },
  { key: 'work_experience', label: 'ประสบการณ์ทำงาน' },
  { key: 'hard_skills', label: 'ทักษะเฉพาะทาง' },
  { key: 'soft_skills', label: 'ทักษะทั่วไป' },
  { key: 'language_skills', label: 'ภาษา' },
];

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** รายการ jsonb เป็นข้อความบรรทัดเดียวต่อรายการ ไว้โชว์ในตารางเทียบ */
export function listLines(key, value) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((x) => {
      if (typeof x === 'string') return clean(x);
      if (!x || typeof x !== 'object') return '';
      if (key === 'education') return [x.degree, x.major, x.institution, x.graduation_year].map(clean).filter(Boolean).join(' · ');
      if (key === 'work_experience') return [x.position, x.company, x.period].map(clean).filter(Boolean).join(' · ');
      if (key === 'language_skills') return [x.language ?? x.name, x.level].map(clean).filter(Boolean).join(' · ');
      return clean(x.name ?? x.skill ?? '');
    })
    .filter(Boolean);
}

/** เบอร์เทียบกันที่ตัวเลข 9 หลักท้าย (081… กับ +6681… คือเบอร์เดียวกัน) */
function sameValue(key, a, b) {
  if (key === 'phone') {
    const d = (v) => String(v ?? '').replace(/\D/g, '').slice(-9);
    return d(a) === d(b);
  }
  if (key === 'email') return clean(a).toLowerCase() === clean(b).toLowerCase();
  return clean(a) === clean(b);
}

/**
 * ช่องที่ข้อมูลใหม่จากไฟล์ต่างจากที่มีในระบบ (ข้อมูลใหม่ว่าง = ไม่นับ เพราะไม่มีอะไรให้เลือก)
 * @returns {{ key: string, label: string, kind: 'text'|'list', current: string[], incoming: string[] }[]}
 */
export function diffCandidate(current, incoming) {
  const out = [];
  for (const f of TEXT_FIELDS) {
    const next = clean(incoming?.[f.key]);
    if (!next || sameValue(f.key, current?.[f.key], next)) continue;
    out.push({ key: f.key, label: f.label, kind: 'text', current: clean(current?.[f.key]) ? [clean(current?.[f.key])] : [], incoming: [next] });
  }
  for (const f of LIST_FIELDS) {
    const next = listLines(f.key, incoming?.[f.key]);
    if (!next.length) continue;
    const cur = listLines(f.key, current?.[f.key]);
    if (cur.join('\n') === next.join('\n')) continue;
    out.push({ key: f.key, label: f.label, kind: 'list', current: cur, incoming: next });
  }
  return out;
}
