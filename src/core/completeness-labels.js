// คำบอกว่าเรซูเม่ขาดอะไร — ใช้ทั้งเครื่อง Scrap และหน้าตรวจผู้สมัคร (ไม่ import อะไร เว็บดึงไปใช้ได้)

export const BODY_GAP_LABEL = {
  name: 'ชื่อ',
  gender: 'เพศ',
  age: 'อายุ',
  address: 'ที่อยู่หรือพื้นที่ทำงาน',
  education: 'การศึกษา',
  work_experience: 'ประวัติงาน',
};

export const ATTACHMENT_GAP_LABEL = {
  attachments_missing: 'ไม่มีไฟล์แนบ',
  attachments_incomplete: 'ไฟล์แนบโหลดได้ไม่ครบ',
  profile: 'รูปโปรไฟล์โหลดไม่ได้',
};

/** เหตุ incomplete:<ช่อง> และ incomplete_attachments:<เหตุ> เป็นคำ · เหตุอื่นคืน null */
export function completenessReasonLabel(reason) {
  const [kind, gap] = String(reason || '').split(':');
  if (kind === 'incomplete') return `เรซูเม่ไม่มี${BODY_GAP_LABEL[gap] || gap}`;
  if (kind === 'incomplete_attachments') return ATTACHMENT_GAP_LABEL[gap] || 'ไฟล์แนบไม่ครบ';
  return null;
}
