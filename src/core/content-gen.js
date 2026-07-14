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
 *   remaining_qty?:number, snapshot?:Record<string,any> }} campaign
 * @returns {Promise<null | { caption:string, videoBrief:string, imagePrompt:string, model:string }>}
 */
export async function generateContent(campaign = {}) {
  const apiKey = envString('ANTHROPIC_API_KEY');
  if (!apiKey) return null; // feature off — ไม่มี key

  const snap = campaign.snapshot ?? {};
  const position = String(campaign.title || snap.request_name || snap.job_description_name || '').trim();
  if (!position) return null; // ไม่มีตำแหน่งให้คิด

  const model = envString('CONTENT_TEXT_MODEL', 'claude-sonnet-5');
  const client = new Anthropic({ apiKey });

  const ctx = [
    `ตำแหน่ง/งาน: ${position}`,
    campaign.province || snap.site_name ? `สถานที่ทำงาน: ${campaign.province || snap.site_name}` : '',
    snap.work_addr ? `ที่อยู่ไซต์งาน: ${snap.work_addr}` : '',
    campaign.qty ? `จำนวนที่รับ: ${campaign.qty}` : '',
    campaign.remaining_qty ? `ยังขาดอีก: ${campaign.remaining_qty} คน` : '',
    snap.department_code ? `แผนก: ${snap.department_code}` : '',
  ].filter(Boolean).join('\n');

  let msg;
  try {
    msg = await client.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `เขียนคอนเทนต์สรรหาสำหรับใบขอนี้:\n${ctx}` }],
    });
  } catch (e) {
    console.warn(`  [content-gen] AI call failed: ${e.message} — ข้ามการคิด content`);
    return null;
  }

  const block = msg.content?.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  const out = block?.input;
  const caption = String(out?.caption ?? '').trim();
  if (!caption) {
    console.warn('  [content-gen] AI คืนผลไม่ถูกรูปแบบ (caption ว่าง) — ข้าม');
    return null;
  }

  return {
    caption,
    videoBrief: String(out.video_brief ?? '').trim(),
    imagePrompt: String(out.image_prompt ?? '').trim(),
    model,
  };
}
