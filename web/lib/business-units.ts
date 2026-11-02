/**
 * รหัสธุรกิจ (แผนก) ที่ใช้ร่วมกับ Jarvis — ตรงกับ jarvis_rm.users.department_code
 * ใช้ติดป้ายว่ากลุ่ม Facebook / ใบงาน เป็นของธุรกิจไหน เพื่อนับการใช้งานต่อแผนกได้
 */
export const BUSINESS_UNITS = [
  { code: 'LBD', label: 'LBD · พนักงานขับรถ Valet' },
  { code: 'LBA', label: 'LBA · ธุรการ ช่าง IT' },
  { code: 'LM', label: 'LM · ดูแลสวน' },
  { code: 'DS', label: 'DS' },
  { code: 'SN', label: 'SN' },
] as const;

export type BusinessUnitCode = (typeof BUSINESS_UNITS)[number]['code'];

export function isBusinessUnit(value: string): value is BusinessUnitCode {
  return BUSINESS_UNITS.some((u) => u.code === value);
}

/** ป้ายสั้นสำหรับแสดงในรายการ — คืนรหัสเดิมถ้าไม่รู้จัก */
export function businessUnitLabel(code: string | null | undefined): string | null {
  const c = String(code ?? '').trim();
  if (!c) return null;
  return BUSINESS_UNITS.find((u) => u.code === c)?.label ?? c;
}
