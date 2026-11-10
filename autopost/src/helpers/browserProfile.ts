/**
 * ค่าเบราว์เซอร์ประจำบัญชี — คงที่ต่อบัญชี (บัญชีเดิมได้จอขนาดเดิมทุกครั้ง) แต่ต่างกันระหว่างบัญชี
 * ขนาดจอเลือกจากขนาดโน้ตบุ๊ก/จอที่คนไทยใช้กันทั่วไป
 */
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 800 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1680, height: 1050 },
];

function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h;
}

export function browserProfileFor(accountId: string): { dirName: string; viewport: { width: number; height: number } } {
  const id = String(accountId || '').trim();
  const dirName = id.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() || 'default';
  // ลบความสูงแถบเบราว์เซอร์ออกเล็กน้อย ให้เหมือนหน้าต่างจริง ไม่ใช่ทั้งจอ
  const v = VIEWPORTS[hash(id) % VIEWPORTS.length];
  return { dirName, viewport: { width: v.width, height: v.height - 110 - (hash(`h|${id}`) % 30) } };
}

/** Chrome เปิดโปรไฟล์ที่อีกหน้าต่างใช้อยู่ไม่ได้ */
export function isProfileInUseError(e: unknown): boolean {
  return /ProcessSingleton|SingletonLock|profile.*(in use|already)|user data directory is already in use/i.test(
    String((e as Error)?.message || e)
  );
}
