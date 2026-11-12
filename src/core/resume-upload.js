/**
 * อัปโหลดเรซูเม่เข้าคลังผู้สมัคร (เจ้าของ 12 พ.ย. 2569)
 * ไฟล์ (PDF / Word .docx / รูป) → ข้อความ → AI ของบริษัทแยกเป็นช่องข้อมูล → บันทึก/เทียบคนเดิม
 * เรซูเม่มีข้อมูลส่วนบุคคล: ใช้โมเดลในบริษัทเท่านั้น ห้าม cloud (เหมือน OCR ไฟล์แนบ)
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ollamaBase, withTextModel } from './ai-models.js';
import { extractAttachment } from './ollama.js';
import { applyThaiNameSplit } from './thai-name.js';
import { ResumeReadError, MIN_TEXT_CHARS, docxText } from './resume-files.js';

export { ResumeReadError, MAX_FILE_BYTES, MAX_FILES, MIN_TEXT_CHARS, fileKind, docxText } from './resume-files.js';

const execFileP = promisify(execFile);

/** ข้อความใน PDF ที่มีตัวอักษรจริง (poppler: pdftotext) · ไม่มีเครื่องมือ = '' */
async function pdfTextLayer(buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'resume-'));
  try {
    const path = join(dir, 'in.pdf');
    await writeFile(path, buffer);
    const { stdout } = await execFileP('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'], { maxBuffer: 20 * 1024 * 1024 });
    return String(stdout ?? '').trim();
  } catch (e) {
    if (e?.code === 'ENOENT') return '';
    throw new ResumeReadError('เปิดไฟล์ PDF ไม่ได้ ไฟล์อาจเสียหรือติดรหัสผ่าน');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** ให้ AI อ่านรูป/PDF สแกน · บอกเหตุเป็นภาษาคนเมื่ออ่านไม่ได้ */
async function ocrText(buffer, fileType) {
  const r = await extractAttachment(buffer, fileType);
  if (r.status === 'success' && r.text) return r.text;
  if (r.waiting === 'no_ocr_model') throw new ResumeReadError('ตอนนี้เซิร์ฟเวอร์ AI ของบริษัทไม่มีโมเดลอ่านรูป อ่านไฟล์รูปหรือ PDF สแกนไม่ได้');
  if (r.waiting === 'no_pdf_tool') throw new ResumeReadError('เครื่องที่อ่านไฟล์ยังไม่มีตัวแปลง PDF อ่าน PDF สแกนไม่ได้');
  if (r.waiting) throw new ResumeReadError('ต่อเซิร์ฟเวอร์ AI ของบริษัทไม่ได้ ลองอัปโหลดใหม่อีกครั้ง');
  throw new ResumeReadError('อ่านตัวหนังสือในไฟล์ไม่ได้ ภาพอาจไม่ชัด');
}

/** ไฟล์ → ข้อความ · คืน { text, via } */
export async function extractResumeText(buffer, kind) {
  if (kind === 'doc') throw new ResumeReadError('ไฟล์ Word แบบเก่า (.doc) อ่านไม่ได้ เปิดแล้วบันทึกเป็น .docx หรือ PDF ก่อน');
  if (kind === 'docx') return { text: docxText(buffer), via: 'docx' };
  if (kind === 'image') return { text: await ocrText(buffer, 'png'), via: 'ocr' };
  if (kind === 'pdf') {
    const layer = await pdfTextLayer(buffer);
    if (layer.replace(/\s+/g, '').length >= MIN_TEXT_CHARS) return { text: layer, via: 'pdf' };
    return { text: await ocrText(buffer, 'pdf'), via: 'ocr' };
  }
  throw new ResumeReadError('รับเฉพาะไฟล์ PDF, Word (.docx) และรูป (JPG, PNG)');
}

const str = { type: 'string' };
const RESUME_SCHEMA = {
  type: 'object',
  properties: {
    prefix: str, first_name: str, last_name: str, full_name: str,
    phone: str, email: str, line_id: str,
    gender: str, age: str, birth_date: str, nationality: str, religion: str,
    height: str, weight: str, marital_status: str, military_status: str, driving_license: str,
    address: str, province: str, desired_positions: str, expected_salary: str, intro: str,
    education: {
      type: 'array',
      items: { type: 'object', properties: { degree: str, major: str, institution: str, graduation_year: str, gpa: str } },
    },
    work_experience: {
      type: 'array',
      items: { type: 'object', properties: { position: str, company: str, period: str, salary: str, responsibilities: str } },
    },
    hard_skills: { type: 'array', items: str },
    soft_skills: { type: 'array', items: str },
    language_skills: { type: 'array', items: { type: 'object', properties: { language: str, level: str } } },
  },
  required: ['full_name', 'phone', 'email'],
};

const SYSTEM = [
  'คุณอ่านเรซูเม่ผู้สมัครงาน แล้วแยกข้อมูลลงช่องตามโครงสร้าง JSON ที่กำหนด',
  'ใช้เฉพาะข้อมูลที่เขียนในเรซูเม่ ห้ามเดาหรือแต่งเพิ่ม ช่องไหนไม่มีให้เว้นว่าง ("" หรือ [])',
  'ความหมายของแต่ละช่อง:',
  '- prefix คำนำหน้า (นาย/นาง/นางสาว) · first_name ชื่อ · last_name นามสกุล · full_name ชื่อเต็มรวมคำนำหน้า',
  '- phone เบอร์มือถือของผู้สมัครเบอร์เดียว ตัวเลขล้วน · email · line_id',
  '- gender เพศ · age อายุเป็นตัวเลขปี (เช่น "อายุ 27 ปี" → "27") · birth_date วันเกิดตามที่เขียน',
  '- nationality สัญชาติ · religion ศาสนา · height ส่วนสูง · weight น้ำหนัก · marital_status สถานภาพ · military_status การเกณฑ์ทหาร · driving_license ใบขับขี่ที่มี',
  '- address ที่อยู่ · province จังหวัดภาษาไทย',
  '- desired_positions ตำแหน่งที่ต้องการสมัคร (หลายตำแหน่งคั่นด้วย ", ") · expected_salary เงินเดือนที่ต้องการตามที่เขียน',
  '- intro ข้อความแนะนำตัว/เป้าหมายอาชีพ (ถ้ามี)',
  '- education ทุกระดับที่เขียน เรียงล่าสุดก่อน: degree วุฒิ · major คณะ/สาขา · institution สถานศึกษา · graduation_year ปีที่จบ · gpa เกรดเฉลี่ย',
  '- work_experience ทุกงาน เรียงล่าสุดก่อน: position ตำแหน่ง · company บริษัท · period ช่วงเวลา · salary เงินเดือน · responsibilities หน้าที่',
  '- hard_skills ทักษะเฉพาะทาง/โปรแกรม/เครื่องมือ (เช่น Excel, ขับรถยนต์, พิมพ์ดีด) · soft_skills ทักษะทั่วไป (เช่น ทำงานเป็นทีม)',
  '- language_skills เฉพาะภาษาที่เรซูเม่เขียนถึง: language ภาษา · level ระดับ',
  'ตอบเป็น JSON เท่านั้น ห้ามอธิบาย',
].join('\n');

function parseJsonLoose(raw) {
  const s = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    const i = s.indexOf('{');
    const j = s.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(s.slice(i, j + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** ข้อความเรซูเม่ → ช่องข้อมูล ด้วยโมเดลในบริษัท */
export async function structureResume(text) {
  const base = ollamaBase();
  if (!base) throw new ResumeReadError('เครื่องที่อ่านไฟล์ยังไม่ได้ตั้งเซิร์ฟเวอร์ AI ของบริษัท');
  const body = String(text).slice(0, 12000);
  try {
    return await withTextModel(async (model) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 240_000);
      try {
        const res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            stream: false,
            think: false,
            format: RESUME_SCHEMA,
            options: { temperature: 0, num_predict: 4096 },
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: `เรซูเม่:\n${body}` },
            ],
          }),
        });
        if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
        const json = await res.json();
        const out = parseJsonLoose(json?.message?.content ?? '');
        if (!out || typeof out !== 'object') throw new Error('AI ตอบไม่ใช่ JSON');
        return { parsed: normalizeParsed(out, text), model };
      } finally {
        clearTimeout(timer);
      }
    }, { localOnly: true });
  } catch (e) {
    if (e instanceof ResumeReadError) throw e;
    throw new ResumeReadError(`AI ของบริษัทอ่านเรซูเม่ไม่สำเร็จ (${String(e.message).slice(0, 120)})`);
  }
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const list = (v) => (Array.isArray(v) ? v : []);

