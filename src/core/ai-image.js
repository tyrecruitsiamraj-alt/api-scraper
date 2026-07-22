import { envString } from '../config.js';

/**
 * AI image generation — pluggable adapter. Default = OpenAI gpt-image
 * (`OPENAI_API_KEY`). คืน image bytes (Buffer) + mime → ผู้เรียกเก็บลง
 * campaign_contents.image_bytes.
 *
 * ไม่มี OPENAI_API_KEY = คืน null เงียบ ๆ (draft ยังมี caption/brief ได้ แค่ไม่มีรูป).
 * ไม่เพิ่ม dependency — ใช้ global fetch (Node 18+). เพิ่ม provider ใหม่ได้โดยเติม
 * adapter ใน ADAPTERS แล้วตั้ง env CONTENT_IMAGE_PROVIDER.
 */

/** OpenAI Images API (gpt-image-1) — คืน { bytes, mime } หรือ null. */
async function openaiAdapter({ prompt, apiKey, transparent }) {
  const model = envString('CONTENT_IMAGE_MODEL', 'gpt-image-1');
  const size = envString('CONTENT_IMAGE_SIZE', '1024x1024');
  const payload = { model, prompt, size, n: 1 };
  // โหมดรูปคน diecut สำหรับวางบนโปสเตอร์ (gpt-image-1 เท่านั้น; dall-e ไม่รองรับ)
  if (transparent && /^gpt-image/i.test(model)) payload.background = 'transparent';
  // dall-e-* คืน URL เป็น default → ต้องขอ b64_json ชัด ๆ; gpt-image-1 คืน b64 เสมอ (และไม่รับ param นี้)
  if (/^dall-e/i.test(model)) payload.response_format = 'b64_json';
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI images ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI images: no b64_json in response');
  return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png' };
}

const ADAPTERS = {
  openai: { keyEnv: 'OPENAI_API_KEY', run: openaiAdapter },
};

/**
 * @param {{ prompt: string, transparent?: boolean }} args
 *   transparent = รูปคนพื้นหลังใส (diecut) สำหรับประกอบโปสเตอร์
 * @returns {Promise<null | { bytes: Buffer, mime: string, provider: string, model: string }>}
 */
export async function generateImage({ prompt, transparent = false } = {}) {
  const p = String(prompt ?? '').trim();
  if (!p) return null;

  const providerName = envString('CONTENT_IMAGE_PROVIDER', 'openai');
  const adapter = ADAPTERS[providerName];
  if (!adapter) {
    console.warn(`  [ai-image] ไม่รู้จัก provider "${providerName}" — ข้ามการสร้างรูป`);
    return null;
  }
  const apiKey = envString(adapter.keyEnv);
  if (!apiKey) return null; // feature off — ไม่มี key

  try {
    const r = await adapter.run({ prompt: p, apiKey, transparent });
    if (!r?.bytes?.length) return null;
    return { ...r, provider: providerName, model: envString('CONTENT_IMAGE_MODEL', 'gpt-image-1') };
  } catch (e) {
    console.warn(`  [ai-image] สร้างรูปไม่สำเร็จ: ${e.message} — draft จะไม่มีรูป`);
    return null;
  }
}
