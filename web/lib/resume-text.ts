import 'server-only';
import { docxText, MIN_TEXT_CHARS, ResumeReadError } from '../../src/core/resume-files.js';

/**
 * ตัวหนังสือในไฟล์ที่อ่านได้โดยไม่ต้องใช้ AI (PDF ที่มีตัวอักษร / Word .docx) — อ่านตอนรับไฟล์บนเว็บ
 * เครื่องอ่านไฟล์ (RM009) ไม่มีตัวแปลง PDF จึงอ่านที่เว็บแทน · PDF สแกน/รูป คืน '' ให้ AI อ่านรูปทีหลัง
 */
export async function plainResumeText(kind: string, content: Buffer): Promise<string> {
  if (kind === 'docx') return docxText(content);
  if (kind !== 'pdf') return '';
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(content));
    const { text } = await extractText(pdf, { mergePages: true });
    // PDF บางไฟล์เก็บ "ำ" เป็นนิคหิต + า (จํากัด) — รวมกลับเป็นสระอำ ไม่งั้นค้น/เทียบชื่อไม่เจอ
    const out = String(text ?? '').replace(/\u0E4D\u0E32/g, '\u0E33').trim();
    return out.replace(/\s+/g, '').length >= MIN_TEXT_CHARS ? out : '';
  } catch (e) {
    if (/password/i.test(String((e as Error)?.message))) throw new ResumeReadError('ไฟล์ PDF ติดรหัสผ่าน เปิดไม่ได้');
    throw new ResumeReadError('เปิดไฟล์ PDF ไม่ได้ ไฟล์อาจเสีย');
  }
}
