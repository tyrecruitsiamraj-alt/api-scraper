import Anthropic from '@anthropic-ai/sdk';
import { envString } from '../config.js';

/**
 * AI Job-Family classifier + adjacent-position suggester + เนื้องาน→ตำแหน่ง.
 *
 * ใช้ได้ 2 โหมด:
 *   1. suggestAdjacentPositions({position}) — จัดตำแหน่งเข้า Family แล้วเสนอตำแหน่ง
 *      ใกล้เคียง 3 tier (ใช้ตอน scrape ตำแหน่งหนึ่งได้ไม่ครบ target แล้วขยาย)
 *   2. positionsFromDescription({description}) — รับ "เนื้องาน" (คำอธิบายงาน) แล้ว
 *      คืน "ชุดคำค้นตำแหน่ง" ที่ค้นผู้สมัครในเว็บหางานได้จริง เรียงจากตรงสุด→ใกล้เคียง
 *      (ใช้ตอนผู้ใช้กรอกเนื้องานแทนตำแหน่ง แล้วอยากได้ครบ N คนจากตำแหน่งไหนก็ได้ที่เข้าข่าย)
 *
 * Provider เลือกอัตโนมัติเหมือน src/core/content-gen.js:
 *   มี ANTHROPIC_API_KEY → anthropic, ไม่มีแต่มี OLLAMA_BASE_URL → ollama (ฟรี), ไม่มีทั้งคู่ → ปิดเงียบ (คืน null).
 * เป็น pure caller — ไม่แตะ DB. การ cache/persist ทำที่ผู้เรียก (tasks-worker).
 */

// สรุปแกนของ Skill — ฝังเป็น context ให้โมเดล reasoning ตามบริบท (ไม่ใช่ lookup ตายตัว)
const TAXONOMY = `คุณคือผู้เชี่ยวชาญ Sourcing ของบริษัท Outsource ไทย หน้าที่: จัดตำแหน่งงานเข้า "Job Family" แล้วเสนอตำแหน่งใกล้เคียงที่ดึงมาค้นหาผู้สมัครแทนกันได้

## Job Family (แก่นของงาน — ต่างกันโดยสิ้นเชิง)
- A 🎭 Presentation-Forward: ภาพลักษณ์/บุคลิก/การสื่อสารคือแก่น (PR, ต้อนรับ, Reception, GRO, Concierge, MC, Brand Ambassador, Ground Staff). Gate: ภาพลักษณ์+มารยาท+สื่อสารกับลูกค้าโดยตรง
- B 🔧 Technical-Skilled: ทักษะเทคนิค/ใบรับรองคือแก่น (ช่างไฟฟ้า, ช่างเครื่องกล, ช่างอาคาร/MEP, Programmer, IT Support, IT Infra). Gate: ใบรับรอง/วุฒิ+ผลงานจับต้องได้
- C 🚗 Transport/Driver: วินัย+ประวัติปลอดภัยคือแก่น (พนักงานขับรถผู้บริหาร/ส่วนกลาง, Valet). Gate: ใบขับขี่+ประวัติสะอาด
- D 📋 Service-Operational: ความถูกต้อง/ละเอียด/ระบบคือแก่น (ธุรการ, แคชเชียร์, คลังสินค้า, แม่บ้าน). Gate: รอบคอบ/ซื่อสัตย์
- E 🛡️ Security/Control: ความเข้มแข็ง/เผชิญเหตุคือแก่น (รปภ.). Gate: ใบอนุญาต รปภ.+บุคลิกมั่นคง (ตรงข้าม A)
- F 🌳 Field/Outdoor Labor: แรงกาย/ทนสภาพอากาศคือแก่น (คนสวน, รุกขกร, ดูแลพื้นที่สีเขียว). Gate: แข็งแรง+ใบรับรองงานที่สูง(รุกขกร)

## กฎเหล็ก
- 2 ตำแหน่งจะ "ใกล้เคียงกัน" ได้เฉพาะเมื่ออยู่ Job Family เดียวกันเท่านั้น
- ห้ามใช้ "อยู่สถานที่เดียวกัน" หรือ "รายได้ใกล้กัน" เป็นเกณฑ์ความใกล้เคียง
- Cross-Family มีแค่ 2 กรณี: Valet(C)↔A (แต่ Gate C บังคับก่อน), IT Support หน้าเคาน์เตอร์(B)↔A (แต่ Gate B บังคับก่อน) — นอกนั้นห้ามข้าม Family

## จัด 3 tier ตามความพร้อมใช้แทนกันทันที (ทุกตำแหน่งต้องอยู่ Family เดียวกับตำแหน่งต้นทาง)
- green 🟢 ใกล้มาก: ผ่าน Gate ครบ + ความเข้ม/environment ใกล้เคียง → ใช้แทนได้ทันที
- yellow 🟡 ใกล้ปานกลาง: ผ่าน Gate หลัก แต่มีตัวแปรต้องเช็ค (เงินเดือนคาดหวัง, ต้อง orientation)
- red 🔴 ใกล้น้อย: ผ่าน Gate บางส่วน ต้องประเมินรายคน
- excluded: ตำแหน่งที่ "ดูใกล้แต่ต้องตัดออก" (คนละ Family) พร้อมเหตุผลอ้างอิง Gate ที่ไม่ผ่าน

ตำแหน่งใน green/yellow/red ต้องเป็น "คำค้นหางานภาษาไทยสั้น ๆ" ที่ใช้ค้นในเว็บหางานได้จริง (เช่น "ช่างเครื่องกล", "พนักงานต้อนรับ") ไม่ใช่ประโยคอธิบาย ห้ามใส่ตำแหน่งต้นทางซ้ำ`;

