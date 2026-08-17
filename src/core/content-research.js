import { resolveTextProvider, callAnthropic, callOpenAI, callOllama } from './content-gen.js';

/**
 * Market research ก่อนคิดคอนเทนต์ — ตอบโจทย์ "รู้ได้ไงว่าอะไรดี ตั้งแต่ยังไม่มีสถิติของเราเอง"
 *
 * ให้โมเดลสรุป "แนว/ฮุก/สไตล์รูป" ที่ดึงคนตำแหน่งนี้ได้บนกลุ่มหางาน Facebook ไทย
 * โดย ground ด้วยข้อมูลจริงเท่าที่มี: คำค้นมาแรง (job_trends) + แคปชันที่เคยได้ผลของเรา
 * → เป็น research จากหลักฐานสดที่ตัวเก็บตลาดบันทึกไว้ + สถิติของเรา + ความรู้โมเดล
 *
 * fail-soft: ไม่มี provider / โมเดลตอบพัง = คืน null (draft เดินต่อได้แบบไม่มี research)
 */

const RESEARCH_TOOL = {
  name: 'recruitment_content_insight',
  description: 'สรุปแนวคอนเทนต์สรรหาที่ได้ผลบนกลุ่มหางาน Facebook ไทย',
  input_schema: {
    type: 'object',
    properties: {
      angles: {
        type: 'array',
        items: { type: 'string' },
        description: 'มุม/ประเด็นที่ควรเล่นให้คนตำแหน่งนี้สนใจ 3-4 ข้อ สั้น ๆ (เช่น "เน้นเริ่มงานได้ทันที", "ย้ำไม่ต้องมีประสบการณ์")',
      },
      hooks: {
        type: 'array',
        items: { type: 'string' },
        description: 'ประโยคเปิด/พาดหัวที่สะดุดตา 2-4 อัน เหมาะกับคนไทยเลื่อนฟีดหางาน',
      },
      image_style: {
        type: 'string',
        description: 'สไตล์รูปแบบ A ที่ควรใช้ให้คนหยุดดู (โทนสี/องค์ประกอบ/อารมณ์ เช่น "คนใส่ยูนิฟอร์มยิ้ม พื้นหลังที่ทำงานจริง สีสด อารมณ์อบอุ่นน่าเชื่อถือ")',
      },
      image_style_b: {
        type: 'string',
        description: 'สไตล์รูปแบบ B ที่ต่างจาก A ชัดเจน (คนละมุมกล้อง/องค์ประกอบ/อารมณ์) ไว้ทำ A/B เทสต์',
      },
    },
    required: ['angles', 'hooks', 'image_style', 'image_style_b'],
  },
};

const RESEARCH_SYSTEM = `คุณคือนักวางกลยุทธ์คอนเทนต์สรรหาบุคลากรบนกลุ่มหางาน Facebook ในไทย
มีประสบการณ์ว่าโพสต์รับสมัครงานแบบไหนคนแห่ทัก แบบไหนคนเลื่อนผ่าน
ให้วิเคราะห์จากตำแหน่ง+พื้นที่ที่ได้รับ ว่า "แนว/ฮุก/สไตล์รูป" ใดดึงผู้สมัครกลุ่มนี้ได้จริง
ตอบสั้น กระชับ ใช้ได้จริง เป็นภาษาไทย ห้ามแต่งเงินเดือน/สวัสดิการที่ไม่ได้ให้มา`;

const OCCUPATION_CONFLICTS = [
  /พยาบาล|nurse|stethoscope|medical scrubs/i,
  /ขับรถ|driver|truck|steering wheel|คนขับ/i,
  /รปภ|security guard|รักษาความปลอดภัย/i,
  /แม่บ้าน|cleaner|ทำความสะอาด/i,
  /ช่าง|technician|electrician/i,
  /พ่อครัว|แม่ครัว|chef|cook/i,
];
const IMAGE_STYLE_CONFLICTS = [
  /ข้อความ|ตัวหนังสือ|คำว่า|เบอร์โทร|โทรศัพท์|ไลน์|line\b|logo|โลโก้|typography|headline|caption/i,
];

export function sanitizeResearchForRole(research, position) {
  if (!research) return null;
  const role = String(position ?? '').trim();
  const conflicts = OCCUPATION_CONFLICTS.filter((pattern) => !pattern.test(role));
  const safe = (value) => !conflicts.some((pattern) => pattern.test(String(value ?? '')));
  const angles = (research.angles ?? []).filter(safe);
  const hooks = (research.hooks ?? []).filter(safe);
  const imageStyles = (research.imageStyles ?? []).filter((value) => (
    safe(value) && !IMAGE_STYLE_CONFLICTS.some((pattern) => pattern.test(String(value ?? '')))
  ));
  const imageStyle = imageStyles[0] ?? '';
  const imageStyleB = imageStyles[1] ?? '';
  if (!angles.length && !hooks.length && !imageStyle) return null;
  return { ...research, angles, hooks, imageStyle, imageStyleB, imageStyles };
}

