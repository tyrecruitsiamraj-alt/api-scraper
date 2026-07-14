import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * แปลง image_ref ของ job ให้เป็นไฟล์รูปในเครื่อง worker เพื่อ setInputFiles ตอนโพสต์ FB.
 *
 * รองรับ:
 *   - 'campaign-content:<uuid>' → ดึง bytes จาก "so-candidate-data".campaign_contents (DB เดียวกัน)
 *   - path ไฟล์ที่มีอยู่แล้ว → คืนตามเดิม
 *
 * ล้มเหลว/ไม่พบ = คืน null (โพสต์เป็นข้อความล้วนต่อได้ ไม่ทำให้ทั้งงานพัง).
 */
export async function resolveJobImage(imageRef?: string | null): Promise<string | null> {
  const ref = String(imageRef || '').trim();
  if (!ref) return null;

  // path ที่มีอยู่แล้ว (เผื่อกรอกไฟล์ตรง ๆ)
  if (!ref.includes(':') || /^[a-zA-Z]:[\\/]/.test(ref)) {
    return fs.existsSync(ref) ? ref : null;
  }

  const m = ref.match(/^campaign-content:([0-9a-f-]{36})$/i);
  if (!m) {
    console.warn(`[resolveJobImage] รูปแบบ image_ref ไม่รองรับ: ${ref}`);
    return null;
  }

  try {
    const db = require('../../server/db');
    const img = await db.getCampaignContentImage(m[1]);
    if (!img || !img.bytes) return null;
    const ext = img.mime === 'image/jpeg' ? 'jpg' : img.mime === 'image/webp' ? 'webp' : 'png';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopost-img-'));
    const file = path.join(dir, `campaign-${m[1]}.${ext}`);
    fs.writeFileSync(file, img.bytes);
    return file;
  } catch (e) {
    console.warn(`[resolveJobImage] ดึงรูปไม่สำเร็จ: ${(e as Error).message}`);
    return null;
  }
}
