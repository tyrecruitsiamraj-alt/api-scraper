'use client';

import { useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckIcon, CircleCheckIcon, RotateCcwIcon, SaveIcon, SparklesIcon } from 'lucide-react';
import {
  regenerateContentImageAction,
  resetPosterStandardAction,
  saveAndApproveContentWorkspaceAction,
  saveContentWorkspaceAction,
} from '@/lib/actions';
import type { PosterFields } from '@/lib/repo';
import { emptyPosterLayout } from '../../src/core/poster-template.js';
import { operatorCanApprove } from '../../src/core/content-quality.js';
import { PosterDragCanvas } from '@/components/PosterDragCanvas';
import { PosterExtrasBar } from '@/components/PosterExtrasBar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  campaignId: string;
  content: {
    id: string;
    hasSourceImage: boolean;
    qualityStatus: 'pending' | 'pass' | 'warning' | 'fail';
    qualityScore?: number | null;
    qualitySummary?: string;
    qualityChecks?: Array<{ code: string; label: string; message: string; status: 'pass' | 'warning' | 'fail' | 'not_applicable' }>;
    isPreview: boolean;
  };
  initialPoster: PosterFields;
  initialCaption: string;
  saved?: boolean;
  standardSaved?: boolean;
  hasStandard?: boolean;
  standardReset?: boolean;
};

