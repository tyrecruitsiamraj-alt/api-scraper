/**
 * รูปแนบโพสต์จาก Jarvis (เจ้าของ Jarvis 17 พ.ย. 2569 "คนอยากโพสต์พร้อมรูป")
 *
 * Jarvis ส่ง job_snapshot.image_url = ลิงก์รูปบนเว็บ Jarvis (`/api/public/post-image?id=<uuid>`) มากับใบสั่งแบบ "ข้อความ + รูป"
 * ระบบนี้เก็บลิงก์ไว้ที่ jobs.image_ref แล้ว worker ดาวน์โหลดตอนโพสต์ (resolveJobImage)
 * รับเฉพาะ https + โฮสต์ที่อนุญาต (ค่าเริ่ม jarvis.siamrajathanee.dev · เพิ่มได้ที่ JARVIS_IMAGE_HOSTS คั่นด้วย ,)
 * ห้ามโพสต์ข้อความล้วนแทนเมื่อใบสั่งบอกว่ามีรูป — รูปมาไม่ได้ = งานล้ม ให้คนเห็น
 *
 * ไฟล์ CJS ไม่มี dependency — เทสต์ได้ด้วย node --test
 */

const DEFAULT_HOSTS = ['jarvis.siamrajathanee.dev'];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowedHosts(env = process.env) {
  const extra = String(env.JARVIS_IMAGE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_HOSTS, ...extra])];
}

/** ลิงก์รูปจาก Jarvis ที่ใช้ได้ หรือ null (ไม่ใช่ https / โฮสต์ไม่อนุญาต / รูปแบบผิด) */
function jarvisImageUrl(raw, env = process.env) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!allowedHosts(env).includes(u.hostname.toLowerCase())) return null;
  if (u.pathname !== '/api/public/post-image' || !ID.test(u.searchParams.get('id') || '')) return null;
  return u.toString();
}

/** แบบโพสต์จาก Jarvis โพสต์ได้ไหม — คืนปัญหาเป็นภาษาคน หรือ null */
function postModeIssue(postMode, imageUrl) {
  const mode = String(postMode || 'caption_only');
  if (mode === 'caption_only') return null;
  if (mode === 'caption_image') return imageUrl ? null : 'ใบสั่งแบบ "ข้อความ + รูป" ยังไม่ได้แนบรูปใน Jarvis';
  if (mode === 'image_only') return imageUrl ? null : 'ใบสั่งแบบ "รูปอย่างเดียว" ยังไม่ได้แนบรูปใน Jarvis';
  return `ไม่รู้จักแบบโพสต์ "${mode}"`;
}

/** image_ref ที่จะเก็บที่ jobs — มีรูปเฉพาะแบบ "ข้อความ + รูป" / "รูปอย่างเดียว" */
function imageRefFor(postMode, imageUrl) {
  const mode = String(postMode || '');
  return (mode === 'caption_image' || mode === 'image_only') && imageUrl ? imageUrl : null;
}

/** "รูปอย่างเดียว" = โพสต์แค่รูป ไม่มีข้อความ ไม่ตรวจข้อความ ไม่แทน/ต่อท้ายลิงก์สมัคร */
function isImageOnly(postMode) {
  return String(postMode || '') === 'image_only';
}

module.exports = { jarvisImageUrl, postModeIssue, imageRefFor, isImageOnly, allowedHosts };
