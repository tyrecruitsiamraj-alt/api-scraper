import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { envInt } from '../config.js';
import { hasPdfTool, ocrModel, ollamaBase } from './ai-models.js';

const execFileP = promisify(execFile);

/** ยังอ่านไม่ได้ตอนนี้ (ไม่มีโมเดล OCR ในบริษัท / ไม่มีตัวแปลง PDF) — คงไว้เป็น pending ให้อ่านย้อนทีหลัง */
export const OCR_WAITING = 'pending';
// typhoon-ocr (Qwen2.5-VL) responds best to the documented plain OCR prompt.
const OCR_PROMPT =
  'Below is an image of a document page. Just return the plain text representation of this document as if you were reading it naturally. Do not hallucinate.';

/**
 * ช่องความจำของโมเดลอ่านรูป — ค่าเริ่มของเซิร์ฟเวอร์ 4096 ไม่พอรูปเอกสารหนึ่งหน้า (ตัวรูปกินเกือบหมด)
 * โมเดลจึงพิมพ์วนซ้ำจนเซิร์ฟเวอร์ตัดทิ้ง ("token repeat limit reached") แล้วเราเคยแปลผิดว่าต่อเซิร์ฟเวอร์ไม่ได้
 * ทดลองรูปจริง 12 ไฟล์ 16 พ.ย. 2569: 4096 อ่านได้ 1 ไฟล์ (เฉลี่ย 16 ตัวอักษร) · 16384 ได้ 10 ไฟล์ (เฉลี่ย 4,107) · ย่อรูปแย่ลง
 */
const ocrNumCtx = () => envInt('OCR_NUM_CTX', 16384);