/**
 * @param {{ title?:string, province?:string, snapshot?:Record<string,any>,
 *   trendKeywords?:string[], winningExamples?:string[], marketEvidence?:Record<string,any>[] }} input
 * @returns {Promise<null | { angles:string[], hooks:string[], imageStyle:string, model:string }>}
 */
export async function researchContentAngles(input = {}) {
  const prov = resolveTextProvider();
  if (!prov) return null;

  const position = String(input.title ?? input.snapshot?.request_name ?? '').trim();
  if (!position) return null;

  const kw = (input.trendKeywords ?? []).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 6);
  const wins = (input.winningExamples ?? []).map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 2);
  const facebookSignals = (input.marketEvidence ?? [])
    .filter((item) => item?.source_type === 'facebook_post')
    .slice(0, 8)
    .map((item) => {
      const excerpt = String(item.findings?.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 260);
      return `${excerpt} [Reaction ${Number(item.reactions) || 0} · Comment ${Number(item.comments) || 0} · Share ${Number(item.shares) || 0}]`;
    })
    .filter(Boolean);
  // เทรนด์/มีมที่กำลังมา (คนกรอกไว้บนเว็บ) — ให้เกาะกระแสตอนคิดมุม/ฮุก/สไตล์รูป
  const trends = (input.trends ?? [])
    .map((t) => (t && typeof t === 'object' ? { label: String(t.label ?? '').trim(), note: String(t.note ?? '').trim() } : { label: String(t ?? '').trim(), note: '' }))
    .filter((t) => t.label)
    .slice(0, 8);

  const userMsg = [
    `ตำแหน่งที่รับสมัคร: ${position}`,
    input.province ? `พื้นที่ทำงาน: ${input.province}` : '',
    kw.length ? `คำค้นที่คนไทยใช้หางานนี้ (มาแรง): ${kw.join(', ')}` : '',
    trends.length ? `เทรนด์/มีมที่กำลังมาตอนนี้ (อยากให้คอนเทนต์เกาะกระแสอย่างเนียน ไม่ฝืน):\n${trends.map((t) => `- ${t.label}${t.note ? ` (${t.note})` : ''}`).join('\n')}` : '',
    wins.length ? `แคปชันของเราที่เคยได้ผลดี (อ้างอิงโทน):\n${wins.map((w) => `- ${w.slice(0, 200)}`).join('\n')}` : '',
    facebookSignals.length ? `โพสต์ Facebook ที่สำรวจสดสำหรับตำแหน่งนี้ (ยอดเป็นสัญญาณประกอบ ไม่ใช่ข้อเท็จจริงของงาน):\n${facebookSignals.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    'วิเคราะห์ว่าจะโพสต์ตำแหน่งนี้ให้คนบนกลุ่มหางาน FB ไทยหยุดดูและทักเข้ามาได้อย่างไร' +
      (trends.length ? ' โดยเกาะเทรนด์ข้างต้นถ้าเข้ากับงานได้' : '') +
      ' — ตอบเป็น angles/hooks/image_style',
  ].filter(Boolean).join('\n');

  const args = { userMsg, system: RESEARCH_SYSTEM, tool: RESEARCH_TOOL };
  let out = null;
  let model = '';
  // qwen ตอบไม่นิ่ง — ลองสูงสุด 2 รอบ
  for (let attempt = 1; attempt <= 2 && !out; attempt += 1) {
    try {
      const r =
        prov.provider === 'ollama' ? await callOllama({ base: prov.ollamaBase, ...args })
        : prov.provider === 'openai' ? await callOpenAI({ apiKey: prov.openaiKey, ...args })
        : await callAnthropic({ apiKey: prov.apiKey, ...args });
      out = r.out;
      model = r.modelUsed;
    } catch (e) {
      console.warn(`  [content-research] รอบ ${attempt} ล้ม (${prov.provider}): ${e.message}`);
      out = null;
    }
  }
  if (!out) return null;

  const arr = (v) => (Array.isArray(v) ? v.map((s) => String(s ?? '').trim()).filter(Boolean) : []);
  const angles = arr(out.angles).slice(0, 4);
  const hooks = arr(out.hooks).slice(0, 4);
  const imageStyle = String(out.image_style ?? '').trim();
  const imageStyleB = String(out.image_style_b ?? '').trim();
  const imageStyles = [imageStyle, imageStyleB].filter(Boolean); // สำหรับ A/B รูป
  if (!angles.length && !hooks.length && !imageStyle) return null;
  return sanitizeResearchForRole({ angles, hooks, imageStyle, imageStyleB, imageStyles, model }, position);
}
