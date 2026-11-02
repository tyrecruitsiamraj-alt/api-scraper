/**
 * ผลล่าสุดของ "บัญชี × กลุ่ม Facebook" → สถานะที่คนเลือกกลุ่มต้องรู้ก่อนสั่งโพสต์
 * ใช้ร่วมกัน: หน้า "กลุ่มที่ต้องจัดการเอง" ของ So Scraping และข้อมูลที่ส่งให้ป๊อปสั่งโพสต์ของ Jarvis
 * (เจ้าของ 2 พ.ย. 2569: เลือกจาก Jarvis ต้องรู้ว่ากลุ่มไหนแอดมินพัก / ต้องเข้าเอง ไม่งั้นเลือกไปก็ไม่ได้โพสต์)
 *
 * แหล่งข้อมูล: run_logs แถวล่าสุดของคู่ (user_id, group_id) ที่ level = success | warn
 *   + post_logs ของครั้งนั้น (post_link, post_status)
 */

/** หน้ากลุ่มบอกว่าแอดมินพักกลุ่ม — ติดทุกบัญชี ไม่ใช่ที่บัญชีเรา ("ผู้ดูแลพักกลุ่มนี้ชั่วคราวเมื่อ …") */
const GROUP_PAUSED = /พักกลุ่ม|paused|archived/i;
/** หน้ากลุ่มเปิดไม่ได้สำหรับบัญชีนี้ ("เนื้อหานี้ไม่พร้อมใช้งานในขณะนี้") — อาจถูกลบหรือบัญชีนี้ถูกบล็อก บอกไม่ได้ว่าทุกบัญชีติด */
const GROUP_UNAVAILABLE = /ปิด|ลบ|ไม่พร้อมใช้งาน|ไม่มีเนื้อหา|unavailable/i;
/** กล่องโพสต์ที่ Facebook ขอให้ตอบคำถามสมาชิกก่อน */
const MEMBERSHIP_QUESTIONS = /การตรวจสอบการเข้าร่วม|ตอบคำถามเหล่านี้|membership questions|answer (these|the) questions/i;
const JOIN_STATES = new Set(['questions', 'pending', 'limit', 'unknown']);

/**
 * คำบนจอ + ควรติ๊กให้ไหม (recommended) ของแต่ละสถานะ
 * recommended=false: ลองไปก็ไม่ได้โพสต์จนกว่าคนจะไปแก้ที่ Facebook
 */
export const GROUP_STATE = {
  ok: { label: 'โพสต์ได้', recommended: true },
  post_pending: { label: 'โพสต์ได้ แอดมินต้องอนุมัติโพสต์ก่อนขึ้น', recommended: true },
  unconfirmed: { label: 'โพสต์แล้วไม่เจอในกลุ่ม', recommended: true },
  failed: { label: 'ครั้งก่อนโพสต์ไม่สำเร็จ', recommended: true },
  limit: { label: 'ยังไม่ได้เข้ากลุ่ม ระบบจะกดเข้าร่วมให้รอบหน้า', recommended: true },
  never: { label: 'ยังไม่เคยลอง', recommended: true },
  admin_paused: { label: 'แอดมินพักกลุ่ม', recommended: false },
  questions: { label: 'ต้องเข้ากลุ่มเอง (มีคำถาม)', recommended: false },
  pending: { label: 'รอแอดมินรับเข้ากลุ่ม', recommended: false },
  unavailable: { label: 'บัญชีนี้เปิดกลุ่มไม่ได้', recommended: false },
  unknown: { label: 'เปิดกลุ่มแล้วไม่เจอช่องโพสต์', recommended: false },
  rejected: { label: 'Facebook ไม่รับโพสต์', recommended: false },
};

/** ข้อความที่อ่านจากหน้ากลุ่ม (หลัง "หน้ากลุ่มเขียนว่า:") ตัด "(กลุ่ม 123)" ท้ายออก */
function pageHint(message) {
  return String(message ?? '').split('หน้ากลุ่มเขียนว่า:')[1]?.replace(/\(กลุ่ม \d+\)\s*$/, '').trim() ?? '';
}

/**
 * @param {{ level: string, message?: string|null, kind?: string|null, join_state?: string|null,
 *           fb_message?: string|null, post_link?: string|null, post_status?: string|null, group_id: string }} row
 * @returns {{ state: keyof typeof GROUP_STATE, detail: string|null, url: string }}
 */
export function classifyGroupOutcome(row) {
  const groupUrl = `https://www.facebook.com/groups/${row.group_id}`;
  const link = String(row.post_link ?? '').trim();
  if (row.level === 'success') {
    if (row.post_status === 'รออนุมัติ') return { state: 'post_pending', detail: null, url: link || groupUrl };
    if (link) return { state: 'ok', detail: null, url: link };
    return { state: 'unconfirmed', detail: null, url: `${groupUrl}/my_posted_content` };
  }
  if (row.kind === 'join' && row.join_state && JOIN_STATES.has(row.join_state)) {
    if (row.join_state === 'unknown') {
      // ข้อความหน้ากลุ่มบางทีเป็นแค่คำอธิบายความเป็นส่วนตัว — นับว่าพักกลุ่มเฉพาะที่บอกเหตุจริง
      const hint = pageHint(row.message);
      if (GROUP_PAUSED.test(hint)) return { state: 'admin_paused', detail: hint, url: groupUrl };
      if (GROUP_UNAVAILABLE.test(hint)) return { state: 'unavailable', detail: hint, url: groupUrl };
      return { state: 'unknown', detail: null, url: groupUrl };
    }
    return { state: /** @type {'questions'|'pending'|'limit'} */ (row.join_state), detail: null, url: groupUrl };
  }
  if (row.kind === 'post_rejected') {
    // กดโพสต์แล้ว Facebook เด้งกล่อง "การตรวจสอบการเข้าร่วม … ตอบคำถามเหล่านี้" = ต้องให้คนเข้าไปตอบคำถามเอง
    // ไม่ใช่ Facebook ไม่รับเนื้อหา (เจอจริง กลุ่ม 792186948245459, 30 ต.ค.–2 พ.ย. 2569)
    if (MEMBERSHIP_QUESTIONS.test(row.fb_message ?? '')) return { state: 'questions', detail: null, url: groupUrl };
    return { state: 'rejected', detail: row.fb_message ?? null, url: groupUrl };
  }
  return { state: 'failed', detail: null, url: groupUrl };
}
