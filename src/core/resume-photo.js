/**
 * รูปหน้าผู้สมัครจากไฟล์เรซูเม่ที่อัปโหลด (เจ้าของ 19 พ.ย. 2569: อ่านผ่านแล้วฟอร์มไม่มีรูป)
 * ให้โมเดลในบริษัทที่ดูรูปได้บอกกรอบรูปคน แล้วตัดเฉพาะกรอบนั้น · หาไม่เจอ/กรอบแปลก = ไม่ใส่รูป (ไม่ทำให้การอ่านล้ม)
 * ทดลองเรซูเม่รูปจริง: qwen3.5:9b บอกกรอบตรงรูปคนพอดี (พิกัด 0–1000 ของกว้าง/สูง)
 */
import { ollamaBase, photoModel } from './ai-models.js';
import { cropImage } from './image-strips.js';

const PROMPT =
  'This is a job resume. Find the applicant\'s portrait photo (the picture of the person). ' +
  'Reply JSON only: {"found": true|false, "box": [x1, y1, x2, y2]} where coordinates are integers 0-1000 relative to image width and height.';

/** กรอบจากคำตอบ AI · ใช้ไม่ได้ (ไม่เจอ/ไม่ใช่สัดส่วนรูปคน/เล็กหรือใหญ่เกิน) = null */
export function parsePhotoBox(reply) {
  const s = String(reply ?? '');
  if (/"found"\s*:\s*false/i.test(s)) return null;
  const m = /\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/.exec(s);
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  if ([x1, y1, x2, y2].some((v) => v < 0 || v > 1000) || x2 <= x1 || y2 <= y1) return null;
  const w = x2 - x1;
  const h = y2 - y1;
  const area = (w * h) / 1e6;
  // รูปคนในเรซูเม่: กินพื้นที่ 1–45% ของหน้า · ไม่ใช่แถบยาวบาง ๆ
  if (area < 0.01 || area > 0.45 || w / h > 3 || h / w > 4) return null;
  return [x1, y1, x2, y2];
}

/** รูปเรซูเม่ (ทั้งหน้า) → PNG รูปหน้าคน หรือ null */
export async function extractResumePhoto(pageImage) {
  const base = ollamaBase();
  const model = base ? await photoModel() : null;
  if (!model) return null;
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: { temperature: 0 },
        messages: [{ role: 'user', content: PROMPT, images: [Buffer.from(pageImage).toString('base64')] }],
      }),
    });
    if (!res.ok) return null;
    const box = parsePhotoBox((await res.json())?.message?.content);
    return box ? await cropImage(pageImage, box) : null;
  } catch (e) {
    console.warn(`  [resume-photo] หารูปหน้าคนไม่ได้: ${String(e?.message ?? e).slice(0, 120)}`);
    return null;
  }
}
