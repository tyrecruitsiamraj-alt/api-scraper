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
- คำสั่งสร้างภาพ "คนทำงานอาชีพนั้น 1 คน เต็มตัว" สำหรับวางบนโปสเตอร์: Thai professional, ยิ้มมั่นใจ,
  เครื่องแบบ/ชุดเหมาะกับอาชีพ, isolated on plain background (สำหรับ diecut), photorealistic,
  ไม่มีตัวหนังสือในรูป (no text/letters)

## poster (ข้อมูลลงโปสเตอร์ — ระบบเอาไปวางบน template แบรนด์ SO WORK!)
- ใช้เฉพาะข้อมูลที่มีในใบขอเท่านั้น: เงินเดือน/รายได้/เวลา/สถานที่ ไม่มีในใบขอ = เว้นว่าง ห้ามแต่งเอง
- qualifications: ข้อละไม่เกิน ~40 ตัวอักษร อ่านปราดเดียวรู้เรื่อง
- benefits: ป้ายสั้น 2-4 คำ เช่น "งานมั่นคง" "สวัสดิการครบ" (ไม่รู้จริงใช้คำกลางแบบนี้ได้)`;

const TOOL = {
  name: 'recruit_content',
  description: 'ส่งร่างคอนเทนต์สรรหา: caption + แนววิดีโอ + prompt สร้างรูป + ข้อมูลโปสเตอร์',
  input_schema: {
    type: 'object',
    properties: {
      caption: { type: 'string', description: 'แคปชันโพสต์ Facebook ภาษาไทย พร้อม emoji + hashtag ในตัว' },
      video_brief: { type: 'string', description: 'แนวคลิปสั้น 2–4 บรรทัด สำหรับทีมถ่ายทำ' },
      image_prompt: { type: 'string', description: 'prompt ภาษาอังกฤษสำหรับสร้างรูป "คนทำงานอาชีพนี้" คนเดียว เต็มตัว (photorealistic, no text)' },
    },
    required: ['caption', 'video_brief', 'image_prompt'],
  },
};

/**
 * ข้อมูลโปสเตอร์ — เรียกแยกด้วย schema จิ๋ว (Ollama server บังคับ schema ใหญ่ไม่แน่นอน
 * — เคยแหกคอกตอบโครงมั่วเมื่อรวมกับ caption ใน call เดียว). fail-soft: null = ไม่มีโปสเตอร์.
 */
const POSTER_TOOL = {
  name: 'poster_fields',
  description: 'ข้อมูลสั้น ๆ สำหรับวางบนโปสเตอร์รับสมัครงาน',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'ชื่อตำแหน่งสั้น กระชับ (เช่น "พนักงานขับรถส่วนกลาง")' },
      badge: { type: 'string', description: 'ป้ายสั้น เช่น "เปิดรับสมัครด่วน", "รับหลายอัตรา"' },
      location: { type: 'string', description: 'สถานที่ทำงานสั้น ๆ ไม่รู้ให้ตอบ ""' },
      worktime: { type: 'string', description: 'วัน-เวลาทำงาน ไม่รู้ให้ตอบ ""' },
      salary_total: { type: 'string', description: 'รายได้รวมตัวเลขเด่น เช่น "17,000++" — มีในใบขอเท่านั้น ไม่มีให้ตอบ ""' },
      salary_breakdown: { type: 'string', description: 'ที่มารายได้ย่อ 1 บรรทัด — มีในใบขอเท่านั้น ไม่มีให้ตอบ ""' },
      qualifications: { type: 'array', items: { type: 'string' }, description: 'คุณสมบัติ 3-6 ข้อสั้น (ข้อละไม่เกิน 40 ตัวอักษร)' },
      benefits: { type: 'array', items: { type: 'string' }, description: 'จุดขาย/สวัสดิการ 3-4 ป้ายสั้น 2-4 คำ' },
    },
    required: ['title', 'badge', 'qualifications', 'benefits'],
  },
};

const POSTER_SYSTEM = `คุณคือคนสรุปใบขอกำลังคนลง "โปสเตอร์รับสมัครงาน" ของบริษัท Outsource ไทย
กติกาเหล็ก: ใช้เฉพาะข้อมูลที่มีในใบขอ ห้ามแต่งตัวเลขเงินเดือน/สวัสดิการ/เวลาเอง ไม่มี = ตอบ ""
ทุกอย่างต้องสั้น อ่านปราดเดียวรู้เรื่อง เป็นภาษาไทย