function ActionButtons({ canApprove }: { canApprove: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center justify-end gap-3">
      <Button formAction={saveContentWorkspaceAction} variant="outline" size="lg" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
        {pending ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
      </Button>
      <Button formAction={saveAndApproveContentWorkspaceAction} size="lg" disabled={pending || !canApprove}>
        {pending ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
        {pending ? 'กำลังตรวจ…' : 'อนุมัติสื่อ'}
      </Button>
    </div>
  );
}

export function ContentReviewWorkspace({ campaignId, content, initialPoster, initialCaption, saved = false, standardSaved = false, hasStandard = false, standardReset = false }: Props) {
  const [poster, setPoster] = useState(initialPoster);
  const [caption, setCaption] = useState(initialCaption);
  const update = <K extends keyof PosterFields>(key: K, value: PosterFields[K]) => setPoster((current) => ({ ...current, [key]: value }));
  const source = `/api/campaign-content/${content.id}/source-image`;
  const canApprove = operatorCanApprove({
    blocking: content.qualityStatus === 'fail',
    checks: content.qualityChecks ?? [],
  }, { isPreview: content.isPreview, hasSourceImage: content.hasSourceImage });
  const ids = { logo: useId(), imageSide: useId(), caption: useId(), standard: useId() };

  return (
    <Card className="grid gap-0 overflow-auto py-0 lg:min-h-[724px] lg:grid-cols-[565px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col border-b p-4 lg:border-r lg:border-b-0">
        <PosterDragCanvas
          fields={poster}
          sourceUrl={content.hasSourceImage ? source : null}
          enabled={content.hasSourceImage}
          className="overflow-hidden rounded-lg border bg-card"
          onLayoutChange={(layout) => update('layout', layout)}
          onExtrasChange={(extras) => update('extras', extras)}
        />
        {content.hasSourceImage && (
          <PosterExtrasBar extras={poster.extras ?? []} hasSourceImage={content.hasSourceImage} onChange={(extras) => update('extras', extras)} tone="pixel" />
        )}
        <div className="mt-auto flex items-center gap-3 pt-6">
          <Button type="button" variant="outline" size="lg" onClick={() => { setPoster(initialPoster); setCaption(initialCaption); }}>
            <RotateCcwIcon data-icon="inline-start" />
            คืนค่าเดิม
          </Button>
          <form action={regenerateContentImageAction} className="flex-1">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="contentId" value={content.id} />
            <Button variant="outline" size="lg" className="w-full" disabled={content.isPreview}>
              <SparklesIcon data-icon="inline-start" />
              สร้างภาพใหม่ด้วย AI
            </Button>
          </form>
        </div>
      </div>

      <form className="flex min-w-0 flex-col gap-6 p-6 lg:px-10 lg:py-8">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="contentId" value={content.id} />
        <input type="hidden" name="posterBadge" value={poster.badge} />
        <input type="hidden" name="posterSalaryBreakdown" value={poster.salaryBreakdown} />
        <input type="hidden" name="posterLayout" value={JSON.stringify(poster.layout ?? emptyPosterLayout())} />
        <input type="hidden" name="posterExtras" value={JSON.stringify(poster.extras ?? [])} />

        <FieldGroup className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          <PixelField label="ตำแหน่ง" name="posterTitle" value={poster.title} onChange={(value) => update('title', value)} />
          <PixelField label="สถานที่ทำงาน" name="posterLocation" value={poster.location} onChange={(value) => update('location', value)} />
          <PixelField label="รายได้" name="posterSalaryTotal" value={poster.salaryTotal ?? ''} suffix="บาท/เดือน" onChange={(value) => update('salaryTotal', value)} />
          <PixelField label="จำนวนรับ" name="posterQuantity" value={String(poster.quantity ?? '').replace(/\s*อัตรา\s*$/, '')} suffix="อัตรา" onChange={(value) => update('quantity', value.trim() ? `${value.trim()} อัตรา` : '')} />
          <PixelArea label="คุณสมบัติ" name="posterQualifications" value={(poster.qualifications ?? []).join('\n')} className="min-h-[168px]" onChange={(value) => update('qualifications', value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
          <div className="flex flex-col gap-5">
            <PixelArea label="เวลาทำงาน" name="posterWorktime" value={poster.worktime} className="min-h-10" onChange={(value) => update('worktime', value)} />
            <PixelArea label="สวัสดิการที่แสดงในสื่อ" name="posterBenefits" value={(poster.benefits ?? []).join('\n')} className="min-h-[62px]" onChange={(value) => update('benefits', value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
          </div>
          <PixelField label="เบอร์โทรที่ยืนยันแล้ว" name="posterContactLine" value={poster.contactLine} onChange={(value) => update('contactLine', value)} />
          <Field>
            <FieldLabel htmlFor={ids.logo}>โลโก้บนภาพ</FieldLabel>
            <NativeSelect id={ids.logo} name="posterLogoVariant" className="w-full" value={poster.logoVariant ?? 'people-navy'} onChange={(event) => update('logoVariant', event.target.value === 'so-red' ? 'so-red' : 'people-navy')}>
              <NativeSelectOption value="people-navy">SO PEOPLE สีน้ำเงิน</NativeSelectOption>
              <NativeSelectOption value="so-red">SO สีแดง</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.imageSide}>ตำแหน่งคนในภาพ</FieldLabel>
            <NativeSelect id={ids.imageSide} name="posterImageSide" className="w-full" value={poster.imageSide} onChange={(event) => update('imageSide', event.target.value === 'left' ? 'left' : 'right')}>
              <NativeSelectOption value="right">ขวา (ข้อความอยู่ซ้าย)</NativeSelectOption>
              <NativeSelectOption value="left">ซ้าย (ข้อความอยู่ขวา)</NativeSelectOption>
            </NativeSelect>
          </Field>
        </FieldGroup>

        <Field>
          <FieldLabel htmlFor={ids.caption}>Caption (ข้อความในโพสต์)</FieldLabel>
          <InputGroup>
            <InputGroupTextarea id={ids.caption} name="caption" value={caption} onChange={(event) => setCaption(event.target.value)} className="min-h-[190px] resize-y leading-relaxed" />
            <InputGroupAddon align="block-end" className="justify-end">
              <InputGroupText className={cn('text-xs', caption.length > 1000 && 'text-destructive')}>{caption.length.toLocaleString('th-TH')} / 1,000</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Field>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2 text-sm">
            <Field orientation="horizontal">
              <Checkbox id={ids.standard} name="saveAsStandard" value="1" />
              <FieldContent>
                <FieldLabel htmlFor={ids.standard}>ใช้เป็นแบบมาตรฐานต่อไป</FieldLabel>
                <FieldDescription>เก็บตำแหน่งเลเยอร์และกล่องข้อความ ไม่เอาภาพคนจากงานนี้ไปใช้กับงานอื่น</FieldDescription>
              </FieldContent>
            </Field>
            {saved && standardSaved && <StatusLine>บันทึกแล้ว งานโปสเตอร์ชุดนี้ต่อไปจะจัดวางแบบนี้</StatusLine>}
            {saved && !standardSaved && <StatusLine>บันทึกรูปและ Caption แล้ว (เฉพาะร่างนี้)</StatusLine>}
            {standardReset && <p role="status" className="text-muted-foreground">กลับไปใช้แบบต้นฉบับ SO แล้ว</p>}
            {hasStandard && !standardReset && (
              <Button type="submit" formAction={resetPosterStandardAction} formNoValidate variant="link" size="sm" className="w-fit px-0">
                กลับไปใช้แบบต้นฉบับ SO
              </Button>
            )}
            {content.qualitySummary && <p className={cn(content.qualityStatus === 'fail' ? 'text-destructive' : 'text-muted-foreground')}>{content.qualitySummary}</p>}
            {!canApprove && <p className="text-destructive">ยังอนุมัติไม่ได้ ตรวจข้อมูลหลักให้ครบก่อน</p>}
            {canApprove && content.qualityStatus === 'warning' && !content.qualitySummary && (
              <p className="text-muted-foreground">ข้อมูลหลักผ่านแล้ว ตอนอนุมัติระบบจะประกอบโปสเตอร์จากที่แก้ไว้ล่าสุด</p>
            )}
          </div>
          <ActionButtons canApprove={canApprove} />
        </div>
      </form>
    </Card>
  );
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-1.5 text-foreground">
      <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      {children}
    </p>
  );
}

function PixelField({ label, name, value, suffix, onChange }: { label: string; name: string; value: string; suffix?: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {suffix ? (
        <InputGroup>
          <InputGroupInput id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{suffix}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}

function PixelArea({ label, name, value, className = '', onChange }: { label: string; name: string; value: string; className?: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} className={cn('resize-y leading-relaxed', className)} />
    </Field>
  );
}
