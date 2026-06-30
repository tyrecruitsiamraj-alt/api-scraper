import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { envInt, envString } from '../config.js';

const execFileP = promisify(execFile);

const HOST = () => envString('OLLAMA_HOST', 'http://110.49.94.180:11434').replace(/\/$/, '');
const MODEL = () => envString('OCR_MODEL', 'scb10x/typhoon-ocr1.5-3b:latest');
// typhoon-ocr (Qwen2.5-VL) responds best to the documented plain OCR prompt.
const OCR_PROMPT =
  'Below is an image of a document page. Just return the plain text representation of this document as if you were reading it naturally. Do not hallucinate.';

/** OCR a single image buffer via the Ollama vision model. */
async function ocrImage(png) {
  const res = await fetch(`${HOST()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
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
  try {
    if (/^(jpg|jpeg|png|gif|webp)$/.test(t)) {
      const text = await ocrImage(buffer);
      return { text, status: text ? 'success' : 'error:empty' };
    }
    if (t === 'pdf') {
      const pages = await pdfToPngs(buffer, maxPages);
      if (!pages.length) return { text: '', status: 'error:no_pages' };
      const parts = [];
      for (let i = 0; i < pages.length; i += 1) {
        parts.push(await ocrImage(pages[i]));
      }
      const text = parts.filter(Boolean).join('\n\n').trim();
      return { text, status: text ? 'success' : 'error:empty' };
    }
    return { text: '', status: 'skipped:unsupported_type' };
  } catch (e) {
    return { text: '', status: `error:${String(e.message).slice(0, 80)}` };
  }
}