const TOOL = {
  name: 'adjacent_positions',
  description: 'ส่งผลการจัด Job Family และตำแหน่งใกล้เคียง 3 tier',
  input_schema: {
    type: 'object',
    properties: {
      family: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F'], description: 'Job Family ของตำแหน่งต้นทาง' },
      family_label: { type: 'string', description: 'ชื่อ Family พร้อม emoji เช่น "🔧 Technical-Skilled"' },
      gate: { type: 'array', items: { type: 'string' }, description: 'Gate criteria ที่ต้องผ่านของ Family นี้' },
      green: { type: 'array', items: { type: 'string' }, description: 'ตำแหน่งใกล้มาก 🟢 (คำค้นไทยสั้น)' },
      yellow: { type: 'array', items: { type: 'string' }, description: 'ตำแหน่งใกล้ปานกลาง 🟡' },
      red: { type: 'array', items: { type: 'string' }, description: 'ตำแหน่งใกล้น้อย 🔴' },
      excluded: {
        type: 'array',
        description: 'ตำแหน่งที่ดูใกล้แต่ตัดออก (คนละ Family)',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, reason: { type: 'string' } },
          required: ['name', 'reason'],
        },
      },
      reason: { type: 'string', description: 'เหตุผลการจัด Family + แนวคิดการเลือกตำแหน่งใกล้เคียง (สั้น)' },
    },
    required: ['family', 'family_label', 'green', 'yellow', 'red', 'reason'],
  },
};

// โหมดเนื้องาน → ชุดคำค้นตำแหน่ง (เรียงจากตรงสุด→ใกล้เคียง)
const DESC_TOOL = {
  name: 'positions_from_description',
  description: 'แปลงคำอธิบายเนื้องาน (ภาระงาน/หน้าที่) เป็นชุดคำค้นตำแหน่งที่ใช้หาผู้สมัครในเว็บหางานได้จริง',
  input_schema: {
    type: 'object',
    properties: {
      family: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F'], description: 'Job Family ที่เนื้องานนี้สังกัด' },
      family_label: { type: 'string', description: 'ชื่อ Family พร้อม emoji' },
      positions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'คำค้นตำแหน่ง "ภาษาไทยเท่านั้น" สั้น ๆ ที่ตรงกับเนื้องานนี้ ค้นในเว็บหางานไทยได้จริง อย่างน้อย 6 คำ รวมคำพ้องและตำแหน่งใกล้เคียงในสาย Family เดียวกัน เรียงจากตรงสุดก่อน ไม่ใช่ประโยคอธิบาย. ห้ามภาษาอังกฤษเด็ดขาด แม้เนื้องานจะมีศัพท์อังกฤษก็ต้องแปลงเป็นคำไทยที่คนไทยใช้ตั้งชื่อตำแหน่งในเรซูเม่',
      },
      reason: { type: 'string', description: 'เหตุผลสั้น ๆ ว่าทำไมเนื้องานนี้ควรค้นด้วยตำแหน่งเหล่านี้' },
    },
    required: ['family', 'family_label', 'positions', 'reason'],
  },
};

