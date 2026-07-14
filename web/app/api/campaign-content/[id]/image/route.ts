import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getContentImageBytes } from '@/lib/repo';

// สตรีมรูปที่ AI สร้าง (campaign_contents.image_bytes bytea) ให้หน้า approval แสดง.
// Auth-gated: เฉพาะผู้ล็อกอินเท่านั้น.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response('Bad id', { status: 400 });
  const row = await getContentImageBytes(params.id);
  if (!row || !row.image_bytes) return new Response('Not found', { status: 404 });

  return new Response(row.image_bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': row.image_mime || 'image/png',
      'Content-Disposition': `inline; filename="campaign-${params.id}.png"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
