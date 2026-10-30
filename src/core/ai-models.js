import { execFile } from 'node:child_process';
import { envString } from '../config.js';

/**
 * เลือกโมเดล AI จากที่เซิร์ฟเวอร์ Ollama มีอยู่จริง (ไม่ฝังชื่อโมเดลตัวเดียว — เซิร์ฟเวอร์เปลี่ยนโมเดลได้ตลอด)
 * - งานข้อความ (แปลงเนื้องาน/เขียนคอนเทนต์ ไม่มีข้อมูลผู้สมัคร): ตัวที่ตั้งไว้ → ในบริษัทตัวอื่น → cloud
 * - OCR เรซูเม่ (มีข้อมูลผู้สมัคร): ในบริษัทเท่านั้น ห้าม cloud
 */
export const DEFAULT_TEXT_MODEL = 'qwen3.5:9b';
export const DEFAULT_OCR_MODEL = 'scb10x/typhoon-ocr1.5-3b:latest';
const CACHE_MS = 5 * 60 * 1000;
const FAIL_CACHE_MS = 60 * 1000;

let tagsCache = { at: 0, base: '', models: null, ttl: CACHE_MS };
let pdfToolCache = null;

export function ollamaBase() {
  return (envString('OLLAMA_HOST') || envString('OLLAMA_BASE_URL')).replace(/\/$/, '');
}

export const isCloudModel = (name) => /(?::|-)cloud$/i.test(String(name));
export const isOcrModel = (name) => /ocr/i.test(String(name));
const isEmbeddingModel = (name) => /embed/i.test(String(name));

/** รายชื่อโมเดลบนเซิร์ฟเวอร์ (จำไว้ 5 นาที · ต่อไม่ได้ = [] จำไว้ 1 นาที) */
export async function listOllamaModels(base = ollamaBase()) {
  if (!base) return [];
  const fresh = tagsCache.models && tagsCache.base === base && Date.now() - tagsCache.at < tagsCache.ttl;
  if (fresh) return tagsCache.models;
  let models = [];
  let ttl = CACHE_MS;
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    models = (json?.models ?? []).map((m) => String(m?.name ?? '')).filter(Boolean);
  } catch (e) {
    console.warn(`  [ai-models] อ่านรายชื่อโมเดลไม่ได้ (${e.message})`);
    ttl = FAIL_CACHE_MS;
  }
  tagsCache = { at: Date.now(), base, models, ttl };
  return models;
}

function configured(listEnv, singleEnv, fallback) {
  const list = envString(listEnv).split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...list, envString(singleEnv), fallback].filter(Boolean))];
}

/** ลำดับโมเดลข้อความ: ที่ตั้งไว้ (ถ้ามีบนเซิร์ฟเวอร์) → ในบริษัทตัวอื่น → cloud */
export function orderTextModels(available, preferred) {
  const usable = available.filter((m) => !isOcrModel(m) && !isEmbeddingModel(m));
  const pref = preferred.filter((m) => usable.includes(m));
  const local = usable.filter((m) => !isCloudModel(m) && !pref.includes(m));
  const cloud = usable.filter((m) => isCloudModel(m) && !pref.includes(m));
  return [...pref, ...local, ...cloud];
}

/** ลำดับโมเดล OCR: ในบริษัทเท่านั้น — ที่ตั้งไว้ก่อน แล้วโมเดลที่ชื่อมี ocr */
export function orderOcrModels(available, preferred) {
  const local = available.filter((m) => !isCloudModel(m));
  const pref = preferred.filter((m) => local.includes(m));
  return [...pref, ...local.filter((m) => isOcrModel(m) && !pref.includes(m))];
}

/** โมเดลข้อความที่จะลองตามลำดับ (สูงสุด 3 ตัว) */
export async function textModelCandidates() {
  const available = await listOllamaModels();
  return orderTextModels(available, configured('OLLAMA_TEXT_MODELS', 'OLLAMA_MODEL', DEFAULT_TEXT_MODEL)).slice(0, 3);
}

/** โมเดล OCR ที่ใช้ได้ตอนนี้ หรือ null = ยังไม่มีในบริษัท */
export async function ocrModel() {
  const available = await listOllamaModels();
  return orderOcrModels(available, configured('OCR_MODELS', 'OCR_MODEL', DEFAULT_OCR_MODEL))[0] ?? null;
}

/** เครื่องนี้มีตัวแปลง PDF (poppler: pdftoppm) ไหม */
export async function hasPdfTool() {
  if (pdfToolCache !== null) return pdfToolCache;
  pdfToolCache = await new Promise((resolve) => {
    execFile('pdftoppm', ['-v'], (error) => resolve(!error || error.code !== 'ENOENT'));
  });
  return pdfToolCache;
}

/** สถานะ AI ของเครื่องนี้ ส่งไปกับ heartbeat ให้หน้าเว็บบอกได้ว่าใช้ได้ไหม */
export async function aiStatus() {
  const base = ollamaBase();
  const [text, ocr, pdf] = await Promise.all([textModelCandidates(), ocrModel(), hasPdfTool()]);
  return {
    server: Boolean(base),
    text_model: text[0] ?? null,
    ocr_model: ocr,
    pdf_tool: pdf,
  };
}
