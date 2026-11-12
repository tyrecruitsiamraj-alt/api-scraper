/**
 * ส่วนอ่านไฟล์เรซูเม่ที่ไม่พึ่ง AI — ใช้ได้ทั้งเว็บ (ตอนรับไฟล์) และเครื่องอ่านไฟล์
 * ไม่ import อะไรที่ต้องใช้ .env หรือโปรแกรมนอก Node
 */
import { readZipEntry } from './zip.js';

/** ความผิดพลาดที่บอกคนอัปโหลดได้ตรง ๆ ว่าไฟล์นี้อ่านไม่ได้เพราะอะไร */
export class ResumeReadError extends Error {}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 20;
/** PDF ที่มีตัวอักษรน้อยกว่านี้ถือว่าเป็นภาพสแกน ต้องให้ AI อ่านรูป */
export const MIN_TEXT_CHARS = 80;

/** ชนิดไฟล์จากนามสกุล/ชนิด MIME · null = ไม่รับ */
export function fileKind(name, mime = '') {
  const ext = String(name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const m = String(mime ?? '').toLowerCase();
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (ext === 'docx' || m.includes('wordprocessingml')) return 'docx';
  if (ext === 'doc' || m === 'application/msword') return 'doc';
  if (/^(jpe?g|png|webp)$/.test(ext) || /^image\/(jpeg|png|webp)$/.test(m)) return 'image';
  return null;
}

/** ข้อความใน .docx: word/document.xml ตัดแท็ก · ย่อหน้าขึ้นบรรทัดใหม่ */
export function docxText(buffer) {
  const xml = readZipEntry(buffer, 'word/document.xml');
  if (!xml) throw new ResumeReadError('เปิดไฟล์ Word ไม่ได้ ไฟล์อาจเสีย');
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

