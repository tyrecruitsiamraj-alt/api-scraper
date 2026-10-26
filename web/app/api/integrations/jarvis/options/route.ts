import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getJarvisOptions } from '@/lib/jarvis-options';

export const dynamic = 'force-dynamic';

/** Jarvis ส่ง key ใน header `x-api-key` (หรือ Authorization: Bearer) — ตั้งค่า JARVIS_INTEGRATION_KEY บน Vercel */
function keyMatches(req: Request): boolean {
  const expected = process.env.JARVIS_INTEGRATION_KEY?.trim();
  if (!expected) return false;
  const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const given = (req.headers.get('x-api-key') || bearer || '').trim();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * ตัวเลือกตอนสั่งงานจาก Jarvis: บัญชี Facebook (โควต้า/พัก/คิว), กลุ่ม (ชื่อ), เครื่อง (คิว), บัญชี Scrap
 * GET /api/integrations/jarvis/options
 */
export async function GET(req: Request) {
  if (!keyMatches(req) && !(await getServerSession(authOptions))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getJarvisOptions(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'options_failed' }, { status: 500 });
  }
}
