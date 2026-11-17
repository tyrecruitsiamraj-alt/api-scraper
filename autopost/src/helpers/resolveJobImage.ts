import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * แปลง image_ref ของ job ให้เป็นไฟล์รูปในเครื่อง worker เพื่อ setInputFiles ตอนโพสต์ FB.
 *
 * รองรับ:
 *   - 'campaign-content:<uuid>' → ดึง bytes จาก "so-candidate-data".campaign_contents (DB เดียวกัน)
 *   - path ไฟล์ที่มีอยู่แล้ว → คืนตามเดิม
 *   - 'https://<Jarvis>/api/public/post-image?id=<uuid>' → ดาวน์โหลดรูปที่คนแนบในป๊อป Autopost ของ Jarvis (17 พ.ย. 2569)
 *     รับเฉพาะโฮสต์ที่อนุญาต (server/jarvis-post-image.js) · ดาวน์โหลดไม่ได้ = งานล้ม ไม่โพสต์ข้อความล้วนแทน
 *
 * ล้มเหลวของ campaign-content ห้ามโพสต์ข้อความล้วนแทนรูป เพราะจะได้ประกาศผิด.
 */
export async function resolveJobImage(imageRef?: string | null): Promise<string | null> {
  const ref = String(imageRef || '').trim();
  if (!ref) return null;

  if (/^https:\/\//i.test(ref)) return downloadJarvisImage(ref);

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
    if (!img || !img.bytes) {
      throw new Error('ไม่พบรูปโปสเตอร์ของงานนี้ ห้ามโพสต์ข้อความล้วนแทน');
    }
    const ext = img.mime === 'image/jpeg' ? 'jpg' : img.mime === 'image/webp' ? 'webp' : 'png';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopost-img-'));
    const file = path.join(dir, `campaign-${m[1]}.${ext}`);
    fs.writeFileSync(file, img.bytes);
    return file;
  } catch (e) {
    console.warn(`[resolveJobImage] ดึงรูปไม่สำเร็จ: ${(e as Error).message}`);
    throw e;
  }
}

const JARVIS_IMAGE_MAX_BYTES = 5_000_000;

async function downloadJarvisImage(ref: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { jarvisImageUrl } = require('../../server/jarvis-post-image') as { jarvisImageUrl: (raw: unknown) => string | null };
  const url = jarvisImageUrl(ref);
  if (!url) throw new Error(`ลิงก์รูปไม่ใช่ของ Jarvis หรือรูปแบบผิด: ${ref}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ดาวน์โหลดรูปจาก Jarvis ไม่ได้ (${res.status}) ห้ามโพสต์ข้อความล้วนแทน`);
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error(`ไฟล์จาก Jarvis ไม่ใช่รูป (${mime || 'ไม่รู้ชนิด'})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > JARVIS_IMAGE_MAX_BYTES) throw new Error('รูปจาก Jarvis ว่างหรือใหญ่เกิน');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopost-img-'));
  const file = path.join(dir, `jarvis-${new URL(url).searchParams.get('id')}.${ext}`);
  fs.writeFileSync(file, bytes);
  return file;
}
