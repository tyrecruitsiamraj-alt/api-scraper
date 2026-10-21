'use client';

import { useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckIcon, CircleCheckIcon, CircleXIcon, MinusIcon, RotateCcwIcon, SparklesIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { approveContentAction, editCaptionAction, editPosterAction, rejectContentAction, regenerateContentImageAction, resetPosterStandardAction, runFacebookPreflightAction } from '@/lib/actions';
import type { PosterFields } from '@/lib/repo';
import { emptyPosterExtras, emptyPosterLayout } from '../../src/core/poster-template.js';
import { operatorCanApprove } from '../../src/core/content-quality.js';
import { PosterDragCanvas } from '@/components/PosterDragCanvas';
import { PosterExtrasBar } from '@/components/PosterExtrasBar';
import { cn } from '@/lib/utils';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type QualityCheck = { code: string; label: string; message: string; status: 'pass' | 'warning' | 'fail' | 'not_applicable' };

type Props = {
  campaignId: string;
  content: {
    id: string;
    hasImage: boolean;
    hasSourceImage: boolean;
    imageGenerationOk: boolean;
    qualityStatus: 'pending' | 'pass' | 'warning' | 'fail';
    qualityScore: number | null;
    qualitySummary?: string;
    qualityChecks?: QualityCheck[];
    isPreview: boolean;
  };
  initialPoster: PosterFields;
  initialCaption: string;
  preflightAccounts: { id: string; label: string }[];
  posterSaved?: boolean;
  standardSaved?: boolean;
  hasStandard?: boolean;
  standardReset?: boolean;
};

const COPY = {
  title: 'ตำแหน่ง',
  badge: 'ป้ายด้านบน',
  location: 'สถานที่ทำงาน',
  worktime: 'วันและเวลาทำงาน',
  salaryTotal: 'รายได้หลัก',
  salaryBreakdown: 'รายละเอียดรายได้เพิ่มเติม',
  quantity: 'จำนวนที่รับ',
} as const;

function PosterPreview({ fields, content, onLayoutChange, onExtrasChange }: { fields: PosterFields; content: Props['content']; onLayoutChange: (layout: NonNullable<PosterFields['layout']>) => void; onExtrasChange: (extras: NonNullable<PosterFields['extras']>) => void }) {
  const source = `/api/campaign-content/${content.id}/source-image`;
  const finalImage = `/api/campaign-content/${content.id}/image`;
  if (!content.hasSourceImage) {
    return (
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        {content.hasImage ? <img src={finalImage} alt="โปสเตอร์ปัจจุบัน" className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-sm text-muted-foreground">ยังไม่มีรูป</div>}
        <div className="absolute inset-x-3 bottom-3 rounded-lg border bg-background/95 px-3 py-2 text-xs text-foreground">ร่างนี้ไม่มีภาพต้นฉบับ จึงแสดงรูปเดิม และยังแก้ข้อความบนรูปไม่ได้</div>
      </div>
    );
  }

  return (
    <PosterDragCanvas
      fields={fields}
      sourceUrl={source}
      enabled
      onLayoutChange={onLayoutChange}
      onExtrasChange={onExtrasChange}
    />
  );
}

function TextField({ name, label, value, onChange, multiline = false, className = '' }: { name: keyof typeof COPY; label: string; value: string; onChange: (value: string) => void; multiline?: boolean; className?: string }) {
  const id = useId();
  const fieldName = `poster${name[0].toUpperCase()}${name.slice(1)}`;
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline
        ? <Textarea id={id} name={fieldName} className="min-h-20 resize-y" value={value} onChange={(event) => onChange(event.target.value)} />
        : <Input id={id} name={fieldName} value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}

function PosterSaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" disabled={disabled || pending}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'กำลังประกอบรูป…' : 'บันทึกและประกอบรูปใหม่'}
    </Button>
  );
}

const CHECK_ICON = { fail: XIcon, warning: TriangleAlertIcon, not_applicable: MinusIcon, pass: CheckIcon } as const;

