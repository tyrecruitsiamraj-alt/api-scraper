import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** Jarvis ส่ง key ใน header `x-api-key` (หรือ Authorization: Bearer) — ตรงกับ JARVIS_INTEGRATION_KEY บน Vercel */
export function jarvisKeyMatches(req: Request): boolean {
  const expected = process.env.JARVIS_INTEGRATION_KEY?.trim();
  if (!expected) return false;
  const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const given = (req.headers.get('x-api-key') || bearer || '').trim();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
