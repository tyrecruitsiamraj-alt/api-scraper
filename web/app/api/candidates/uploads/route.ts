import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { addUploadFile, uploaderName } from '@/lib/resume-uploads';
import { plainResumeText } from '@/lib/resume-text';
import { MAX_FILE_BYTES, ResumeReadError, fileKind } from '../../../../../src/core/resume-files.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/** รับเรซูเม่ทีละไฟล์ · ไฟล์แรกไม่ส่ง batchId = เริ่มรอบใหม่ · ตอบ { batchId } หรือ { error } ที่บอกคนอัปโหลดได้ */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'ล็อกอินก่อน' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'ไม่มีไฟล์' }, { status: 400 });
  const batchId = String(form?.get('batchId') ?? '').trim();
  const taskId = String(form?.get('taskId') ?? '').trim();
  if ((batchId && !UUID.test(batchId)) || (taskId && !UUID.test(taskId))) {
    return NextResponse.json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 10 MB' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'ไฟล์ว่าง' }, { status: 400 });
  const kind = fileKind(file.name, file.type);
  if (!kind) return NextResponse.json({ error: 'รับเฉพาะไฟล์ PDF, Word (.docx) และรูป (JPG, PNG)' }, { status: 400 });
  if (kind === 'doc') return NextResponse.json({ error: 'ไฟล์ Word แบบเก่า (.doc) อ่านไม่ได้ เปิดแล้วบันทึกเป็น .docx หรือ PDF ก่อน' }, { status: 400 });

  const content = Buffer.from(await file.arrayBuffer());
  let text = '';
  try {
    text = await plainResumeText(kind, content);
  } catch (e) {
    if (e instanceof ResumeReadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  const email = session.user?.email ?? null;
  const id = await addUploadFile({
    batchId: batchId || null,
    file: { name: file.name, mime: file.type, content, text },
    uploadedBy: email,
    uploadedByName: await uploaderName(email, session.user?.name ?? null),
    taskId: taskId || null,
  });
  return NextResponse.json({ batchId: id });
}
