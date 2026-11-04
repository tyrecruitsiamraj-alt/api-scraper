/**
 * ประเภทกลุ่ม Facebook ตามลูกค้าที่ใช้โพสต์ — ไม่ใช่ธุรกิจ (LBD/LBA/LM) แต่เป็นชุดกลุ่ม
 * 'private' เอกชน = กลุ่มชุดเดิม 37 กลุ่ม · 'government' ราชการ = นำเข้าจากชีต "ราชการ" ของทีม Online (4 พ.ย. 2569)
 * ไฟล์นี้ไม่มี server-only เพื่อให้ component ฝั่ง client ใช้รายการได้
 */
export const GROUP_SECTORS = [
  { code: 'private', label: 'เอกชน' },
  { code: 'government', label: 'ราชการ' },
] as const;
export type GroupSector = (typeof GROUP_SECTORS)[number]['code'];
export function isGroupSector(value: string): value is GroupSector {
  return GROUP_SECTORS.some((s) => s.code === value);
}
export function groupSectorLabel(code: string | null | undefined): string {
  return GROUP_SECTORS.find((s) => s.code === code)?.label ?? 'เอกชน';
}
