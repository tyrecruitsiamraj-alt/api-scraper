import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getContentPosterPreview } from '@/lib/repo';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response('Bad id', { status: 400 });
  const svg = await getContentPosterPreview(params.id);
  if (!svg) return new Response('Not found', { status: 404 });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
