import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getAssetBytes, getCandidate } from '@/lib/repo';
import { batchCandidateIds } from '@/lib/resume-uploads';
import { buildResumeHtml, htmlToPdf, resumeFileName } from '@/lib/resumePdf';
import { makeZip } from '../../../../../../../src/core/zip.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** PDF เรซูเม่ (แบบเดียวกับปุ่มดาวน์โหลด PDF ของแต่ละคน) ของทุกคนที่บันทึกจากรอบอัปโหลดนี้ รวมเป็น zip */
export async function GET(_req: Request, props: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const ids = await batchCandidateIds(batchId);
  if (!ids.length) return NextResponse.json({ error: 'รอบนี้ยังไม่มีผู้สมัครที่บันทึกแล้ว' }, { status: 404 });
  const files: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const c = await getCandidate(id);
    if (!c) continue;
    const profile = (c.assets ?? []).find((a: any) => a.kind === 'profile' && a.download_status === 'success');
    let profileDataUrl: string | null = null;
    if (profile?.id) {
      const asset = await getAssetBytes(profile.id);
      if (asset?.content) profileDataUrl = `data:${asset.mime || 'image/jpeg'};base64,${Buffer.from(asset.content).toString('base64')}`;
    }
    const pdf = await htmlToPdf(buildResumeHtml(c, profileDataUrl));
    // ชื่อซ้ำกันในรอบเดียว ต่อท้ายเลขกันไฟล์ทับ
    let name = resumeFileName(c.full_name);
    for (let n = 2; used.has(name); n += 1) name = resumeFileName(`${c.full_name} (${n})`);
    used.add(name);
    files.push({ name, data: pdf });
  }
  const zip = makeZip(files);
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(`เรซูเม่ ${files.length} คน.zip`),
      'Cache-Control': 'private, no-store',
    },
  });
}
