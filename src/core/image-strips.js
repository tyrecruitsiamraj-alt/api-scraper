/**
 * ตัดรูปเอกสารเป็นแถบแนวนอน (ให้โมเดลอ่านรูปอ่านทีละช่วง)
 * ใช้ Chromium ของ Playwright ที่เครื่อง Scrap มีอยู่แล้ว — ไม่ต้องลงไลบรารีรูปเพิ่มบน RM009
 */

/** ชนิดรูปจากหัวไฟล์ (ชื่อไฟล์/ชนิดที่ส่งมาอาจไม่ตรง) */
export function imageMime(buffer) {
  const b = Buffer.from(buffer ?? []);
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  return 'image/png';
}

/** ขอบบน-ล่างของแต่ละแถบ (ซ้อนกันเล็กน้อย กันบรรทัดที่อยู่ตรงรอยตัดหาย) */
export function stripBounds(height, count, overlapRatio = 0.04) {
  const n = Math.max(1, Math.floor(count));
  const step = Math.ceil(height / n);
  const overlap = Math.round(height * overlapRatio);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const top = Math.max(0, i * step - overlap);
    const bottom = Math.min(height, (i + 1) * step + overlap);
    if (bottom > top) out.push({ top, height: bottom - top });
  }
  return out;
}

/** รูป → PNG ทีละแถบ · count แถบ */
export async function splitImageStrips(buffer, count = 3) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  try {
    const page = await browser.newPage();
    const dataUrl = `data:${imageMime(buffer)};base64,${Buffer.from(buffer).toString('base64')}`;
    const height = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      window.__img = img;
      return img.naturalHeight;
    }, dataUrl);
    const parts = await page.evaluate((strips) => {
      const img = window.__img;
      const w = img.naturalWidth;
      return strips.map((s) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = s.height;
        canvas.getContext('2d').drawImage(img, 0, s.top, w, s.height, 0, 0, w, s.height);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    }, stripBounds(height, count));
    return parts.map((b64) => Buffer.from(b64, 'base64'));
  } finally {
    await browser.close().catch(() => {});
  }
}
