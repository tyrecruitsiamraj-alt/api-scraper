'use client';

import Image from 'next/image';
import { ChangeEvent, useMemo, useState } from 'react';
import { ClockIcon, DownloadIcon, InfoIcon, MapPinIcon, UploadIcon, UserRoundIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

type SampleFields = {
  position: string;
  income: string;
  quantity: string;
  location: string;
  gender: string;
  age: string;
  schedule: string;
  cta: string;
};

const LOGOS = [
  { id: 'so', label: 'SO Recruitment', src: '/logo-SO.webp' },
] as const;

const INITIAL: SampleFields = {
  position: 'พนักงานขับรถ',
  income: '12,000 บาท',
  quantity: '1 อัตรา',
  location: 'ตัวอย่าง: โรงพยาบาลเอกชน\nเขตห้วยขวาง กรุงเทพฯ',
  gender: 'ชาย',
  age: '25–45 ปี',
  schedule: 'ทำงานตามตารางกะ วันละ 10 ชม.\n(รวมพักและ OT เหมา 1 ชม.)',
  cta: 'สนใจสมัคร ส่งข้อความหาเราได้เลย',
};

const FIELD_LABELS: { key: keyof SampleFields; label: string; multiline?: boolean }[] = [
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'income', label: 'รายได้' },
  { key: 'quantity', label: 'จำนวนรับ' },
  { key: 'location', label: 'สถานที่ทำงาน', multiline: true },
  { key: 'gender', label: 'เพศ' },
  { key: 'age', label: 'อายุ' },
  { key: 'schedule', label: 'เวลาทำงาน', multiline: true },
  { key: 'cta', label: 'ข้อความชวนสมัคร', multiline: true },
];

function Poster({ fields, logoSrc, logoLabel }: { fields: SampleFields; logoSrc: string; logoLabel: string }) {
  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#e9f3fb] ring-1 ring-foreground/10"
      style={{ containerType: 'inline-size' }}
      aria-label={`โปสเตอร์ตัวอย่างรับสมัคร${fields.position}`}
    >
      <Image
        src="/content-samples/driver-recruitment-background-v1.png"
        alt="พนักงานขับรถยืนข้างรถหน้าโรงพยาบาล"
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 52vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-linear-to-r from-white/45 via-white/5 to-transparent" />

      <div className="absolute left-[5.8cqw] top-[5.5cqw] w-[52cqw]">
        <div className="inline-flex rounded-full bg-primary px-[2.7cqw] py-[0.8cqw] text-[2.25cqw] font-semibold text-white">
          เปิดรับสมัครด่วน
        </div>
        <p className="mt-[2.4cqw] text-[2.2cqw] font-medium text-primary">ร่วมงานกับทีม SO PEOPLE</p>
        <h2 className="mt-[0.5cqw] whitespace-pre-line text-[6.6cqw] font-bold leading-[1.1] text-[#082b62]">
          {fields.position}
        </h2>

        <div className="mt-[2.8cqw] inline-flex items-baseline gap-[1.2cqw] rounded-[2.4cqw] bg-white/90 px-[2.5cqw] py-[1.3cqw] shadow-xs backdrop-blur-sm">
          <span className="text-[2.25cqw] font-medium text-[#36526f]">รายได้</span>
          <span className="text-[4.35cqw] font-bold leading-none text-primary">{fields.income}</span>
        </div>

        <div className="mt-[2.4cqw] flex flex-col gap-[1.3cqw] text-[2.15cqw] font-medium leading-[1.4] text-[#163652]">
          <p className="flex gap-[1.2cqw]"><MapPinIcon aria-hidden className="mt-[0.3cqw] size-[2.4cqw] shrink-0" /><span className="whitespace-pre-line">{fields.location}</span></p>
          <p className="flex gap-[1.2cqw]"><UserRoundIcon aria-hidden className="mt-[0.3cqw] size-[2.4cqw] shrink-0" /><span>{fields.gender} อายุ {fields.age} · รับ {fields.quantity}</span></p>
          <p className="flex gap-[1.2cqw]"><ClockIcon aria-hidden className="mt-[0.3cqw] size-[2.4cqw] shrink-0" /><span className="whitespace-pre-line">{fields.schedule}</span></p>
        </div>

        <div className="mt-[2.6cqw] inline-flex rounded-[1.6cqw] bg-[#082b62] px-[2.6cqw] py-[1.5cqw] text-[2.15cqw] font-semibold text-white">
          {fields.cta}
        </div>
      </div>

      <div className="absolute bottom-[4.8cqw] left-[5.8cqw] flex items-center gap-[1.8cqw]">
        <span className="relative h-[5.4cqw] w-[10.8cqw] overflow-hidden rounded-[0.8cqw] bg-white/90 px-[1cqw] shadow-xs">
          {/* ใช้ img เพื่อรองรับโลโก้ที่ผู้ใช้เลือกจากไฟล์บนเครื่องในหน้า Preview */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt={logoLabel} className="size-full object-contain p-[0.8cqw]" />
        </span>
        <span className="text-[1.65cqw] font-medium leading-tight text-[#2f4961]">ร่างแก้ไขได้ · DEMO-001<br />ยังไม่โพสต์จริง</span>
      </div>
    </div>
  );
}