const FAMILIES = new Set(['A', 'B', 'C', 'D', 'E', 'F']);

function cleanList(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const x of v) {
    const s = String(x ?? '').trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** เลือก provider เหมือน content-gen: anthropic (มี key) / ollama (มี base, ฟรี) / ปิด */
function pickProvider() {
  const apiKey = envString('ANTHROPIC_API_KEY');
  const ollamaBase = envString('OLLAMA_BASE_URL');
  const provider = envString('JOBFAMILY_PROVIDER', apiKey ? 'anthropic' : ollamaBase ? 'ollama' : '');
  return { provider, apiKey, ollamaBase };
}

/** parse JSON แบบทนทาน — เผื่อโมเดลใส่ reasoning/```json fence/ข้อความนำหน้า */
function parseJsonLoose(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* ลองวิธีอื่น */ }
  // ตัด <think>…</think> + code fence ออก
  const cleaned = s.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* ลอง extract {…} */ }
  const i = cleaned.indexOf('{');
  const j = cleaned.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(cleaned.slice(i, j + 1)); } catch { /* ยอมแพ้ */ }
  }
  return null;
}

/** Claude — structured tool output */
async function callAnthropic({ apiKey, system, tool, userMsg }) {
  const model = envString('JOBFAMILY_MODEL', 'claude-haiku-4-5');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userMsg }],
  });
  const block = msg.content?.find((b) => b.type === 'tool_use' && b.name === tool.name);
  return { out: block?.input ?? null, modelUsed: model };
}

/** Ollama (server บริษัท ฟรี) — บังคับ JSON ตาม schema ผ่าน `format` (เหมือน content-gen) */
async function callOllama({ base, system, tool, userMsg }) {
  const model = envString('OLLAMA_MODEL', 'qwen3.5:9b');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false, // qwen3.5 เป็น thinking model — ปิด reasoning ไม่ให้กิน token จนไม่เหลือออก JSON
        options: { temperature: 0.4, num_predict: 2048 },
        format: tool.input_schema,
        messages: [
          { role: 'system', content: system + '\nตอบเป็นภาษาไทย และตอบเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น ห้ามอธิบายนำ' },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const json = await res.json();
    const out = parseJsonLoose(json?.message?.content ?? '');
    if (!out) throw new Error(`ollama ตอบไม่ใช่ JSON (done_reason=${json?.done_reason ?? '?'})`);
    return { out, modelUsed: `ollama:${model}` };
  } finally {
    clearTimeout(timer);
  }
}

/** เรียกโมเดลตาม provider ที่เลือก — คืน {out, modelUsed} หรือ null (ปิด/ล้มเหลว) */
async function callModel({ system, tool, userMsg }) {
  const { provider, apiKey, ollamaBase } = pickProvider();
  if (!provider) return null;
  try {
    if (provider === 'ollama') return await callOllama({ base: ollamaBase, system, tool, userMsg });
    return await callAnthropic({ apiKey, system, tool, userMsg });
  } catch (e) {
    console.warn(`  [job-family] AI call failed (${provider}): ${e.message} — ข้าม`);
    return null;
  }
}

/**
 * @returns {Promise<null | {
 *   family: string, familyLabel: string, gate: string[],
 *   tiers: { green: string[], yellow: string[], red: string[], excluded: {name:string,reason:string}[] },
 *   reason: string, model: string
 * }>}
 */
