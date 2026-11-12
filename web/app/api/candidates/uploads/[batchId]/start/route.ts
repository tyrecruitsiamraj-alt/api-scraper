import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { startUploadBatch } from '@/lib/resume-uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ส่งไฟล์ครบแล้ว → ให้เครื่องอ่านไฟล์เริ่มอ่านทั้งรอบ */
export async function POST(_req: Request, props: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'ล็อกอินก่อน' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  await startUploadBatch(batchId, session.user?.email ?? null);
  return NextResponse.json({ url: `/candidates/upload/${batchId}` });
}
