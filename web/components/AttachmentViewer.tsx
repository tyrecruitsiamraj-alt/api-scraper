'use client';

import { useState } from 'react';

type Asset = {
  id: string;
  kind: string;
  title: string | null;
  file_type: string | null;
  mime: string | null;
  byte_size: number | null;
  download_status: string;
  extract_status?: string | null;
  extracted_text?: string | null;
};

const kb = (n: number | null) => (n ? `${Math.round(n / 1024)} KB` : '');

function OcrPanel({ asset }: { asset: Asset }) {
  const status = asset.extract_status ?? 'pending';
  const text = asset.extracted_text ?? '';
  return (
    <div className="mt-3 rounded-xl border border-hairline bg-white">
      <div className="flex items-center justify-between border-b border-hairline/70 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span>✨</span> ข้อความที่ AI อ่านได้ (OCR)
        </span>
        {status === 'success' ? (
          <span className="pill bg-green-50 text-green-700">{text.length.toLocaleString()} ตัวอักษร</span>
        ) : status === 'pending' ? (
          <span className="pill bg-amber-50 text-amber-700">รอ OCR</span>
        ) : (
          <span className="pill bg-black/5 text-subtle">{status}</span>
        )}
      </div>
      {status === 'success' && text ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-relaxed text-ink">
          {text}
        </pre>
      ) : (
        <p className="px-4 py-3 text-sm text-subtle">
          {status === 'pending'
            ? 'ยังไม่ได้ประมวลผล — จะถูก OCR อัตโนมัติเมื่อ worker ทำงาน'
            : 'ไม่มีข้อความที่อ่านได้จากเอกสารนี้'}
        </p>
      )}
    </div>
  );
}

export function AttachmentViewer({ assets }: { assets: Asset[] }) {
  const attachments = assets.filter((a) => a.kind === 'attachment');
  const [active, setActive] = useState<Asset | null>(null);

  if (attachments.length === 0) return <p className="text-sm text-subtle">ไม่มีเอกสารแนบ</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <button
            key={a.id}
            onClick={() => setActive(a)}
            className={`pill ${active?.id === a.id ? 'bg-accent text-white' : 'bg-black/5 hover:bg-black/10'}`}
            title={a.title ?? ''}
          >
            📎 {a.title || 'เอกสาร'} · {a.file_type?.toUpperCase()} {kb(a.byte_size) && `· ${kb(a.byte_size)}`}
            {a.extract_status === 'success' && <span className="ml-1">✨</span>}
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{active.title || 'เอกสาร'}</span>
            <a href={`/api/assets/${active.id}`} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
              เปิดแท็บใหม่ / ดาวน์โหลด
            </a>
          </div>
          <div className="overflow-hidden rounded-xl border border-hairline bg-black/[0.02]">
            {active.file_type === 'pdf' ? (
              <iframe src={`/api/assets/${active.id}`} className="h-[70vh] w-full" title={active.title ?? 'pdf'} />
            ) : /^(jpg|jpeg|png|gif|webp)$/i.test(active.file_type ?? '') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${active.id}`} alt={active.title ?? ''} className="mx-auto max-h-[70vh]" />
            ) : (
              <div className="p-8 text-center text-sm text-subtle">
                ไม่รองรับการแสดงตัวอย่างไฟล์นี้ —{' '}
                <a className="text-accent hover:underline" href={`/api/assets/${active.id}`} target="_blank" rel="noreferrer">เปิดไฟล์</a>
              </div>
            )}
          </div>
          <OcrPanel asset={active} />
        </div>
      )}
    </div>
  );
}