## รูปแบบคำตอบ (บังคับ) — JSON object เดียว ใช้ key เป๊ะ ๆ ตามตัวอย่างนี้เท่านั้น ห้ามตั้ง key เอง:
{"title":"พนักงานขับรถส่วนกลาง","badge":"เปิดรับสมัครด่วน","location":"แยกเพลินจิต กรุงเทพฯ","worktime":"จ.-ศ. 08.30-17.30 น.","salary_total":"17,000++","salary_breakdown":"เงินเดือน 12,000 + เบี้ยขยัน 1,000 + ค่าโทร 500 + OT","qualifications":["เพศชาย อายุ 25-55 ปี","วุฒิ ม.3 ขึ้นไป","ประสบการณ์ขับรถ 1 ปีขึ้นไป"],"benefits":["งานมั่นคง","สวัสดิการครบ","รายได้ดี"]}`;

/**
 * @param {{ title?:string, positions?:string, province?:string, qty?:number,
 *   remaining_qty?:number, snapshot?:Record<string,any>,
 *   winningExamples?: string[], losingExamples?: string[] }} campaign
 *   winningExamples = แคปชันที่เคยได้ engagement สูง (จาก content_winning_patterns)
 *   ใส่เป็นแรงบันดาลใจให้ AI คิดตามแนวที่เคยเวิร์ค — ไม่มีก็ gen ได้ปกติ
 *   losingExamples = แคปชันที่เคยได้ engagement ต่ำ (จาก content_losing_patterns)
 *   ใส่เป็นตัวอย่าง "แนวที่คนไม่สนใจ — ห้ามทำซ้ำ" — ไม่มีก็ gen ได้ปกติ
 * @returns {Promise<null | { caption:string, videoBrief:string, imagePrompt:string, model:string }>}
 */
/**
 * เลือก provider ข้อความที่พร้อมใช้ (แชร์กับ content-research.js) —
 * anthropic → openai → ollama ตาม key/ollama ที่มี. คืน null = ไม่มี provider เลย.
 * @returns {null | { provider:'anthropic'|'openai'|'ollama', apiKey:string, openaiKey:string, ollamaBase:string }}
 */
export function resolveTextProvider() {
  const apiKey = envString('ANTHROPIC_API_KEY');
  const openaiKey = envString('OPENAI_API_KEY');
  const ollamaBase = envString('OLLAMA_BASE_URL');
  const provider = envString(
    'CONTENT_TEXT_PROVIDER',
    apiKey ? 'anthropic' : openaiKey ? 'openai' : ollamaBase ? 'ollama' : ''
  );
  if (!provider) return null;
  if (provider === 'anthropic' && !apiKey) return null;
  if (provider === 'openai' && !openaiKey) return null;
  if (provider === 'ollama' && !ollamaBase) return null;
  return { provider, apiKey, openaiKey, ollamaBase };
}

export async function generateContent(campaign = {}) {
  // เลือก AI ที่ใช้คิดข้อความ: 'anthropic' (Claude), 'openai' (GPT — ใช้ key เดียวกับที่สร้างรูป)
  // หรือ 'ollama' (server บริษัท ฟรี ไม่ต้อง key). ไม่ตั้ง CONTENT_TEXT_PROVIDER = เลือกอัตโนมัติ
  const prov = resolveTextProvider();
  if (!prov) return null; // feature off — ไม่มีทั้ง key และ ollama
  const { provider, apiKey, openaiKey, ollamaBase } = prov;

  const ctx = campaignContext(campaign);
  if (!ctx) return null; // ไม่มีตำแหน่งให้คิด

  // แนวที่เคยเวิร์ค (engagement สูง) — ให้เป็นแรงบันดาลใจ ไม่ใช่ลอก
  const wins = (campaign.winningExamples ?? [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const winsBlock = wins.length
    ? `\n\nแคปชันที่เคยได้ผลดี (คนสนใจเยอะ) — ใช้เป็นแนวทางโทน/โครงสร้าง ห้ามลอกคำต่อคำ:\n` +
      wins.map((w, i) => `ตัวอย่าง ${i + 1}:\n${w}`).join('\n---\n')
    : '';

  // แนวที่ "ไม่เวิร์ค" (คนสนใจน้อย) — เตือน AI ให้เลี่ยงโทน/โครงสร้างแบบนี้
  const loses = (campaign.losingExamples ?? [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const losesBlock = loses.length
    ? `\n\n⚠️ แคปชันที่เคยได้ผลไม่ดี (คนไม่สนใจ) — ห้ามเขียนแนวนี้ซ้ำ ให้เปลี่ยนมุม/พาดหัว/จุดขายให้ต่างออกไป:\n` +
      loses.map((w, i) => `ตัวอย่างที่ไม่ควรทำ ${i + 1}:\n${w}`).join('\n---\n')
    : '';

  // ผลวิจัยตลาด (จาก content-research.js) — มุม/ฮุกที่ดึงคนตำแหน่งนี้บนกลุ่มหางาน FB ไทย
  // ให้ AI ใช้เป็นแนวคิด (ไม่ใช่ก๊อป) — ตอบโจทย์ "รู้ได้ไงว่าดี" ตั้งแต่ยังไม่มีสถิติของเราเอง
  const research = campaign.research ?? null;
  const angles = (research?.angles ?? []).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 4);
  const hooks = (research?.hooks ?? []).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 4);
  const researchBlock = angles.length || hooks.length
    ? `\n\n🔍 ผลวิเคราะห์ตลาด (แนวที่ดึงคนตำแหน่งนี้ได้บนกลุ่มหางาน FB) — ใช้เป็นแนวคิด:` +
      (angles.length ? `\nมุมที่ควรเล่น: ${angles.join(' · ')}` : '') +
      (hooks.length ? `\nประโยคฮุกเปิด (ดัดแปลงได้ ห้ามลอกตรง): ${hooks.join(' | ')}` : '')
    : '';

  // เทรนด์/มีมที่กำลังมา (คนเปิดไว้บนเว็บ) — เกาะกระแสในแคปชันแบบเนียน (เฉพาะ for_caption)
  const trends = (campaign.trends ?? []).filter((t) => t && (t.for_caption ?? true) && String(t.label ?? '').trim());
  const trendsBlock = trends.length
    ? `\n\n🔥 เทรนด์ที่กำลังมาตอนนี้ — เกาะกระแสให้เนียน ถ้าเข้ากับงานได้ (อย่าฝืน/อย่าหยาบ):\n` +
      trends.map((t) => `- ${String(t.label).trim()}${t.note ? ` (${String(t.note).trim()})` : ''}`).join('\n')
    : '';

  // A/B: บอกแนวการเขียนของเวอร์ชันนี้ (เช่น "ตรงไปตรงมา" vs "เน้นสวัสดิการ")
  const styleBlock = String(campaign.styleHint ?? '').trim()
    ? `\n\nแนวการเขียนของเวอร์ชันนี้ (บังคับ): ${String(campaign.styleHint).trim()}`
    : '';
  const userMsg = `เขียนคอนเทนต์สรรหาสำหรับใบขอนี้:\n${ctx}${winsBlock}${losesBlock}${researchBlock}${trendsBlock}${styleBlock}`;

  // qwen/Ollama ตอบไม่นิ่งเป็นรอบ ๆ — ว่าง/พังให้ลองซ้ำสูงสุด 3 รอบ
  let out = null;
  let modelUsed = '';
  for (let attempt = 1; attempt <= 3 && !String(out?.caption ?? '').trim(); attempt += 1) {
    if (attempt > 1) console.log(`  [content-gen] caption รอบ ${attempt}/3 (รอบก่อนว่าง/พัง)`);
    try {
      if (provider === 'ollama') {
        ({ out, modelUsed } = await callOllama({ base: ollamaBase, userMsg }));
      } else if (provider === 'openai') {
        ({ out, modelUsed } = await callOpenAI({ apiKey: openaiKey, userMsg }));
      } else {
        ({ out, modelUsed } = await callAnthropic({ apiKey, userMsg }));
      }
    } catch (e) {
      console.warn(`  [content-gen] AI call failed (${provider}): ${e.message}`);
      out = null;
    }
  }

  const caption = String(out?.caption ?? '').trim();
  if (!caption) {
    console.warn(`  [content-gen] AI (${provider}) คืนผลไม่ถูกรูปแบบ (caption ว่าง) — ข้าม`);
    return null;
  }

  // สไตล์รูปจากผลวิจัย — ต่อท้าย image_prompt ให้รูปคุมโทน/องค์ประกอบตามที่สำรวจว่าเวิร์ค
  // (ตอบโจทย์ "รูปไม่สำรวจจะรู้ไงต้องสร้างแบบไหน" — style มาจาก research ไม่ใช่สุ่ม)
  // สไตล์รูป: ระบุตรง (campaign.imageStyle) ชนะ — ใช้ทำ A/B รูป (A ใช้สไตล์ 1, B ใช้สไตล์ 2)
  const imageStyle = String(campaign.imageStyle ?? research?.imageStyle ?? '').trim();
  // เทรนด์ที่ติดธง for_image — เกาะกระแสในรูปด้วย (label ใช้เป็น hint สั้น ๆ)
  const imageTrends = (campaign.trends ?? [])
    .filter((t) => t && (t.for_image ?? true) && String(t.label ?? '').trim())
    .map((t) => String(t.label).trim());
  const basePrompt = String(out.image_prompt ?? '').trim();
  let imagePrompt = basePrompt;
  if (basePrompt && imageStyle) imagePrompt += `. Style: ${imageStyle}`;
  if (basePrompt && imageTrends.length) imagePrompt += `. เกาะเทรนด์: ${imageTrends.join(', ')}`;

  return {
    caption,
    videoBrief: String(out.video_brief ?? '').trim(),
    imagePrompt,
    model: modelUsed,
  };
}

/** สร้าง context ใบขอ (แชร์ระหว่าง caption กับ poster) */
function campaignContext(campaign = {}) {
  const snap = campaign.snapshot ?? {};
  const position = String(campaign.title || snap.request_name || snap.job_description_name || '').trim();
  if (!position) return null;
  return [
    `ตำแหน่ง/งาน: ${position}`,
    campaign.province || snap.site_name ? `สถานที่ทำงาน: ${campaign.province || snap.site_name}` : '',
    snap.work_addr ? `ที่อยู่ไซต์งาน: ${snap.work_addr}` : '',
    snap.detail ? `รายละเอียดใบขอ: ${snap.detail}` : '',
    campaign.qty ? `จำนวนที่รับ: ${campaign.qty}` : '',
    campaign.remaining_qty ? `ยังขาดอีก: ${campaign.remaining_qty} คน` : '',
    snap.department_code ? `แผนก: ${snap.department_code}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * ข้อมูลลงโปสเตอร์จากใบขอ — call แยก schema จิ๋ว (เสถียรกับ Ollama).
 * @returns {Promise<null | { title, badge, location, worktime, salaryTotal, salaryBreakdown,
 *   qualifications: string[], benefits: string[] }>}
 */
