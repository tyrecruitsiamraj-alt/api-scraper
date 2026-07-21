import Anthropic from '@anthropic-ai/sdk';
import { envString } from '../config.js';

/**
 * Content generation (text) — Claude คิด "โพสต์สรรหา" ให้ 1 ใบขอที่หาคนไม่ได้:
 *   - caption โพสต์ Facebook (ภาษาไทย พร้อม emoji + hashtag ในตัว)
 *   - video_brief สั้น ๆ (แนวคลิปสำหรับทีมครีเอทีฟถ่ายต่อ)
 *   - image_prompt (อังกฤษ) ส่งต่อให้โมเดลสร้างรูป (ai-image.js)
 *
 * Reuse pattern เดียวกับ src/core/job-family.js — structured tool output +
 * envString('ANTHROPIC_API_KEY'). ไม่มี key = คืน null เงียบ ๆ (feature ปิดตัวเอง
 * ไม่ทำให้ worker/campaign พัง). เป็น pure caller — ไม่แตะ DB.
 */

const SYSTEM = `คุณคือนักการตลาดสรรหาบุคลากร (recruitment marketer) ของบริษัท Outsource ไทย
หน้าที่: เขียน "โพสต์ประกาศรับสมัครงาน" ให้ดึงดูดผู้สมัครสำหรับ 1 ตำแหน่งที่บริษัทกำลังหาคนไม่ได้

## หลักการเขียน caption (Facebook)
- ภาษาไทย เป็นกันเอง น่าเชื่อถือ กระตุ้นให้ทัก/สมัคร
- ขึ้นต้นด้วยหัวเรื่องสะดุดตา (เปิดรับสมัคร + ตำแหน่ง) ใช้ emoji พองาม
- ระบุ: ตำแหน่ง, สถานที่/จังหวัดทำงาน, จำนวนที่รับ (ถ้ามี), จุดขาย (เช่น มีสวัสดิการ/เริ่มงานได้เลย)
- ปิดท้ายด้วย call-to-action ชัดเจน ("สนใจทักแชทได้เลย" / "สมัครด่วน") + hashtag 3–6 อันที่เกี่ยวข้อง
- ห้ามแต่งเงินเดือน/สวัสดิการที่ไม่มีในข้อมูล ถ้าไม่รู้ให้ใช้คำกลาง ๆ ("สวัสดิการตามโครงสร้างบริษัท")
- ความยาวพอเหมาะกับโพสต์ FB (ไม่ยาวเกินไป)

## video_brief
- ไอเดียคลิปสั้น (15–30 วิ) 2–4 บรรทัด: มุมภาพ/ข้อความบนจอ/โทน — ให้ทีมถ่ายทำต่อได้ทันที

## image_prompt (ภาษาอังกฤษ)
- คำสั่งสร้างภาพโปสเตอร์รับสมัครงาน 1 ย่อหน้า: บรรยากาศงานจริงของตำแหน่งนั้น, โทนสุภาพมืออาชีพ,
  มีที่ว่างสำหรับใส่ข้อความ, ไม่มีตัวหนังสือในรูป (no text/letters), สมจริงแบบภาพถ่าย`;

const TOOL = {
  name: 'recruit_content',
  description: 'ส่งร่างคอนเทนต์สรรหา: caption + แนววิดีโอ + prompt สร้างรูป',
  input_schema: {
    type: 'object',
    properties: {
      caption: { type: 'string', description: 'แคปชันโพสต์ Facebook ภาษาไทย พร้อม emoji + hashtag ในตัว' },
      video_brief: { type: 'string', description: 'แนวคลิปสั้น 2–4 บรรทัด สำหรับทีมถ่ายทำ' },
      image_prompt: { type: 'string', description: 'prompt ภาษาอังกฤษสำหรับสร้างรูปโปสเตอร์ (no text in image)' },
    },
    required: ['caption', 'video_brief', 'image_prompt'],
  },
};

/**
 * @param {{ title?:string, positions?:string, province?:string, qty?:number,
 *   remaining_qty?:number, snapshot?:Record<string,any>,
 *   winningExamples?: string[] }} campaign
 *   winningExamples = แคปชันที่เคยได้ engagement สูง (จาก content_winning_patterns)
 *   ใส่เป็นแรงบันดาลใจให้ AI คิดตามแนวที่เคยเวิร์ค — ไม่มีก็ gen ได้ปกติ
 * @returns {Promise<null | { caption:string, videoBrief:string, imagePrompt:string, model:string }>}
 */