export async function suggestAdjacentPositions({ position, keyword, province, platform } = {}) {
  const src = String(position || keyword || '').trim();
  if (!src) return null;

  const ctx = [
    `ตำแหน่งต้นทาง: "${src}"`,
    keyword && keyword !== position ? `คำค้นเสริม: "${keyword}"` : '',
    province ? `จังหวัด: ${province}` : '',
    platform ? `เว็บหางาน: ${platform}` : '',
  ].filter(Boolean).join('\n');

  const res = await callModel({
    system: TAXONOMY,
    tool: TOOL,
    userMsg: `จัด Job Family และเสนอตำแหน่งใกล้เคียงสำหรับ:\n${ctx}`,
  });
  if (!res) return null;
  const out = res.out;
  if (!out || !FAMILIES.has(String(out.family))) {
    console.warn('  [job-family] AI คืนผลไม่ถูกรูปแบบ (family นอก A–F) — ข้าม');
    return null;
  }

  const drop = new Set([src, keyword].filter(Boolean).map((s) => s.trim()));
  const filt = (list) => cleanList(list).filter((x) => !drop.has(x));

  return {
    family: out.family,
    familyLabel: String(out.family_label || out.family),
    gate: cleanList(out.gate),
    tiers: {
      green: filt(out.green),
      yellow: filt(out.yellow),
      red: filt(out.red),
      excluded: Array.isArray(out.excluded)
        ? out.excluded.map((e) => ({ name: String(e?.name ?? '').trim(), reason: String(e?.reason ?? '').trim() })).filter((e) => e.name)
        : [],
    },
    reason: String(out.reason || '').trim(),
    model: res.modelUsed,
  };
}

/**
 * โหมดเนื้องาน: รับคำอธิบายภาระงาน คืนชุดคำค้นตำแหน่งที่ค้นผู้สมัครได้จริง
 * (เรียงจากตรงสุด→ใกล้เคียงใน Family เดียวกัน).
 * @param {{ description: string, province?: string, platform?: string }} args
 * @returns {Promise<null | { family:string, familyLabel:string, positions:string[], reason:string, model:string }>}
 */