/** จัดค่าที่ AI ตอบให้อยู่ในรูปเดียวกับคนที่ได้จาก Scrap */
export function normalizeParsed(out, rawText = '') {
  const r = {};
  for (const k of [
    'prefix', 'first_name', 'last_name', 'full_name', 'phone', 'email', 'line_id', 'gender', 'age', 'birth_date',
    'nationality', 'religion', 'height', 'weight', 'marital_status', 'military_status', 'driving_license',
    'address', 'province', 'desired_positions', 'expected_salary', 'intro',
  ]) r[k] = clean(out?.[k]);
  const digits = r.phone.replace(/\D/g, '');
  r.phone = digits.length >= 9 && digits.length <= 12 ? digits : '';
  r.email = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(r.email) ? r.email.toLowerCase() : '';
  r.age = r.age.match(/\d{2}/)?.[0] ?? '';
  if (!r.full_name) r.full_name = [r.prefix, r.first_name, r.last_name].filter(Boolean).join(' ');
  r.education = list(out?.education)
    .map((e) => ({ degree: clean(e?.degree), major: clean(e?.major), institution: clean(e?.institution), graduation_year: clean(e?.graduation_year), gpa: clean(e?.gpa) }))
    .filter((e) => e.institution || e.degree || e.major);
  r.work_experience = list(out?.work_experience)
    .map((w) => ({ position: clean(w?.position), company: clean(w?.company), period: clean(w?.period), salary: clean(w?.salary), responsibilities: String(w?.responsibilities ?? '').trim() }))
    .filter((w) => w.position || w.company);
  r.hard_skills = list(out?.hard_skills).map(clean).filter(Boolean);
  r.soft_skills = list(out?.soft_skills).map(clean).filter(Boolean);
  r.language_skills = list(out?.language_skills)
    .map((l) => ({ language: clean(l?.language), level: clean(l?.level) }))
    .filter((l) => l.language);
  // ใช้ตัวแยกชื่อไทยเดียวกับคนที่ได้จาก Scrap (คำนำหน้า / ชื่อ / นามสกุล)
  const named = applyThaiNameSplit({ name: r.full_name, prefix: r.prefix, first_name: r.first_name, last_name: r.last_name }, rawText);
  r.prefix = clean(named.prefix ?? r.prefix);
  r.first_name = clean(named.first_name ?? r.first_name);
  r.last_name = clean(named.last_name ?? r.last_name);
  r.full_name = clean(named.name ?? r.full_name) || r.full_name;
  return r;
}

/** ข้อมูลพอให้เป็นผู้สมัครไหม: ต้องมีชื่อ และมีเบอร์หรืออีเมลอย่างน้อยหนึ่งอย่าง */
export function missingEssentials(parsed) {
  if (!clean(parsed?.full_name)) return 'อ่านชื่อผู้สมัครจากไฟล์ไม่ได้';
  if (!clean(parsed?.phone) && !clean(parsed?.email)) return 'ในไฟล์ไม่มีเบอร์โทรหรืออีเมลของผู้สมัคร';
  return null;
}
