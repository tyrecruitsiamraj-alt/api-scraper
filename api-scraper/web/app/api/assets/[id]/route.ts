import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAssetBytes } from '@/lib/repo';

// Stream a candidate asset (image/pdf) from Postgres bytea.
// Auth-gated: only signed-in users may fetch candidate files.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response('Bad id', { status: 400 });
  const asset = await getAssetBytes(params.id);
  if (!asset || !asset.content) return new Response('Not found', { status: 404 });

  const filename = `${(asset.title || 'file').replace(/[^\w.-]/g, '_')}.${asset.file_type || 'bin'}`;
  return new Response(asset.content as unknown as BodyInit, {
    headers: {
      'Content-Type': asset.mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
