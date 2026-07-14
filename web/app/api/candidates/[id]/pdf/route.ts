import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getAssetBytes, getCandidate } from '@/lib/repo';
import { buildResumeHtml, htmlToPdf, resumeFileName } from '@/lib/resumePdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const c = await getCandidate(params.id);
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let profileDataUrl: string | null = null;
  const profile = (c.assets ?? []).find((a: any) => a.kind === 'profile' && a.download_status === 'success');
  if (profile?.id) {
    const asset = await getAssetBytes(profile.id);
    if (asset?.content) {
      const mime = asset.mime || 'image/jpeg';
      profileDataUrl = `data:${mime};base64,${Buffer.from(asset.content).toString('base64')}`;
    }
  }

  try {
    const html = buildResumeHtml(c, profileDataUrl);
    const pdf = await htmlToPdf(html);
    const filename = resumeFileName(c.full_name);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: any) {
    console.error('pdf generate failed:', e);
    return NextResponse.json({ error: e?.message || 'pdf_failed' }, { status: 500 });
  }
}
