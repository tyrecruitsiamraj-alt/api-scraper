/**
 * ธุรกิจ (BU) ที่ใช้แยกบัญชีและกลุ่ม Facebook — รหัสตรงกับ jarvis_rm.users.department_code
 * หน้าตั้งค่าแบ่งเป็นก้อนตามลำดับนี้ (เจ้าของสั่ง 2 พ.ย. 2569: LBD · LBA · LM)
 */
export const BUSINESS_UNITS = [
  { code: 'LBD', detail: 'พนักงานขับรถ · Valet' },
  { code: 'LBA', detail: 'ธุรการ · ประชาสัมพันธ์ · ช่าง · IT' },
  { code: 'LM', detail: 'ดูแลสวน · ภูมิทัศน์' },
] as const;

export type BusinessUnitCode = (typeof BUSINESS_UNITS)[number]['code'];

export function isBusinessUnit(value: string): value is BusinessUnitCode {
  return BUSINESS_UNITS.some((u) => u.code === value);
}

/** ชื่อที่แสดง — รหัสเดิม หรือ null ถ้าไม่ระบุ */
export function businessUnitLabel(code: string | null | undefined): string | null {
  const c = String(code ?? '').trim();
  return c || null;
}

/**
 * แบ่งรายการเป็นก้อนตามธุรกิจ — ทุก BU มีก้อนเสมอ (ว่างก็โชว์ 0)
 * ของที่ยังไม่ระบุธุรกิจ หรือรหัสที่ไม่อยู่ในรายการ รวมไว้ก้อนท้าย (มีเฉพาะตอนมีของ)
 */
export function groupByBusinessUnit<T>(items: T[], unitOf: (item: T) => string | null | undefined) {
  const known = BUSINESS_UNITS.map((u) => ({
    code: u.code as string | null,
    detail: u.detail as string,
    items: items.filter((i) => unitOf(i) === u.code),
  }));
  const rest = items.filter((i) => !isBusinessUnit(String(unitOf(i) ?? '')));
  return rest.length ? [...known, { code: null, detail: 'ยังไม่ได้เลือกธุรกิจ', items: rest }] : known;
}