export async function generatePosterFields(campaign = {}) {
  const apiKey = envString('ANTHROPIC_API_KEY');
  const openaiKey = envString('OPENAI_API_KEY');
  const ollamaBase = envString('OLLAMA_BASE_URL');
  const provider = envString(
    'CONTENT_TEXT_PROVIDER',
    apiKey ? 'anthropic' : openaiKey ? 'openai' : ollamaBase ? 'ollama' : ''
  );
  if (!provider) return null;

  const ctx = campaignContext(campaign);
  if (!ctx) return null;
  const userMsg = `สรุปใบขอนี้เป็นข้อมูลลงโปสเตอร์:\n${ctx}`;

  // retry จนเก็บเกี่ยวได้ครบเครื่อง (title + คุณสมบัติอย่างน้อย 1) — qwen ตอบไม่นิ่งเป็นรอบ ๆ
  let out = null;
  const complete = () => {
    const h = harvestPosterFields(out);
    return !!(h && h.qualifications.length >= 1);
  };
  for (let attempt = 1; attempt <= 3 && !complete(); attempt += 1) {
    if (attempt > 1) console.log(`  [content-gen] poster รอบ ${attempt}/3 (รอบก่อนไม่ครบ)`);
    try {
      if (provider === 'ollama' && ollamaBase) {
        ({ out } = await callOllama({ base: ollamaBase, userMsg, system: POSTER_SYSTEM, tool: POSTER_TOOL }));
      } else if (provider === 'openai' && openaiKey) {
        ({ out } = await callOpenAI({ apiKey: openaiKey, userMsg, system: POSTER_SYSTEM, tool: POSTER_TOOL }));
      } else if (apiKey) {
        ({ out } = await callAnthropic({ apiKey, userMsg, system: POSTER_SYSTEM, tool: POSTER_TOOL }));
      } else {
        return null;
      }
    } catch (e) {
      console.warn(`  [content-gen] poster fields ล้มเหลว (${provider}): ${e.message}`);
      out = null;
    }
  }
  if (!complete()) {
    console.warn('  [content-gen] poster fields ไม่ครบหลัง 3 รอบ — ข้ามโปสเตอร์');
    return null;
  }
  const fields = harvestPosterFields(out);
  // เงินเดือน: โมเดลลืมใส่บ่อย → ดึงจากใบขอตรง ๆ (แหล่งความจริง) แบบ deterministic
  if (fields && !fields.salaryTotal) {
    const m = ctx.match(/รายได้รวม\s*([\d,]+\s*\+*)/) || ctx.match(/([\d]{1,3}(?:,\d{3})+\s*\+\+)/);
    if (m) fields.salaryTotal = m[1].trim();
  }
  if (fields && !fields.salaryBreakdown) {
    const m = ctx.match(/เงินเดือน[^\n]{0,90}/);
    if (m) fields.salaryBreakdown = m[0].trim();
  }
  return fields;
}

