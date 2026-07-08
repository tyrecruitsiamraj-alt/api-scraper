/** hash จาก groupId → ค่าคงที่ต่อกลุ่ม (กลุ่มเดิมได้รูปแบบเดิม) */
function hashGroupSeed(groupId: string): number {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) {
    h = (Math.imul(31, h) + groupId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number, salt: number): T {
  return arr[(seed + salt) % arr.length];
}

function replaceFirst(text: string, pattern: RegExp, variants: string[], seed: number, salt: number): string {
  const m = text.match(pattern);
  if (!m || m.index === undefined) return text;
  const replacement = pick(variants, seed, salt);
  const idx = m.index;
  return text.slice(0, idx) + replacement + text.slice(idx + m[0].length);
}

export function isCaptionVariationEnabled(): boolean {
  const v = String(process.env.CAPTION_VARIATION_ENABLED ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

/**
 * ปรับแคปชั่นเล็กน้อยต่อกลุ่ม — เนื้อหาหลักเหมือนเดิม แต่ลด pattern ข้อความซ้ำทุกกลุ่ม
 */
export function varyCaptionForGroup(caption: string, groupId: string, _groupName?: string): string {
  if (!caption.trim() || !isCaptionVariationEnabled()) return caption;

  const seed = hashGroupSeed(String(groupId));
  let text = caption.replace(/\r\n/g, '\n').trimEnd();
  let salt = 0;

  text = replaceFirst(
    text,
    /หรือสมัครงานได้ที่\s*:?/i,
    ['หรือสมัครงานได้ที่:', 'หรือสมัครได้ที่ :', 'หรือสนใจสมัครที่ :', 'หรือสมัครงานได้ที่'],
    seed,
    salt++
  );
  text = replaceFirst(
    text,
    /สมัครงานได้ที่\s*:?/i,
    ['สมัครงานได้ที่:', 'สมัครได้ที่ :', 'สนใจสมัครที่ :', 'สมัครงานได้ที่'],
    seed,
    salt++
  );
  text = replaceFirst(text, /👉/, ['👉', '✨', '📌', '🔹'], seed, salt++);
  text = replaceFirst(
    text,
    /สนใจทักมา(?:ได้)?/i,
    ['สนใจทักมาได้', 'สนใจ inbox มาได้', 'สนใจติดต่อมาได้', 'สนใจสอบถามได้'],
    seed,
    salt++
  );

  const paras = text.split(/\n{2,}/).filter((p) => p.length > 0);
  if (paras.length > 1) {
    const gaps = ['\n\n', '\n\n\n', '\n\n', '\n\n\n'];
    const gap = pick(gaps, seed, salt++);
    text = paras.join(gap);
  }

  const closers = ['', '', 'ขอบคุณครับ 🙏', 'ยินดีตอบคำถามครับ', ''];
  const closer = pick(closers, seed, salt++);
  if (closer && !text.includes(closer)) {
    text += `\n\n${closer}`;
  }

  return text;
}