export function CampaignContentWorkspace({ campaignId, content, initialPoster, initialCaption, preflightAccounts, posterSaved = false, standardSaved = false, hasStandard = false, standardReset = false }: Props) {
  const [poster, setPoster] = useState<PosterFields>(initialPoster);
  const [caption, setCaption] = useState(initialCaption);
  const update = <K extends keyof PosterFields>(key: K, value: PosterFields[K]) => setPoster((current) => ({ ...current, [key]: value }));
  const canApprove = operatorCanApprove({
    blocking: content.qualityStatus === 'fail',
    checks: content.qualityChecks ?? [],
  }, { isPreview: content.isPreview, hasSourceImage: content.hasSourceImage && content.hasImage && content.imageGenerationOk });
  const ids = {
    qualifications: useId(),
    benefits: useId(),
    contact: useId(),
    imageSide: useId(),
    logo: useId(),
    standard: useId(),
    caption: useId(),
    fbAccount: useId(),
    reason: useId(),
  };
  const QualityIcon = content.qualityStatus === 'fail' ? CircleXIcon : content.qualityStatus === 'pass' ? CircleCheckIcon : TriangleAlertIcon;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>ขั้นที่ 3: แก้รูปและ Caption</CardTitle>
        <CardDescription className="leading-relaxed">
          ลากเลเยอร์ เพิ่มรูปหรือข้อความบนโปสเตอร์ได้ ถ้าติ๊ก “ใช้เป็นแบบมาตรฐานต่อไป” ตอนบันทึก งานชุดนี้ครั้งต่อไปจะจัดวางแบบเดียวกัน โดยไม่ย้ายรูปคนจากงานอื่นมา
        </CardDescription>
        <CardAction>
          <Badge variant="outline">ยังไม่โพสต์จริง</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid items-start gap-6 xl:grid-cols-[minmax(360px,45fr)_minmax(460px,55fr)]">
        <div className="flex flex-col gap-3 xl:sticky xl:top-5">
          <PosterPreview fields={poster} content={content} onLayoutChange={(layout) => update('layout', layout)} onExtrasChange={(extras) => update('extras', extras)} />
          {content.hasSourceImage && (
            <PosterExtrasBar extras={poster.extras ?? []} hasSourceImage={content.hasSourceImage} onChange={(extras) => update('extras', extras)} />
          )}
          {!content.hasSourceImage && (
            <p className="text-xs leading-relaxed text-muted-foreground">ภาพนี้ประกอบแบบเดียวกับไฟล์ PNG ที่ใช้จริง แก้ข้อความได้จากฟอร์ม หรือให้ AI เปลี่ยนเฉพาะคนและสถานที่</p>
          )}
          <div className="mt-1 grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" className="w-full" onClick={() => { setPoster(initialPoster); setCaption(initialCaption); }}>
              <RotateCcwIcon data-icon="inline-start" />
              คืนค่าเดิม
            </Button>
            <form action={regenerateContentImageAction}>
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="contentId" value={content.id} />
              <Button variant="secondary" className="w-full" disabled={content.isPreview}>
                <SparklesIcon data-icon="inline-start" />
                สร้างภาพใหม่ด้วย AI
              </Button>
            </form>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">AI จะเปลี่ยนเฉพาะคนและฉากตาม Brief เดิม Caption ข้อความบนภาพ และโลโก้ยังเหมือนเดิม และยังไม่โพสต์จริง</p>
        </div>

        <div className="flex flex-col gap-5">
          <form action={editPosterAction}>
            <input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="posterBadge" value={poster.badge} />
            <input type="hidden" name="posterLayout" value={JSON.stringify(poster.layout ?? emptyPosterLayout())} />
            <input type="hidden" name="posterExtras" value={JSON.stringify(poster.extras ?? emptyPosterExtras())} />
            <Card size="sm">
              <CardHeader>
                <CardTitle>ข้อความบนภาพ</CardTitle>
                <CardDescription>ทุกช่องต้องตรงกับใบขอ ระบบจะตรวจอีกครั้งตอนบันทึก</CardDescription>
                <CardAction>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPoster(initialPoster)}>คืนค่าเดิม</Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <TextField name="title" label={COPY.title} value={poster.title} onChange={(value) => update('title', value)} />
                  <TextField name="location" label={COPY.location} value={poster.location} onChange={(value) => update('location', value)} />
                  <TextField name="salaryTotal" label={COPY.salaryTotal} value={poster.salaryTotal} onChange={(value) => update('salaryTotal', value)} />
                  <TextField name="quantity" label={COPY.quantity} value={poster.quantity} onChange={(value) => update('quantity', value)} />
                  <Field>
                    <FieldLabel htmlFor={ids.qualifications}>เพศ อายุ และคุณสมบัติ</FieldLabel>
                    <Textarea id={ids.qualifications} name="posterQualifications" className="min-h-24 resize-y" value={poster.qualifications.join('\n')} onChange={(event) => update('qualifications', event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
                    <FieldDescription>บรรทัดละ 1 ข้อ</FieldDescription>
                  </Field>
                  <TextField name="worktime" label={COPY.worktime} value={poster.worktime} onChange={(value) => update('worktime', value)} multiline />
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={ids.benefits}>สวัสดิการที่แสดงในสื่อ</FieldLabel>
                    <Textarea id={ids.benefits} name="posterBenefits" className="min-h-20 resize-y" value={poster.benefits.join('\n')} onChange={(event) => update('benefits', event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
                    <FieldDescription>บรรทัดละ 1 ข้อ</FieldDescription>
                  </Field>
                  <TextField name="salaryBreakdown" label={COPY.salaryBreakdown} value={poster.salaryBreakdown} onChange={(value) => update('salaryBreakdown', value)} className="sm:col-span-2" />
                  <Field>
                    <FieldLabel htmlFor={ids.contact}>เบอร์โทรที่ยืนยันแล้ว</FieldLabel>
                    <Input id={ids.contact} name="posterContactLine" inputMode="tel" placeholder="เช่น 081-234-5678" value={poster.contactLine} onChange={(event) => update('contactLine', event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={ids.imageSide}>ตำแหน่งคนในภาพ</FieldLabel>
                    <NativeSelect id={ids.imageSide} name="posterImageSide" className="w-full" value={poster.imageSide} onChange={(event) => update('imageSide', event.target.value === 'left' ? 'left' : 'right')}>
                      <NativeSelectOption value="right">ขวา (ข้อความอยู่ซ้าย)</NativeSelectOption>
                      <NativeSelectOption value="left">ซ้าย (ข้อความอยู่ขวา)</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={ids.logo}>โลโก้บนภาพ</FieldLabel>
                    <NativeSelect id={ids.logo} name="posterLogoVariant" className="w-full" value={poster.logoVariant ?? 'people-navy'} onChange={(event) => update('logoVariant', event.target.value === 'so-red' ? 'so-red' : 'people-navy')}>
                      <NativeSelectOption value="people-navy">SO PEOPLE สีน้ำเงิน</NativeSelectOption>
                      <NativeSelectOption value="so-red">SO สีแดง</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                </FieldGroup>

                <Field orientation="horizontal">
                  <Checkbox id={ids.standard} name="saveAsStandard" value="1" />
                  <FieldContent>
                    <FieldLabel htmlFor={ids.standard}>ใช้เป็นแบบมาตรฐานต่อไป</FieldLabel>
                    <FieldDescription>เก็บตำแหน่งเลเยอร์และกล่องข้อความ ไม่เอาภาพคนหรือไฟล์ที่อัปโหลดจากงานนี้ไปใช้กับงานอื่น</FieldDescription>
                  </FieldContent>
                </Field>

                {posterSaved && standardSaved && (
                  <Alert role="status">
                    <CircleCheckIcon />
                    <AlertTitle>บันทึกแล้ว งานโปสเตอร์ชุดนี้ต่อไปจะจัดวางแบบนี้</AlertTitle>
                    <AlertDescription>ประกอบ PNG ของร่างนี้ใหม่แล้ว งานใหม่ที่ใช้เทมเพลตเดียวกันจะจัดวางตามนี้</AlertDescription>
                  </Alert>
                )}
                {posterSaved && !standardSaved && (
                  <Alert role="status">
                    <CircleCheckIcon />
                    <AlertTitle>บันทึกรูปใหม่แล้ว</AlertTitle>
                    <AlertDescription>มีผลเฉพาะร่างนี้ ยังไม่ได้เปลี่ยนแบบมาตรฐาน</AlertDescription>
                  </Alert>
                )}
                {standardReset && (
                  <Alert role="status">
                    <RotateCcwIcon />
                    <AlertTitle>กลับไปใช้แบบต้นฉบับ SO แล้ว</AlertTitle>
                    <AlertDescription>งานโปสเตอร์ชุดนี้ครั้งต่อไปจะจัดวางตามเทมเพลต SO PEOPLE เดิม</AlertDescription>
                  </Alert>
                )}
                {hasStandard && !standardReset && (
                  <Alert>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>ตอนนี้งานใหม่จะจัดวางตามแบบมาตรฐานที่บันทึกไว้</span>
                      <Button type="submit" formAction={resetPosterStandardAction} formNoValidate variant="outline" size="xs">กลับไปใช้แบบต้นฉบับ SO</Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                <PosterSaveButton disabled={!content.hasSourceImage} />
                {content.hasSourceImage && <Button type="button" variant="ghost" size="sm" onClick={() => update('layout', emptyPosterLayout())}>จัดวางตามต้นฉบับ</Button>}
                <span className="text-xs text-muted-foreground">{content.hasSourceImage ? 'มีภาพต้นฉบับพร้อมแก้' : 'ร่างนี้ไม่มีภาพต้นฉบับ ต้องให้ AI สร้างร่างใหม่ก่อน'}</span>
              </CardFooter>
            </Card>
          </form>

          <form action={editCaptionAction}>
            <input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} />
            <Card size="sm">
              <CardHeader>
                <CardTitle>ข้อความใต้โพสต์ (Caption)</CardTitle>
                <CardAction>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCaption(initialCaption)}>คืนค่า AI</Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Textarea id={ids.caption} aria-label="Caption" name="caption" className="min-h-56 resize-y whitespace-pre-wrap leading-relaxed" value={caption} onChange={(event) => setCaption(event.target.value)} />
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-2">
                <span className={cn('text-xs', caption.length > 1000 ? 'text-destructive' : 'text-muted-foreground')}>{caption.length.toLocaleString('th-TH')} / 1,000 ตัวอักษร</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">บันทึกแล้วยังไม่โพสต์</span>
                  <Button variant="secondary" size="sm">บันทึกร่าง Caption</Button>
                </div>
              </CardFooter>
            </Card>
          </form>
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4">
        <Alert variant={content.qualityStatus === 'fail' ? 'destructive' : 'default'}>
          <QualityIcon />
          <AlertTitle>{content.qualityStatus === 'fail' ? 'ยังอนุมัติไม่ได้' : content.qualityStatus === 'pass' ? 'ข้อมูลหลักผ่านการตรวจแล้ว' : 'ควรตรวจเพิ่มก่อนอนุมัติ'}</AlertTitle>
          {content.qualityScore != null && (
            <AlertAction>
              <Badge variant="outline">{content.qualityScore}/100</Badge>
            </AlertAction>
          )}
          {(content.qualitySummary || content.qualityChecks?.length) ? (
            <AlertDescription className="flex flex-col gap-1">
              {content.qualitySummary && <p>{content.qualitySummary}</p>}
              {content.qualityChecks?.length ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="link" size="xs" className="px-0">ดูผลตรวจทีละข้อ</Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="flex flex-col gap-1 text-xs">
                      {content.qualityChecks.map((check) => {
                        const Icon = CHECK_ICON[check.status];
                        return (
                          <li key={check.code} className={cn('flex items-start gap-1.5', check.status === 'fail' ? 'text-destructive' : check.status === 'warning' ? 'text-foreground' : 'text-muted-foreground')}>
                            <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                            <span>{check.label}: {check.message}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </AlertDescription>
          ) : null}
        </Alert>
        <div className="flex flex-wrap items-end gap-3">
          {preflightAccounts.length > 0 && (
            <form action={runFacebookPreflightAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="campaignId" value={campaignId} />
              <Field className="w-auto">
                <FieldLabel htmlFor={ids.fbAccount}>ทดสอบ Facebook (ไม่โพสต์จริง)</FieldLabel>
                <NativeSelect id={ids.fbAccount} name="fbAccountId" required defaultValue="" size="sm">
                  <NativeSelectOption value="" disabled>เลือกบัญชี</NativeSelectOption>
                  {preflightAccounts.map((account) => <NativeSelectOption key={account.id} value={account.id}>{account.label}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Button variant="secondary" size="sm">ตรวจ Session และกลุ่ม</Button>
            </form>
          )}
          <form action={approveContentAction}>
            <input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} /><input type="hidden" name="feedbackCode" value="ready" />
            <Button size="sm" disabled={!canApprove}>
              {canApprove && !content.isPreview && <CheckIcon data-icon="inline-start" />}
              {content.isPreview ? 'Preview ยังอนุมัติไม่ได้' : canApprove ? 'อนุมัติ แล้วไปหน้าสรุป' : 'ยังไม่ผ่านเกณฑ์อนุมัติ'}
            </Button>
          </form>
          <form action={rejectContentAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="contentId" value={content.id} /><input type="hidden" name="campaignId" value={campaignId} />
            <Field className="w-auto">
              <FieldLabel htmlFor={ids.reason}>เหตุผลที่ตีกลับ</FieldLabel>
              <NativeSelect id={ids.reason} name="reasonCode" defaultValue="incorrect_info" size="sm">
                <NativeSelectOption value="incorrect_info">ข้อมูลไม่ถูกต้อง</NativeSelectOption>
                <NativeSelectOption value="poor_visual">รูปไม่เหมาะกับงาน</NativeSelectOption>
                <NativeSelectOption value="missing_details">ข้อมูลสำคัญไม่ครบ</NativeSelectOption>
                <NativeSelectOption value="other">อื่น ๆ</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button variant="outline" size="sm">ตีกลับให้ AI แก้</Button>
          </form>
        </div>
      </CardFooter>
    </Card>
  );
}
