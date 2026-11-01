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
// เซิร์ฟเวอร์ลิสต์โมเดลที่เรียกไม่ได้ด้วย (cloud แบบเสียเงินตอบ 402) — ข้ามตัวนั้น 30 นาที
const UNUSABLE_MS = 30 * 60 * 1000;
const PROBE_MS = 10 * 60 * 1000;
const MAX_TEXT_ATTEMPTS = 3;

let tagsCache = { at: 0, base: '', models: null, ttl: CACHE_MS };
let pdfToolCache = null;
const unusableUntil = new Map();
let probeCache = { at: 0, model: null };

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

/** 402/403/404 = เรียกโมเดลนี้ไม่ได้เลย (ไม่มีสิทธิ์/ไม่มีจริง) ต่างจากช้าหรือล่มชั่วคราว */
export const isUnusableModelError = (e) => /HTTP 40[234]\b/.test(String(e?.message ?? e));

export function markModelUnusable(model) {
  unusableUntil.set(model, Date.now() + UNUSABLE_MS);
  if (probeCache.model === model) probeCache = { at: 0, model: null };
}

const isUsable = (model) => !(unusableUntil.get(model) > Date.now());

/** โมเดลข้อความที่จะลองตามลำดับ ไม่รวมตัวที่เพิ่งเรียกไม่ได้ */
export async function textModelCandidates() {
  const available = await listOllamaModels();
  return orderTextModels(available, configured('OLLAMA_TEXT_MODELS', 'OLLAMA_MODEL', DEFAULT_TEXT_MODEL)).filter(isUsable);
}

/**
 * เรียก call(model) ไล่ตามลำดับจนสำเร็จ — ตัวที่เรียกไม่ได้ (402/403/404) ข้ามทันทีไม่นับรอบ
 * ล้มแบบอื่น (ช้า/ตอบผิดรูป) ลองได้ไม่เกิน 3 ตัว เพราะรอบละนานได้ถึง 3 นาที
 */
export async function withTextModel(call) {
  const models = await textModelCandidates();
  if (!models.length) throw new Error('เซิร์ฟเวอร์ AI ไม่มีโมเดลที่ใช้ได้');
  const errors = [];
  let attempts = 0;
  for (const model of models) {
    try {
      return await call(model);
    } catch (e) {
      errors.push(`${model}: ${e.message}`);
      if (isUnusableModelError(e)) {
        markModelUnusable(model);
        continue;
      }
      attempts += 1;
      if (attempts >= MAX_TEXT_ATTEMPTS) break;
    }
  }
  throw new Error(errors.join(' · '));
}

/** ลองเรียกจริงด้วยข้อความสั้น ๆ (จำไว้ 10 นาที) — มีชื่อในรายการไม่ได้แปลว่าใช้ได้ */
async function workingTextModel() {
  if (probeCache.model && Date.now() - probeCache.at < PROBE_MS) return probeCache.model;
  const base = ollamaBase();
  if (!base) return null;
  const model = await withTextModel(async (name) => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ model: name, stream: false, think: false, options: { num_predict: 1 }, messages: [{ role: 'user', content: 'ok' }] }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    return name;
  }).catch(() => null);
  probeCache = { at: Date.now(), model };
  return model;
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
  const [text, ocr, pdf] = await Promise.all([workingTextModel(), ocrModel(), hasPdfTool()]);
  return {
    server: Boolean(base),
    text_model: text,
    ocr_model: ocr,
    pdf_tool: pdf,
  };
}
