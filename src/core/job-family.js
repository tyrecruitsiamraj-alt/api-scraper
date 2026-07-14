import Anthropic from '@anthropic-ai/sdk';
import { envString } from '../config.js';

/**
 * AI Job-Family classifier + adjacent-position suggester.
 *
 * เมื่อ scrape ตำแหน่งหนึ่งได้ผู้สมัครไม่ครบ target ระบบเรียกโมดูลนี้เพื่อถาม
 * Claude ว่า "ตำแหน่งนี้อยู่ Job Family ไหน และมีตำแหน่งใกล้เคียงอะไรที่ดึงมา
 * ค้นเพิ่มได้ โดยไม่ข้าม Family". อ้างอิงหลักการจาก Skill `candidate-spec-analyzer`
 * (Job Family taxonomy A–F + adjacent positions 3 tier ผ่าน Gate).
 *
 * เป็น pure caller — ไม่แตะ DB. การ cache/persist ทำที่ผู้เรียก (tasks-worker).
 * ถ้าไม่มี ANTHROPIC_API_KEY จะคืน null เงียบ ๆ (feature ปิดตัวเอง งาน scrape เดิมไม่พัง).
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

/**
 * @returns {Promise<null | {
 *   family: string, familyLabel: string, gate: string[],
 *   tiers: { green: string[], yellow: string[], red: string[], excluded: {name:string,reason:string}[] },
 *   reason: string, model: string
 * }>}
 */
export async function suggestAdjacentPositions({ position, keyword, province, platform } = {}) {
  const apiKey = envString('ANTHROPIC_API_KEY');
  const src = String(position || keyword || '').trim();
  if (!apiKey || !src) return null; // feature off / nothing to classify

  const model = envString('JOBFAMILY_MODEL', 'claude-haiku-4-5');
  const client = new Anthropic({ apiKey });

  const ctx = [
    `ตำแหน่งต้นทาง: "${src}"`,
    keyword && keyword !== position ? `คำค้นเสริม: "${keyword}"` : '',
    province ? `จังหวัด: ${province}` : '',
    platform ? `เว็บหางาน: ${platform}` : '',
  ].filter(Boolean).join('\n');

  let msg;
  try {
    msg = await client.messages.create({
      model,
      max_tokens: 1024,
      system: TAXONOMY,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'adjacent_positions' },
      messages: [{ role: 'user', content: `จัด Job Family และเสนอตำแหน่งใกล้เคียงสำหรับ:\n${ctx}` }],
    });
  } catch (e) {
    console.warn(`  [job-family] AI call failed: ${e.message} — ข้ามการขยายตำแหน่ง`);
    return null;
  }

  const block = msg.content?.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  const out = block?.input;
  if (!out || !FAMILIES.has(String(out.family))) {
    console.warn('  [job-family] AI คืนผลไม่ถูกรูปแบบ (family นอก A–F) — ข้าม');
    return null;
  }

  // อย่าเสนอตำแหน่งต้นทางซ้ำ
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
    model,
  };
}