export async function generateContent(campaign = {}) {
  // เลือก AI ที่ใช้คิดข้อความ: 'anthropic' (Claude), 'openai' (GPT — ใช้ key เดียวกับที่สร้างรูป)
  // หรือ 'ollama' (server บริษัท ฟรี ไม่ต้อง key). ไม่ตั้ง CONTENT_TEXT_PROVIDER = เลือกอัตโนมัติ
  // ตามลำดับ: anthropic → openai → ollama → ปิด
  const apiKey = envString('ANTHROPIC_API_KEY');
  const openaiKey = envString('OPENAI_API_KEY');
  const ollamaBase = envString('OLLAMA_BASE_URL');
  const provider = envString(
    'CONTENT_TEXT_PROVIDER',
    apiKey ? 'anthropic' : openaiKey ? 'openai' : ollamaBase ? 'ollama' : ''
  );
  if (!provider) return null; // feature off — ไม่มีทั้ง key และ ollama
  if (provider === 'anthropic' && !apiKey) return null;
  if (provider === 'openai' && !openaiKey) return null;
  if (provider === 'ollama' && !ollamaBase) return null;

  const snap = campaign.snapshot ?? {};
  const position = String(campaign.title || snap.request_name || snap.job_description_name || '').trim();
  if (!position) return null; // ไม่มีตำแหน่งให้คิด

  const ctx = [
    `ตำแหน่ง/งาน: ${position}`,
    campaign.province || snap.site_name ? `สถานที่ทำงาน: ${campaign.province || snap.site_name}` : '',
    snap.work_addr ? `ที่อยู่ไซต์งาน: ${snap.work_addr}` : '',
    campaign.qty ? `จำนวนที่รับ: ${campaign.qty}` : '',
    campaign.remaining_qty ? `ยังขาดอีก: ${campaign.remaining_qty} คน` : '',
    snap.department_code ? `แผนก: ${snap.department_code}` : '',
  ].filter(Boolean).join('\n');

  // แนวที่เคยเวิร์ค (engagement สูง) — ให้เป็นแรงบันดาลใจ ไม่ใช่ลอก
  const wins = (campaign.winningExamples ?? [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const winsBlock = wins.length
    ? `\n\nแคปชันที่เคยได้ผลดี (คนสนใจเยอะ) — ใช้เป็นแนวทางโทน/โครงสร้าง ห้ามลอกคำต่อคำ:\n` +
      wins.map((w, i) => `ตัวอย่าง ${i + 1}:\n${w}`).join('\n---\n')
    : '';

  const userMsg = `เขียนคอนเทนต์สรรหาสำหรับใบขอนี้:\n${ctx}${winsBlock}`;

  let out = null;
  let modelUsed = '';
  try {
    if (provider === 'ollama') {
      ({ out, modelUsed } = await callOllama({ base: ollamaBase, userMsg }));
    } else if (provider === 'openai') {
      ({ out, modelUsed } = await callOpenAI({ apiKey: openaiKey, userMsg }));
    } else {
      ({ out, modelUsed } = await callAnthropic({ apiKey, userMsg }));
    }
  } catch (e) {
    console.warn(`  [content-gen] AI call failed (${provider}): ${e.message} — ข้ามการคิด content`);
    return null;
  }

  const caption = String(out?.caption ?? '').trim();
  if (!caption) {
    console.warn(`  [content-gen] AI (${provider}) คืนผลไม่ถูกรูปแบบ (caption ว่าง) — ข้าม`);
    return null;
  }

  return {
    caption,
    videoBrief: String(out.video_brief ?? '').trim(),
    imagePrompt: String(out.image_prompt ?? '').trim(),
    model: modelUsed,
  };
}

/** Claude — structured tool output (พฤติกรรมเดิมเป๊ะ) */
async function callAnthropic({ apiKey, userMsg }) {
  const model = envString('CONTENT_TEXT_MODEL', 'claude-sonnet-5');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: userMsg }],
  });
  const block = msg.content?.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  return { out: block?.input ?? null, modelUsed: model };
}

/**
 * OpenAI (GPT) — ใช้ OPENAI_API_KEY ตัวเดียวกับที่สร้างรูป (ai-image.js).
 * บังคับ output เป็น JSON ตาม schema เดียวกับ tool ของ Claude ผ่าน Structured Outputs.
 */
async function callOpenAI({ apiKey, userMsg }) {
  const model = envString('CONTENT_TEXT_MODEL', 'gpt-4o-mini');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 1500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: TOOL.name,
            strict: true,
            schema: { ...TOOL.input_schema, additionalProperties: false },
          },
        },
        messages: [
          { role: 'system', content: SYSTEM + '\nตอบเป็นภาษาไทย และตอบเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น' },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`openai HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    const json = await res.json();
    let out = null;
    try {
      out = JSON.parse(json?.choices?.[0]?.message?.content ?? '');
    } catch {
      throw new Error('openai ตอบไม่ใช่ JSON ที่ parse ได้');
    }
    return { out, modelUsed: `openai:${model}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ollama (server บริษัท, ฟรี ไม่ต้อง key) — บังคับ JSON ตาม schema ผ่าน `format`.
 * โมเดล default = qwen3.5:9b (ตัวที่ jarvis ใช้อยู่ อุ่นเครื่องแล้วบน server).
 */
async function callOllama({ base, userMsg }) {
  const model = envString('OLLAMA_MODEL', 'qwen3.5:9b');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000); // โมเดลใหญ่/โหลดครั้งแรกช้าได้
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.7 },
        format: TOOL.input_schema, // Ollama บังคับ output เป็น JSON ตาม schema เดียวกับ tool ของ Claude
        messages: [
          { role: 'system', content: SYSTEM + '\nตอบเป็นภาษาไทย และตอบเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น' },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const json = await res.json();
    let out = null;
    try {
      out = JSON.parse(json?.message?.content ?? '');
    } catch {
      throw new Error('ollama ตอบไม่ใช่ JSON ที่ parse ได้');
    }
    return { out, modelUsed: `ollama:${model}` };
  } finally {
    clearTimeout(timer);
  }
}