/**
 * เก็บเกี่ยว field โปสเตอร์จาก output ที่ "key ไม่นิ่ง" — Ollama server บังคับ schema
 * ไม่แน่นอน qwen ชอบตั้ง key เอง (ไทย/อังกฤษ/สลับกัน) จึง map ผ่าน synonym +
 * รับทั้ง array และ string (แตกด้วย / • , ขึ้นบรรทัด)
 */
function harvestPosterFields(out) {
  if (!out || typeof out !== 'object') return null;
  const get = (...keys) => {
    for (const k of keys) {
      for (const [ok, ov] of Object.entries(out)) {
        if (ok.toLowerCase() === k.toLowerCase() && ov != null && String(ov).trim()) return ov;
      }
    }
    return '';
  };
  const asList = (v) => {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    const s = String(v ?? '').trim();
    if (!s) return [];
    const parts = s.split(/[/•|;\n]+/).map((x) => x.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [s];
  };

  const title = String(get('title', 'ตำแหน่ง', 'position', 'ชื่อตำแหน่ง', 'job_title')).trim();
  if (!title) return null;

  const salaryRaw = String(get('salary_total', 'รายได้รวม', 'salary', 'เงินเดือน', 'รายได้')).trim();
  // ดึงตัวเลขเด่น เช่น "17,000++" จากข้อความรวม (ถ้ามี)
  const totalMatch = JSON.stringify(out).match(/([\d]{1,3}(?:,\d{3})+\s*\+{0,2})/);
  const salaryTotal = /\d/.test(salaryRaw) && salaryRaw.length <= 12 ? salaryRaw : (totalMatch?.[1] ?? '').trim();

  const breakdown = [
    salaryRaw && salaryRaw !== salaryTotal ? salaryRaw : '',
    String(get('salary_breakdown', 'สวัสดิการ', 'benefits_detail', 'ที่มารายได้')).trim(),
  ].filter(Boolean).join(' · ');

  const quals = asList(get('qualifications', 'คุณสมบัติ', 'requirements'));
  const extra = String(get('ข้อควรระวัง', 'เงื่อนไข', 'note')).trim();
  if (extra && quals.length < 6) quals.push(extra);

  let benefits = asList(get('benefits', 'จุดขาย', 'สวัสดิการเด่น'));
  if (benefits.length === 0) benefits = ['งานมั่นคง', 'สวัสดิการครบ', 'รายได้ดี'];

  return {
    title,
    badge: String(get('badge', 'ป้าย')).trim() || 'เปิดรับสมัครด่วน',
    location: String(get('location', 'สถานที่', 'สถานที่ทำงาน')).trim(),
    worktime: String(get('worktime', 'เวลาทำงาน', 'เวลา', 'วันเวลาทำงาน')).trim(),
    salaryTotal,
    salaryBreakdown: breakdown,
    qualifications: quals.slice(0, 6),
    benefits: benefits.slice(0, 4),
  };
}

/** Claude — structured tool output (พฤติกรรมเดิมเป๊ะ) */
export async function callAnthropic({ apiKey, userMsg, system = SYSTEM, tool = TOOL }) {
  const model = envString('CONTENT_TEXT_MODEL', 'claude-sonnet-5');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 1500,
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userMsg }],
  });
  const block = msg.content?.find((b) => b.type === 'tool_use' && b.name === tool.name);
  return { out: block?.input ?? null, modelUsed: model };
}

