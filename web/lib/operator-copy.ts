/**
 * คำและชื่อที่แสดงต่อเจ้าหน้าที่ต้องมาจากข้อมูลจริง แต่ไม่ควรบังคับให้คน
 * อ่าน raw criteria, queue หรือข้อความ error ของ provider เพื่อทำงานต่อได้.
 */

const TECHNICAL_PREFIXES = /^(เนื้องาน\s*[:：]?|หน้าที่รับผิดชอบ\s*[:：]?|รายละเอียดงาน\s*[:：]?)/i;

export function cleanOperatorText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(TECHNICAL_PREFIXES, '')
    .trim();
}

export function shortOperatorText(value: unknown, max = 72): string {
  const text = cleanOperatorText(value);
  if (!text) return '';
  if (text.length <= max) return text;
  const firstBreak = text.search(/[•\n]|\s[-–—]\s|\d+[.)]/);
  const candidate = firstBreak > 8 ? text.slice(0, firstBreak).trim() : text.slice(0, max).trim();
  return `${candidate.slice(0, max).trim()}…`;
}

/** ไม่เดาตำแหน่งจากเนื้องานยาว: ถ้าใบขอไม่มีตำแหน่งที่เชื่อถือได้ให้บอกตรง ๆ */
export function operatorJobTitle(input: {
  position?: unknown;
  title?: unknown;
  requestNo?: unknown;
}): string {
  const position = cleanOperatorText(input.position);
  if (position && position.length <= 90) return position;
  const title = cleanOperatorText(input.title);
  if (title && title.length <= 90 && title !== String(input.requestNo ?? '').trim()) return title;
  return 'ตำแหน่งยังไม่ระบุ';
}

export function operatorWorkIdentity(input: {
  requestNo?: string | null;
  title: string;
  location?: string | null;
  requester?: string | null;
}): string {
  return [input.requestNo, input.title, input.location || input.requester]
    .filter((value): value is string => Boolean(String(value ?? '').trim()))
    .join(' · ');
}

/** แปลง Error ที่ยืนยันแล้วให้บอกผลกระทบและทางออก โดยยังเก็บ raw error ในส่วนผู้ดูแล */
export function humanizeOperatorError(value: string | null | undefined): {
  title: string;
  detail: string;
  next: string;
  technical: string | null;
} | null {
  const technical = String(value ?? '').trim();
  if (!technical) return null;
  const lower = technical.toLowerCase();
  if (lower.includes('resume search talent premium page not ready') || lower.includes('/resumes/premium')) {
    return {
      title: 'บัญชี JobBKK ยังไม่มีสิทธิ์ค้นหา Resume',
      detail: 'ระบบเข้าสู่บัญชีได้ แต่เปิดหน้าค้นหา Resume ของ JobBKK ไม่ได้ จึงยังไม่เริ่มดึงผู้สมัคร',
      next: 'ใช้ JobThai สำหรับงานนี้ หรือให้ผู้ดูแลตรวจสิทธิ์/แพ็กเกจ Resume Search Talent ของ JobBKK ก่อน',
      technical,
    };
  }
  if (lower.includes('ยังไม่มีเครื่องค้นหาผู้สมัคร') || lower.includes('ยังไม่มีเครื่อง') || lower.includes('worker')) {
    return {
      title: 'ยังไม่มีเครื่องรับงานค้นหา',
      detail: 'ระบบรับใบงานแล้ว แต่ยังไม่มีเครื่องค้นหาที่พร้อมเริ่มงาน',
      next: 'รอให้เครื่องหลักออนไลน์ แล้วกดเริ่มงานอีกครั้ง ข้อมูลและเกณฑ์เดิมยังอยู่ครบ',
      technical,
    };
  }
  if (lower.includes('login') || lower.includes('session')) {
    return {
      title: 'ต้องเข้าสู่ระบบของแพลตฟอร์มใหม่',
      detail: 'การเชื่อมต่อกับเว็บไซต์หาผู้สมัครหมดอายุหรือยืนยันตัวตนไม่ผ่าน',
      next: 'ให้ผู้ดูแลตรวจบัญชี Connector แล้วลองเริ่มงานอีกครั้ง',
      technical,
    };
  }
  return {
    title: 'ระบบหยุดระหว่างทำงาน',
    detail: 'งานนี้ยังทำไม่จบ แต่ข้อมูลและผลที่ได้ก่อนหยุดยังอยู่ครบ',
    next: 'เปิดรายละเอียดเพื่อตรวจเกณฑ์ แล้วลองเริ่มงานใหม่หรือส่งให้ผู้ดูแลตรวจสอบ',
    technical,
  };
}

export function humanizeJobFamily(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const map: Record<string, string> = {
    'Technical-Skilled': 'กลุ่มงานเทคนิค',
    'Service-Operational': 'กลุ่มงานบริการและปฏิบัติการ',
    'Transport/Driver': 'กลุ่มงานขับรถและขนส่ง',
  };
  for (const [needle, label] of Object.entries(map)) if (raw.includes(needle)) return label;
  return raw;
}
