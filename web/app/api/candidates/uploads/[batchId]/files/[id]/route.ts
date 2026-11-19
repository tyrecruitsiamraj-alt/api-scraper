import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getUploadFile } from '@/lib/resume-uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** เปิดในเบราว์เซอร์ได้ (หน้าผลอัปโหลดโชว์เป็นตัวอย่าง) — ชนิดอื่นดาวน์โหลด */
const INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** ไฟล์เรซูเม่ต้นฉบับที่อัปโหลด (เจ้าของ 19 พ.ย. 2569: อัปแล้วไม่มีตัวอย่างให้ดู) */
export async function GET(_req: Request, props: { params: Promise<{ batchId: string; id: string }> }) {
  const { batchId, id } = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'ล็อกอินก่อน' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(batchId) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const file = await getUploadFile(batchId, id);
  if (!file?.content) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
  const mime = String(file.mime ?? '').toLowerCase();
  const inline = INLINE.has(mime);
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      'Content-Type': inline ? mime : 'application/octet-stream',
      'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file.file_name),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
