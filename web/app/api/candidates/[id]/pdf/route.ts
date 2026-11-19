import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getAssetBytes, getCandidate } from '@/lib/repo';
import { buildResumeHtml, htmlToPdf, resumeFileName } from '@/lib/resumePdf';
import { getResumeTemplate } from '@/lib/resume-templates';
import { applyResumeFields, parseResumeFields, parseResumeTrim, trimResumeCandidate } from '@/lib/resume-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// First PDF may download Chromium pack (~63MB) into /tmp — needs longer timeout.
export const maxDuration = 60;

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    // ?template=<id> จากปุ่มเลือกแบบฟอร์ม · ไม่ระบุ = แบบเริ่มต้น
    // ?hide_work=0,3&details=0 = ตัดให้จบหน้าเดียว · ?format=html = หน้าตัวอย่างในหน้าต่างดาวน์โหลด (ใช้นับหน้า) HTML ชุดเดียวกับที่ทำ PDF
    const search = new URL(req.url).searchParams;
    const template = await getResumeTemplate(search.get('template'));
    // ?fields=a,b = โชว์เฉพาะช่องที่ติ๊กในหน้าต่างตัวอย่าง · ไม่ส่ง = ตามแบบฟอร์ม
    const fields = parseResumeFields(search);
    const trimmed = trimResumeCandidate(c, parseResumeTrim(search));
    const chosen = fields ? applyResumeFields(trimmed, template.settings, fields) : { candidate: trimmed, settings: template.settings };
    const html = buildResumeHtml(chosen.candidate, profileDataUrl, chosen.settings);
    if (search.get('format') === 'html') {
      return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
    }
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
