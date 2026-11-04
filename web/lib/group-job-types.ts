/**
 * ประเภทงานที่กลุ่ม Facebook รับโพสต์ — เลือกได้หลายอย่างต่อกลุ่ม (เจ้าของสั่ง 4 พ.ย. 2569)
 * เก็บในคอลัมน์เดิม groups.job_positions (jsonb array ที่ว่างอยู่ทุกกลุ่ม)
 * ไฟล์นี้ไม่มี server-only เพื่อให้ component ฝั่ง client ใช้รายการได้
 */
export const GROUP_JOB_TYPES = [
  'ช่าง',
  'ธุรการ',
  'ประชาสัมพันธ์',
  'ขับรถนายไทย',
  'ขับรถนายต่างชาติ',
  'ขับรถส่วนกลาง',
  'Valet',
] as const;
export type GroupJobType = (typeof GROUP_JOB_TYPES)[number];
export function isGroupJobType(value: string): value is GroupJobType {
  return (GROUP_JOB_TYPES as readonly string[]).includes(value);
}
/** อ่านค่าจากฐาน (อาจเป็นอะไรก็ได้) ให้เหลือเฉพาะประเภทที่รู้จัก เรียงตามรายการ */
export function normalizeGroupJobTypes(value: unknown): GroupJobType[] {
  const list = Array.isArray(value) ? value.map((v) => String(v).trim()) : [];
  return GROUP_JOB_TYPES.filter((t) => list.includes(t));
}