export function ContentSampleEditor() {
  const [fields, setFields] = useState<SampleFields>(INITIAL);
  const [logoId, setLogoId] = useState<string>('so');
  const [customLogoSrc, setCustomLogoSrc] = useState<string | null>(null);
  const [customLogoName, setCustomLogoName] = useState<string>('');
  const [captionOverride, setCaptionOverride] = useState<string | null>(null);

  const generatedCaption = useMemo(() => [
    `🚗 เปิดรับสมัคร ${fields.position}`,
    '',
    `💰 รายได้ ${fields.income} | รับ ${fields.quantity}`,
    `📍 ${fields.location.replace(/\n/g, ' ')}`,
    `👤 ${fields.gender} อายุ ${fields.age}`,
    `🕐 ${fields.schedule.replace(/\n/g, ' ')}`,
    '',
    fields.cta,
    '#งานขับรถ #หางานกรุงเทพ #สมัครงาน #SOPEOPLE',
  ].join('\n'), [fields]);
  const caption = captionOverride ?? generatedCaption;
  const selectedLogo = LOGOS.find((logo) => logo.id === logoId) ?? LOGOS[0];
  const logoSrc = customLogoSrc ?? selectedLogo.src;
  const logoLabel = customLogoSrc ? customLogoName || 'โลโก้ที่เลือก' : selectedLogo.label;

  const update = (key: keyof SampleFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const chooseLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomLogoSrc(reader.result);
        setCustomLogoName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
      <div className="flex flex-col gap-4">
        <Poster fields={fields} logoSrc={logoSrc} logoLabel={logoLabel} />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href="/content-samples/driver-recruitment-poster-v1.svg" download>
              <DownloadIcon data-icon="inline-start" />
              ดาวน์โหลดไฟล์แก้ไข SVG
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href="/content-samples/driver-recruitment-poster-v1.json" download>
              <DownloadIcon data-icon="inline-start" />
              ดาวน์โหลดข้อมูลต้นทาง
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>ข้อความบนภาพ</CardTitle>
            <CardDescription>แก้แล้วภาพด้านซ้ายเปลี่ยนตามทันที ข้อมูลนี้ยังไม่บันทึกและไม่โพสต์จริง</CardDescription>
            <CardAction>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFields(INITIAL)}>
                คืนค่าเดิม
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {FIELD_LABELS.map((field) => {
                const id = `sample-${field.key}`;
                return (
                  <Field key={field.key} className={cn(field.multiline && 'sm:col-span-2 lg:col-span-1 xl:col-span-2')}>
                    <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                    {field.multiline ? (
                      <Textarea
                        id={id}
                        className="min-h-20 resize-y"
                        value={fields[field.key]}
                        onChange={(event) => update(field.key, event.target.value)}
                      />
                    ) : (
                      <Input id={id} value={fields[field.key]} onChange={(event) => update(field.key, event.target.value)} />
                    )}
                  </Field>
                );
              })}
            </FieldGroup>

            <Separator />

            <Field>
              <FieldLabel htmlFor="sample-logo">โลโก้บนภาพ</FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <NativeSelect
                  id="sample-logo"
                  className="w-full"
                  value={customLogoSrc ? 'custom' : logoId}
                  onChange={(event) => {
                    if (event.target.value !== 'custom') {
                      setLogoId(event.target.value);
                      setCustomLogoSrc(null);
                      setCustomLogoName('');
                    }
                  }}
                >
                  {LOGOS.map((logo) => <NativeSelectOption key={logo.id} value={logo.id}>{logo.label}</NativeSelectOption>)}
                  {customLogoSrc && <NativeSelectOption value="custom">{customLogoName || 'โลโก้ที่เลือกจากไฟล์'}</NativeSelectOption>}
                </NativeSelect>
                <Button asChild variant="secondary" className="cursor-pointer">
                  <label>
                    <UploadIcon data-icon="inline-start" />
                    เลือกไฟล์โลโก้
                    <input type="file" accept="image/png,image/webp,image/svg+xml" className="sr-only" onChange={chooseLogoFile} />
                  </label>
                </Button>
              </div>
              <FieldDescription>รองรับ SVG, PNG และ WebP เลือกแล้วโลโก้จะขึ้นบนภาพทันที ไฟล์นี้ใช้ดูตัวอย่างเท่านั้น ยังไม่อัปโหลดเข้าคลัง Material</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ข้อความใต้โพสต์ (Caption)</CardTitle>
            <CardDescription>เพิ่ม ลบ หรือปรับคำชวนสมัครได้เอง ข้อความบนภาพให้แก้จากฟอร์มด้านบน</CardDescription>
            <CardAction>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCaptionOverride(null)}>คืนค่า AI</Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Textarea
              aria-label="Caption ตัวอย่าง"
              className="min-h-64 resize-y whitespace-pre-wrap leading-relaxed"
              value={caption}
              onChange={(event) => setCaptionOverride(event.target.value)}
            />
          </CardContent>
        </Card>

        <Alert>
          <InfoIcon />
          <AlertTitle>ต้องยืนยันก่อนอนุมัติ</AlertTitle>
          <AlertDescription>
            ตัวอย่างนี้จำลองกรณีที่ใบขอเขียนตำแหน่งกว้าง ๆ ว่า “พนักงาน” แล้วระบบตีความเป็น “พนักงานขับรถ” จาก Job Family จึงทำร่างให้ดูก่อนได้ แต่จะไม่โพสต์จริงจนกว่าจะมีคนยืนยันชื่อตำแหน่ง
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
