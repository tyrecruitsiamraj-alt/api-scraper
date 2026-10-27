import { NextResponse } from 'next/server';
import { jarvisKeyMatches } from '@/lib/jarvis-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getJarvisOptions } from '@/lib/jarvis-options';

export const dynamic = 'force-dynamic';

/**
 * ตัวเลือกตอนสั่งงานจาก Jarvis: บัญชี Facebook (โควต้า/พัก/คิว), กลุ่ม (ชื่อ), เครื่อง (คิว), บัญชี Scrap
 * GET /api/integrations/jarvis/options
 */
export async function GET(req: Request) {
  if (!jarvisKeyMatches(req) && !(await getServerSession(authOptions))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getJarvisOptions(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'options_failed' }, { status: 500 });
  }
}