export async function positionsFromDescription({ description, province, platform } = {}) {
  const desc = String(description || '').trim();
  if (!desc) return null;

  const ctx = [
    `เนื้องาน/ภาระงานที่ต้องการหาคนมาทำ:\n"${desc}"`,
    province ? `จังหวัดที่ทำงาน: ${province}` : '',
    platform ? `เว็บหางาน: ${platform}` : '',
  ].filter(Boolean).join('\n');

  const res = await callModel({
    system:
      TAXONOMY +
      '\n\n## งานตอนนี้\nผู้ใช้ให้ "เนื้องาน" (ไม่ใช่ชื่อตำแหน่ง) มา จงสรุปว่าเนื้องานนี้อยู่ Family ไหน แล้วเสนอ "คำค้นตำแหน่ง" ที่คนทำงานเนื้อแบบนี้มักใช้ตั้งชื่อตำแหน่งในเรซูเม่ เรียงจากตรงที่สุดไปใกล้เคียง เพื่อเอาไปค้นในเว็บหางานให้ได้ผู้สมัครมากที่สุด\nเป้าหมายคือ "กวาดผู้สมัครให้ได้จำนวนมาก" ให้คำค้นหลากหลายอย่างน้อย 6 คำ ครอบคลุมคำพ้องและตำแหน่งใกล้เคียงในสาย Family เดียวกัน ห้ามหลุดนอก Family' +
      '\n\n## สำคัญมาก: คำค้นต้องเป็นภาษาไทยเท่านั้น และต้อง "สั้น-กว้าง-เป็นคำที่คนใช้จริง"\nเว็บหางานเป็นเว็บไทย เรซูเม่คนไทยตั้งชื่อตำแหน่งเป็นไทย ถ้าตอบเป็นอังกฤษจะค้นไม่เจอเลย (ได้ 0 คน). ห้ามมีตัวอักษรอังกฤษในคำค้นแม้แต่คำเดียว.\nกฎความสั้น (สำคัญที่สุด): คำค้นคือ "ชื่อตำแหน่งกว้าง ๆ" ที่คนเขียนในเรซูเม่จริง ยาวไม่เกิน ~4 พยางค์หลัก ห้ามเป็นวลีบรรยายสเปกงาน.\nดี: "พนักงานขาย", "เซลล์", "ที่ปรึกษาการขาย", "นักพัฒนาธุรกิจ", "ธุรการ", "โปรแกรมเมอร์"\nแย่ (ห้ามเด็ดขาด — ค้นแล้วได้ 0): "ผู้เชี่ยวชาญด้านเทคโนโลยีการสื่อสารองค์กร", "เจ้าหน้าที่พรีเซลซอฟต์แวร์", "ที่ปรึกษาการขายโซลูชันดิจิทัล", "พนักงานขายระบบคอมพิวเตอร์"\nข้อมูลจริงจากเว็บ: "เซลล์"=100 คน, "พนักงานขาย"=200+, "นักพัฒนาธุรกิจ"=3, "นักขายซอฟต์แวร์"=0 — คำประกอบหลายส่วนแทบไม่มีใครเขียนในเรซูเม่.\nกฎบังคับ: อย่างน้อยครึ่งหนึ่งของลิสต์ต้องเป็น "คำตำแหน่งพื้นฐานยอดนิยม" (1 คำ เช่น "เซลล์", "ธุรการ", "แคชเชียร์") และเรียงคำพื้นฐานพวกนี้ไว้ต้น ๆ. ระบบมีตัวกรอง อายุ/วุฒิ/จังหวัด แม่น ๆ อยู่หลังบ้านแล้ว ไม่ต้องกลัวกว้างเกิน' +
      '\n\n## รูปแบบคำตอบ (บังคับ)\nตอบเป็น JSON object เดียว ใช้ key เป๊ะ ๆ 4 ตัวนี้เท่านั้น ห้ามใช้ชื่อ key อื่น (ห้ามใช้ job_family หรือ reasoning):\n{"family":"D","family_label":"📋 Service-Operational","positions":["พนักงานคลังสินค้า","พนักงานสโตร์","พนักงานแพ็คสินค้า","พนักงานขับโฟล์คลิฟท์","ธุรการคลัง","เจ้าหน้าที่จัดส่ง"],"reason":"..."}',
    tool: DESC_TOOL,
    userMsg: `แปลงเนื้องานนี้เป็นชุดคำค้นตำแหน่ง:\n${ctx}`,
  });
  if (!res) return null;
  const out = res.out;
  let positions = cleanList(out?.positions);
  // sanitize กันโมเดลดื้อ: ตัดคำที่มีอังกฤษปน + วลียาวเกินจริง (คนไม่เขียนแบบนี้ในเรซูเม่ → ค้นได้ 0)
  const isSearchable = (s) => !/[A-Za-z]/.test(s) && s.length <= 22;
  const searchable = positions.filter(isSearchable);
  if (searchable.length > 0) {
    if (searchable.length < positions.length) {
      console.warn(`  [job-family] ตัดคำค้นที่ยาว/มีอังกฤษออก ${positions.length - searchable.length} คำ: ${positions.filter((p) => !isSearchable(p)).join(', ')}`);
    }
    positions = searchable;
  } else {
    // ทุกคำโดนตัดหมด — เก็บ 3 คำที่สั้นสุดไว้ดีกว่าไม่มีอะไรเลย
    positions = positions.sort((a, b) => a.length - b.length).slice(0, 3);
    console.warn(`  [job-family] คำค้นทุกคำยาวเกิน — ใช้ 3 คำสั้นสุดแทน: ${positions.join(', ')}`);
  }
  if (!out || positions.length === 0) {
    console.warn('  [job-family] แปลงเนื้องานไม่สำเร็จ (ไม่ได้ตำแหน่ง) — ข้าม');
    return null;
  }

  return {
    family: FAMILIES.has(String(out.family)) ? out.family : '',
    familyLabel: String(out.family_label || out.family || ''),
    positions,
    reason: String(out.reason || '').trim(),
    model: res.modelUsed,
  };
}