/**
 * OpenAI (GPT) — ใช้ OPENAI_API_KEY ตัวเดียวกับที่สร้างรูป (ai-image.js).
 * บังคับ output เป็น JSON ตาม schema เดียวกับ tool ของ Claude ผ่าน Structured Outputs.
 */
export async function callOpenAI({ apiKey, userMsg, system = SYSTEM, tool = TOOL }) {
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
            name: tool.name,
            strict: true,
            schema: { ...tool.input_schema, additionalProperties: false },
          },
        },
        messages: [
          { role: 'system', content: system + '\nตอบเป็นภาษาไทย และตอบเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น' },
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
export async function callOllama({ base, userMsg, system = SYSTEM, tool = TOOL }) {
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
        think: false, // qwen3.5 เป็น thinking model — ปิดกัน reasoning กิน token จน JSON ไม่ครบ
        options: { temperature: 0.7, num_predict: 3072 },
        format: tool.input_schema, // Ollama บังคับ output เป็น JSON ตาม schema เดียวกับ tool ของ Claude
        messages: [
          { role: 'system', content: system + '\nตอบเป็นภาษาไทย และตอบเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น ห้ามอธิบายนำ' },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const json = await res.json();
    const raw = String(json?.message?.content ?? '').trim();
    // parse ทน — เผื่อ code fence/ข้อความนำ/reasoning หลุดมา
    let out = null;
    try { out = JSON.parse(raw); } catch {
      const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
      try { out = JSON.parse(cleaned); } catch {
        const i = cleaned.indexOf('{');
        const j = cleaned.lastIndexOf('}');
        if (i >= 0 && j > i) { try { out = JSON.parse(cleaned.slice(i, j + 1)); } catch { /* ยอมแพ้ */ } }
      }
    }
    if (!out) throw new Error(`ollama ตอบไม่ใช่ JSON ที่ parse ได้ (done_reason=${json?.done_reason ?? '?'})`);
    return { out, modelUsed: `ollama:${model}` };
  } finally {
    clearTimeout(timer);
  }
}