/** ท้ายข้อความที่โมเดลวนบรรทัดเดิม: ตัดตั้งแต่บรรทัดที่ซ้ำติดกันครั้งที่ 3 (เก็บส่วนที่อ่านได้จริงไว้) */
export function cutRepeatedTail(text) {
  const out = [];
  let run = 0;
  for (const line of String(text ?? '').split('\n')) {
    const same = out.length && line.trim() && line.trim() === out[out.length - 1].trim();
    run = same ? run + 1 : 0;
    if (run >= 2) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** โมเดลอ่านรูปวนซ้ำก่อนได้ข้อความพอใช้ — ไม่ใช่เซิร์ฟเวอร์ล่ม (ไม่รอซ้ำ บอกเหตุตรง ๆ) */
export const OCR_LOOP_STATUS = 'error:ocr_loop';

/**
 * อ่านรูปหนึ่งรูปด้วยโมเดลในบริษัท · รับคำตอบทีละท่อน: ถ้าเซิร์ฟเวอร์ตัดกลางทางเพราะวนซ้ำ ยังได้ส่วนก่อนวน
 * ได้ข้อความไม่ถึง 30 ตัวก่อนถูกตัด = throw ocr_loop
 */
async function ocrImage(png, model) {
  const res = await fetch(`${ollamaBase()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: OCR_PROMPT,
      images: [png.toString('base64')],
      stream: true,
      options: { temperature: 0, num_ctx: ocrNumCtx() },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (/repeat limit/i.test(body)) throw new Error('ocr_loop');
    throw new Error(`ollama HTTP ${res.status}`);
  }
  let text = '';
  let failed = '';
  let buf = '';
  const take = (line) => {
    if (!line.trim()) return;
    const j = JSON.parse(line);
    if (j.error) failed = String(j.error);
    if (j.response) text += j.response;
  };
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      take(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  take(buf);
  const kept = cutRepeatedTail(text);
  if (failed && kept.replace(/\s+/g, '').length < 30) throw new Error(/repeat limit/i.test(failed) ? 'ocr_loop' : `ollama HTTP 500 ${failed.slice(0, 60)}`);
  return kept;
}

/**
 * ข้อความที่โมเดลอ่านรูปพิมพ์ออกมาแต่ไม่ใช่ของในเอกสาร: แบบฟอร์มที่โมเดลจำมาตอนฝึก (RAW_TEXT_START / Page dimensions)
 * และคำสั่งที่โมเดลพิมพ์ทวน · 19 พ.ย. 2569 เรซูเม่รูป 2 คอลัมน์ได้แค่ชื่อบนสุด + บรรทัดพวกนี้ 107 ตัวอักษร
 */
const OCR_JUNK_LINE =
  /^(RAW_TEXT_(START|END)|Page dimensions:.*|\[Image \d+x\d+ to \d+x\d+\]|NA|\**Extract all text from the image\.?\**|Instructions:|- (Only return the clean Markdown|Do not include any explanation).*)$/i;

export function cleanOcrText(text) {
  return String(text ?? '')
    .split('\n')
    .filter((line) => !OCR_JUNK_LINE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * อ่านทั้งหน้าแล้วดูเหมือนไม่ครบ: มีบรรทัดขยะของโมเดล หรือแทบไม่ได้ตัวหนังสือ
 * (ไม่ดูความยาวอย่างเดียว — ไฟล์แนบอย่างบัตร/ใบรับรองมีตัวหนังสือน้อยจริง ไม่ต้องอ่านซ้ำเป็นแถบ)
 */
export function ocrLooksCut(raw, cleaned) {
  const junk = String(raw ?? '').split('\n').some((line) => OCR_JUNK_LINE.test(line.trim()) && line.trim() !== 'NA');
  return junk || cleaned.replace(/\s+/g, '').length < 30;
}

/**
 * อ่านรูปหนึ่งหน้า: อ่านทั้งหน้าก่อน ถ้าดูเหมือนอ่านไม่ครบ ตัดเป็นแถบแนวนอนแล้วอ่านทีละแถบ ใช้ผลที่ได้ตัวหนังสือมากกว่า
 * ทดลองเรซูเม่รูปจริง 19 พ.ย. 2569: ทั้งหน้า 107 ตัว (ชื่อ + ขยะ) · 3 แถบ ~1,900 ตัว (การศึกษา การทำงาน เบอร์โทร)
 */
async function ocrPage(png, model) {
  let raw = '';
  try {
    raw = await ocrImage(png, model);
  } catch (e) {
    // ทั้งหน้าอ่านวนซ้ำ — ลองทีละแถบก่อน ได้ไม่ถึง 30 ตัวค่อยบอกว่าอ่านวน
    if (String(e.message) !== 'ocr_loop') throw e;
  }
  const whole = cleanOcrText(raw);
  if (!ocrLooksCut(raw, whole)) return whole;
  let strips = [];
  try {
    const { splitImageStrips } = await import('./image-strips.js');
    strips = await splitImageStrips(png, envInt('OCR_STRIPS', 3));
  } catch (e) {
    console.warn(`  [ocr] ตัดรูปเป็นแถบไม่ได้ ใช้ผลอ่านทั้งหน้า: ${String(e?.message ?? e).slice(0, 120)}`);
    if (!raw) throw new Error('ocr_loop');
    return whole;
  }
  const parts = [];
  for (const strip of strips) {
    try {
      parts.push(cleanOcrText(await ocrImage(strip, model)));
    } catch (e) {
      if (String(e.message) !== 'ocr_loop') throw e;
    }
  }
  const joined = parts.filter(Boolean).join('\n').trim();
  const best = joined.replace(/\s+/g, '').length > whole.replace(/\s+/g, '').length ? joined : whole;
  if (!raw && best.replace(/\s+/g, '').length < 30) throw new Error('ocr_loop');
  return best;
}

/** Rasterize a PDF to PNG page buffers using poppler (pdftoppm). */
export async function pdfToPngs(pdf, maxPages) {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
  try {
    const pdfPath = join(dir, 'in.pdf');
    await writeFile(pdfPath, pdf);
    await execFileP('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', String(maxPages), pdfPath, join(dir, 'p')]);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    return Promise.all(files.map((f) => readFile(join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Extract text from an attachment buffer via Ollama (typhoon-ocr).
 * Images go straight in; PDFs are rasterized (poppler) page-by-page.
 * Returns { text, status }.
 */
export async function extractAttachment(buffer, fileType) {
  const t = String(fileType ?? '').toLowerCase();
  const maxPages = envInt('OCR_MAX_PAGES', 6);
  const isImage = /^(jpg|jpeg|png|gif|webp)$/.test(t);
  if (!isImage && t !== 'pdf') return { text: '', status: 'skipped:unsupported_type' };
  // เรซูเม่มีข้อมูลส่วนบุคคล: อ่านด้วยโมเดลในบริษัทเท่านั้น ยังไม่มี = รออ่าน (ไม่ตีว่าล้ม)
  const model = ollamaBase() ? await ocrModel() : null;
  if (!model) return { text: '', status: OCR_WAITING, waiting: 'no_ocr_model' };
  if (t === 'pdf' && !(await hasPdfTool())) return { text: '', status: OCR_WAITING, waiting: 'no_pdf_tool' };
  try {
    if (isImage) {
      const text = await ocrPage(buffer, model);
      return { text, status: text ? 'success' : 'error:empty', model };
    }
    if (t === 'pdf') {
      const pages = await pdfToPngs(buffer, maxPages);
      if (!pages.length) return { text: '', status: 'error:no_pages' };
      const parts = [];
      for (let i = 0; i < pages.length; i += 1) {
        parts.push(await ocrPage(pages[i], model));
      }
      const text = parts.filter(Boolean).join('\n\n').trim();
      return { text, status: text ? 'success' : 'error:empty', model };
    }
    return { text: '', status: 'skipped:unsupported_type' };
  } catch (e) {
    if (String(e.message) === 'ocr_loop') return { text: '', status: OCR_LOOP_STATUS, model };
    // เซิร์ฟเวอร์/โมเดลหายชั่วคราว ไม่ใช่ไฟล์เสีย — รออ่านใหม่ ไม่ตีว่าล้ม
    if (/ollama HTTP (404|5\d\d)|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOENT|aborted/i.test(String(e.message))) {
      return { text: '', status: OCR_WAITING, waiting: String(e.message).slice(0, 80) };
    }
    return { text: '', status: `error:${String(e.message).slice(0, 80)}` };
  }
}
