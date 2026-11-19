'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { PdfTemplateOption } from '@/components/PdfDownloadButton';
import { RESUME_FIELD_GROUPS } from '@/lib/resume-template';

export type PdfWorkItem = { position: string; company: string; period: string };

/** หน้า A4 ที่ 96dpi */
const PAGE_W = 794;
const PAGE_H = 1123;
const SCALE = 0.45;

/**
 * ดาวน์โหลด PDF เรซูเม่หนึ่งคน: ดูตัวอย่างก่อน รู้ว่ากี่หน้า
 * เกินหน้าเดียวเลือกได้ว่าจะปล่อยไหลลงหน้า 2 หรือเอางานบางรายการ/รายละเอียดหน้าที่ออก (เจ้าของ 16 พ.ย. 2569)
 * ตัวอย่างคือ HTML ชุดเดียวกับที่ใช้ทำ PDF (?format=html) จำนวนหน้าจึงตรงกับไฟล์
 */
export function PdfDownloadDialog({
  href,
  templates,
  works,
  initialTemplateId,
  label = 'ดาวน์โหลด PDF',
  size = 'default',
}: {
  href: string;
  templates: PdfTemplateOption[];
  works: PdfWorkItem[];
  /** แบบที่เลือกไว้แล้ว (เช่น เลือกตอนอัปโหลดเรซูเม่) · ไม่ส่ง = แบบเริ่มต้น */
  initialTemplateId?: string;
  label?: string;
  size?: 'default' | 'sm';
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(
    () => (templates.find((t) => t.id === initialTemplateId) ?? templates.find((t) => t.isDefault) ?? templates[0])?.id ?? '',
  );
  // ช่องที่โชว์ในไฟล์ ตั้งต้นตามแบบฟอร์ม · เปลี่ยนแบบฟอร์ม = กลับไปค่าของแบบนั้น (เจ้าของ 19 พ.ย. 2569)
  const fieldsOf = (id: string) => templates.find((t) => t.id === id)?.fields ?? null;
  const [shown, setShown] = useState<string[] | null>(() => fieldsOf(templateId));
  const [mode, setMode] = useState<'flow' | 'trim'>('flow');
  const [hidden, setHidden] = useState<number[]>([]);
  const [details, setDetails] = useState(true);
  const [pages, setPages] = useState<number | null>(null);
  const [frameH, setFrameH] = useState(PAGE_H);
  const frame = useRef<HTMLIFrameElement>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (templateId) q.set('template', templateId);
    if (shown) q.set('fields', shown.join(','));
    if (mode === 'trim') {
      if (hidden.length) q.set('hide_work', [...hidden].sort((a, b) => a - b).join(','));
      if (!details) q.set('details', '0');
    }
    return q.toString();
  }, [templateId, shown, mode, hidden, details]);
  const pdfUrl = `${href}${query ? `?${query}` : ''}`;
  const previewUrl = `${href}?${query ? `${query}&` : ''}format=html`;

  // นับหน้า: ความสูงเนื้อหาหักขอบกระดาษ หารด้วยพื้นที่พิมพ์ต่อหน้า (ขอบเท่ากับ @page ของแบบฟอร์มนั้น)
  const measure = useCallback(async () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    await doc.fonts?.ready;
    const style = doc.defaultView?.getComputedStyle(doc.body);
    const padTop = Number.parseFloat(style?.paddingTop ?? '0') || 0;
    const padBottom = Number.parseFloat(style?.paddingBottom ?? '0') || 0;
    const height = doc.documentElement.scrollHeight;
    const area = PAGE_H - padTop - padBottom;
    setPages(Math.max(1, Math.ceil((height - padTop - padBottom) / area - 0.01)));
    setFrameH(Math.max(PAGE_H, height));
  }, []);

  const toggleField = (key: string, on: boolean) => {
    setPages(null);
    setShown((prev) => {
      const list = prev ?? [];
      return on ? [...list.filter((k) => k !== key), key] : list.filter((k) => k !== key);
    });
  };

  const toggleWork = (i: number, keep: boolean) => {
    setPages(null);
    setHidden((prev) => (keep ? prev.filter((x) => x !== i) : [...prev, i]));
  };
  const trim = mode === 'trim';

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setPages(null); }}>
      <DialogTrigger asChild>
        <Button size={size}>
          <DownloadIcon data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>ดาวน์โหลด PDF</DialogTitle>
          <DialogDescription>{pages === null ? 'กำลังนับหน้า…' : `ไฟล์นี้ ${pages} หน้า`}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div className="mx-auto max-h-[60vh] overflow-y-auto rounded-md border bg-white" style={{ width: PAGE_W * SCALE }}>
            <div style={{ width: PAGE_W * SCALE, height: frameH * SCALE }}>
              {open && (
                <iframe
                  key={previewUrl}
                  ref={frame}
                  src={previewUrl}
                  title="ตัวอย่างเรซูเม่"
                  onLoad={measure}
                  scrolling="no"
                  style={{ width: PAGE_W, height: frameH, border: 0, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}
                />
              )}
            </div>
          </div>
          <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
            {templates.length > 1 && (
              <Field>
                <FieldLabel htmlFor="pdf-template">แบบฟอร์ม</FieldLabel>
                <NativeSelect id="pdf-template" value={templateId} onChange={(e) => { setPages(null); setTemplateId(e.target.value); setShown(fieldsOf(e.target.value)); }} className="w-full">
                  {templates.map((t) => (
                    <NativeSelectOption key={t.id} value={t.id}>{t.isDefault ? `${t.name} (เริ่มต้น)` : t.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {shown && (
              <FieldSet>
                <FieldLegend variant="label">แสดงในไฟล์</FieldLegend>
                {RESUME_FIELD_GROUPS.map((g) => (
                  <div key={g.label} className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">{g.label}</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {g.fields.map((f) => (
                        <Field key={f.key} orientation="horizontal">
                          <Checkbox id={`pdf-field-${f.key}`} checked={shown.includes(f.key)} onCheckedChange={(v) => toggleField(f.key, v === true)} />
                          <FieldLabel htmlFor={`pdf-field-${f.key}`} className="font-normal">{f.label}</FieldLabel>
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </FieldSet>
            )}
            <FieldSet>
              <FieldLegend variant="label">ถ้าเกินหน้าเดียว</FieldLegend>
              <RadioGroup value={mode} onValueChange={(v) => { setPages(null); setMode(v === 'trim' ? 'trim' : 'flow'); }}>
                <Field orientation="horizontal">
                  <RadioGroupItem id="pdf-flow" value="flow" />
                  <FieldLabel htmlFor="pdf-flow" className="font-normal">ใส่ครบทุกอย่าง ไหลลงหน้า 2</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="pdf-trim" value="trim" />
                  <FieldLabel htmlFor="pdf-trim" className="font-normal">เลือกเอาบางส่วนออก</FieldLabel>
                </Field>
              </RadioGroup>
            </FieldSet>
            <FieldSet disabled={!trim} className={trim ? '' : 'opacity-50'}>
              <FieldLegend variant="label">ประวัติงานที่ใส่ในไฟล์</FieldLegend>
              {works.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีประวัติงาน</p>}
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                {works.map((w, i) => (
                  <Field key={i} orientation="horizontal">
                    <Checkbox id={`pdf-work-${i}`} checked={!hidden.includes(i)} onCheckedChange={(v) => toggleWork(i, v === true)} disabled={!trim} />
                    <FieldLabel htmlFor={`pdf-work-${i}`} className="font-normal">
                      <span>
                        {w.position || 'ไม่ระบุตำแหน่ง'}
                        {w.company && <span className="text-muted-foreground"> · {w.company}</span>}
                        {w.period && <span className="text-muted-foreground"> · {w.period}</span>}
                      </span>
                    </FieldLabel>
                  </Field>
                ))}
              </div>
              <Field orientation="horizontal">
                <Checkbox id="pdf-details" checked={details} onCheckedChange={(v) => { setPages(null); setDetails(v === true); }} disabled={!trim} />
                <FieldLabel htmlFor="pdf-details" className="font-normal">ใส่รายละเอียดหน้าที่ในแต่ละงาน</FieldLabel>
              </Field>
            </FieldSet>
          </div>
        </div>
        <DialogFooter>
          <Button asChild>
            <a href={pdfUrl}>
              <DownloadIcon data-icon="inline-start" />
              ดาวน์โหลด
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
