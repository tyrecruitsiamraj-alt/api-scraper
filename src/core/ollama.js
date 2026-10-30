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

/** OCR a single image buffer via the Ollama vision model. */
async function ocrImage(png, model) {
  const res = await fetch(`${ollamaBase()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: OCR_PROMPT,
      images: [png.toString('base64')],
      stream: false,
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
  const j = await res.json();
  return (j.response ?? '').trim();
}

/** Rasterize a PDF to PNG page buffers using poppler (pdftoppm). */
async function pdfToPngs(pdf, maxPages) {
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
      const text = await ocrImage(buffer, model);
      return { text, status: text ? 'success' : 'error:empty', model };
    }
    if (t === 'pdf') {
      const pages = await pdfToPngs(buffer, maxPages);
      if (!pages.length) return { text: '', status: 'error:no_pages' };
      const parts = [];
      for (let i = 0; i < pages.length; i += 1) {
        parts.push(await ocrImage(pages[i], model));
      }
      const text = parts.filter(Boolean).join('\n\n').trim();
      return { text, status: text ? 'success' : 'error:empty', model };
    }
    return { text: '', status: 'skipped:unsupported_type' };
  } catch (e) {
    // เซิร์ฟเวอร์/โมเดลหายชั่วคราว ไม่ใช่ไฟล์เสีย — รออ่านใหม่ ไม่ตีว่าล้ม
    if (/ollama HTTP (404|5\d\d)|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOENT|aborted/i.test(String(e.message))) {
      return { text: '', status: OCR_WAITING, waiting: String(e.message).slice(0, 80) };
    }
    return { text: '', status: `error:${String(e.message).slice(0, 80)}` };
  }
}
