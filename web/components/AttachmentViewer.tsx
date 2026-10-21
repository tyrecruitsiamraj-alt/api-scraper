'use client';

import { useState } from 'react';
import { ExternalLinkIcon, PaperclipIcon, ScanTextIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
    <Card size="sm">
      <CardHeader>
        <CardTitle>ข้อความที่อ่านได้ (OCR)</CardTitle>
        <CardAction>
          {status === 'success' ? (
            <Badge variant="secondary">{text.length.toLocaleString('th-TH')} ตัวอักษร</Badge>
          ) : status === 'pending' ? (
            <Badge variant="outline">รอ OCR</Badge>
          ) : (
            <Badge variant="outline">{status}</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {status === 'success' && text ? (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {text}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            {status === 'pending'
              ? 'ยังไม่ได้อ่านไฟล์นี้ Worker จะทำ OCR ให้อัตโนมัติเมื่อเริ่มทำงาน'
              : 'ไม่มีข้อความที่อ่านได้จากเอกสารนี้'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AttachmentViewer({ assets }: { assets: Asset[] }) {
  const attachments = assets.filter((a) => a.kind === 'attachment');
  const [active, setActive] = useState<Asset | null>(null);

  if (attachments.length === 0) return <p className="text-sm text-muted-foreground">ไม่มีเอกสารแนบ</p>;

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={2}
        className="flex-wrap"
        value={active?.id ?? ''}
        onValueChange={(id) => {
          const next = attachments.find((a) => a.id === id);
          if (next) setActive(next);
        }}
      >
        {attachments.map((a) => (
          <ToggleGroupItem key={a.id} value={a.id} title={a.title ?? ''}>
            <PaperclipIcon data-icon="inline-start" />
            {a.title || 'เอกสาร'} · {a.file_type?.toUpperCase()} {kb(a.byte_size) && `· ${kb(a.byte_size)}`}
            {a.extract_status === 'success' && <ScanTextIcon data-icon="inline-end" aria-label="อ่านข้อความแล้ว" />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {active && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">{active.title || 'เอกสาร'}</span>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/assets/${active.id}`} target="_blank" rel="noreferrer">
                <ExternalLinkIcon data-icon="inline-start" />
                เปิดแท็บใหม่ / ดาวน์โหลด
              </a>
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border bg-muted">
            {active.file_type === 'pdf' ? (
              <iframe src={`/api/assets/${active.id}`} className="h-[70vh] w-full" title={active.title ?? 'pdf'} />
            ) : /^(jpg|jpeg|png|gif|webp)$/i.test(active.file_type ?? '') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${active.id}`} alt={active.title ?? ''} className="mx-auto max-h-[70vh]" />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>แสดงตัวอย่างไฟล์ชนิดนี้ไม่ได้</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/assets/${active.id}`} target="_blank" rel="noreferrer">เปิดไฟล์</a>
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>
          <OcrPanel asset={active} />
        </div>
      )}
    </div>
  );
}
