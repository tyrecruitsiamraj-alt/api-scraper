import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getContentSourceImageBytes } from '@/lib/repo';

/** ภาพก่อนวางข้อความบนโปสเตอร์ ใช้เฉพาะพื้นที่แก้สื่อของผู้ใช้ที่ล็อกอินแล้ว. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response('Bad id', { status: 400 });
  const row = await getContentSourceImageBytes(params.id);
  if (!row?.source_image_bytes) return new Response('Not found', { status: 404 });
  return new Response(row.source_image_bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': row.source_image_mime || 'image/png',
      'Content-Disposition': `inline; filename="campaign-source-${params.id}.png"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
