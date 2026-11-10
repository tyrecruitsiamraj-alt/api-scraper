/**
 * วางข้อความประกาศด้วยคลิปบอร์ดแทนการพิมพ์ทีละตัว (เจ้าของเคาะ 10 พ.ย. 2569)
 * เดิมพิมพ์ราว 2,000 ตัวอักษรต่อนาที — คนจริงที่โพสต์ประกาศยาว ๆ คัดลอกแล้ววาง
 *
 * คลิปบอร์ดของ Windows มีอันเดียวทั้งเครื่อง แต่เครื่องเปิด Chrome พร้อมกันได้หลายบัญชี
 * จึงต้องล็อกระหว่าง "เขียนคลิปบอร์ด → กดวาง" และตรวจว่าข้อความที่วางคือของงานนี้จริง (pastedMatches)
 */

/** ตัดช่องว่างทุกแบบออก — Facebook จัดบรรทัด/ช่องว่างใหม่ตอนวาง เทียบเฉพาะตัวอักษร */
function squash(text) {
  return String(text || '').replace(/\s+/g, '');
}

/**
 * ข้อความในช่องโพสต์หลังวาง ตรงกับประกาศของงานนี้ไหม
 * ต้องขึ้นต้นเหมือนกัน (กันวางข้อความของบัญชีอื่นที่แย่งคลิปบอร์ด) และยาวไม่น้อยกว่า 90%
 */
function pastedMatches(editorText, caption) {
  const got = squash(editorText);
  const want = squash(caption);
  if (!want) return false;
  const head = want.slice(0, Math.min(40, want.length));
  return got.startsWith(head) && got.length >= want.length * 0.9 && got.length <= want.length * 1.1;
}

function isCaptionPasteEnabled(env = process.env) {
  return String(env.POST_CAPTION_PASTE ?? '1').trim() !== '0';
}

module.exports = { pastedMatches, isCaptionPasteEnabled };
