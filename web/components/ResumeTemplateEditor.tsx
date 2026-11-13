'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { saveResumeTemplateAction } from '@/lib/actions';
import { SO_CIRCLE_DATA_URL } from '@/lib/resume-logo';
import {
  RESUME_FONTS,
  RESUME_LAYOUTS,
  RESUME_SECTIONS,
  SAMPLE_CANDIDATE,
  buildResumeHtml,
} from '@/lib/resume-template';
import type { ResumeSectionKey, ResumeTemplateSettings } from '@/lib/resume-template';

const LOGO_MAX_BYTES = 1024 * 1024;

/** ตั้งแบบฟอร์มเรซูเม่ ซ้ายตั้งค่า ขวาเห็นตัวอย่างทันที (ผู้สมัครตัวอย่าง ไม่ใช่คนจริง) */
export function ResumeTemplateEditor({ id, name: initialName, settings: initial }: { id: string | null; name: string; settings: ResumeTemplateSettings }) {
  const [name, setName] = useState(initialName);
  const [s, setS] = useState<ResumeTemplateSettings>(initial);
  const [logoError, setLogoError] = useState('');
  const [wmImageError, setWmImageError] = useState('');
  const set = <K extends keyof ResumeTemplateSettings>(key: K, value: ResumeTemplateSettings[K]) => setS((prev) => ({ ...prev, [key]: value }));
  const preview = useMemo(() => buildResumeHtml(SAMPLE_CANDIDATE, null, s), [s]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = frameRef.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => el.style.setProperty('--preview-scale', String(box.clientWidth / 794));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const pickImage = (file: File | undefined, key: 'logo' | 'watermarkImage', setError: (m: string) => void) => {
    setError('');
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setError('รูปใหญ่เกิน 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result ?? ''));
    reader.readAsDataURL(file);
  };
  const textWm = s.watermark === 'text' || s.watermark === 'both';
  const imageWm = s.watermark === 'logo' || s.watermark === 'both';

  const toggleSection = (key: ResumeSectionKey, on: boolean) =>
    set('sections', on ? [...s.sections, key] : s.sections.filter((k) => k !== key));
  const moveSection = (key: ResumeSectionKey, dir: -1 | 1) => {
    const list = [...s.sections];
    const i = list.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set('sections', list);
  };
  // หัวข้อที่เปิดอยู่ตามลำดับ แล้วตามด้วยหัวข้อที่ปิด (ที่เดิม ไม่กระโดด)
  const sectionRows = [
    ...s.sections.map((k) => RESUME_SECTIONS.find((x) => x.key === k)!).filter(Boolean),
    ...RESUME_SECTIONS.filter((x) => !s.sections.includes(x.key)),
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form action={saveResumeTemplateAction} className="flex flex-col gap-6">
        <input type="hidden" name="id" value={id ?? ''} />
        <input type="hidden" name="settings" value={JSON.stringify(s)} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="tpl-name">ชื่อแบบฟอร์ม</FieldLabel>
            <Input id="tpl-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="เช่น ส่งลูกค้า (ไม่มีเบอร์)" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="tpl-layout">หน้าตา</FieldLabel>
              <NativeSelect id="tpl-layout" value={s.layout} onChange={(e) => set('layout', e.target.value as ResumeTemplateSettings['layout'])} className="w-full">
                {RESUME_LAYOUTS.map((l) => (
                  <NativeSelectOption key={l.key} value={l.key}>{l.label}</NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>{RESUME_LAYOUTS.find((l) => l.key === s.layout)?.detail}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-font">ฟอนต์</FieldLabel>
              <NativeSelect id="tpl-font" value={s.font} onChange={(e) => set('font', e.target.value)} className="w-full">
                {RESUME_FONTS.map((f) => (
                  <NativeSelectOption key={f} value={f}>{f}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-text">สีตัวหนังสือ</FieldLabel>
              <Input id="tpl-text" type="color" value={s.textColor} onChange={(e) => set('textColor', e.target.value)} className="h-9 w-20 p-1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-accent">สีหัวข้อและเส้น</FieldLabel>
              <Input id="tpl-accent" type="color" value={s.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-9 w-20 p-1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-lang">ภาษาหัวข้อ</FieldLabel>
              <NativeSelect id="tpl-lang" value={s.headingLang} onChange={(e) => set('headingLang', e.target.value === 'en' ? 'en' : 'th')} className="w-full">
                <NativeSelectOption value="th">ไทย (แนะนำตัว ประสบการณ์ทำงาน)</NativeSelectOption>
                <NativeSelectOption value="en">English (Profile, Work Experience)</NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="tpl-logo">โลโก้</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              {s.logo && <img src={s.logo} alt="" className="h-10 max-w-32 rounded border object-contain" />}
              <Input id="tpl-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => pickImage(e.target.files?.[0], 'logo', setLogoError)} className="max-w-64" />
              {s.logo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set('logo', '')}>เอาโลโก้ออก</Button>
              )}
            </div>
            <FieldDescription>หัวกระดาษ (แบบมาตรฐาน กระชับ แถบข้าง) · PNG, JPG หรือ SVG ไม่เกิน 1 MB</FieldDescription>
            {logoError && <FieldError>{logoError}</FieldError>}
          </Field>

          <FieldSet>
            <FieldLegend variant="label">ลายน้ำ</FieldLegend>
            <Field>
              <FieldLabel htmlFor="tpl-wm" className="sr-only">ลายน้ำ</FieldLabel>
              <NativeSelect id="tpl-wm" value={s.watermark} onChange={(e) => set('watermark', e.target.value as ResumeTemplateSettings['watermark'])} className="w-full sm:w-64">
                <NativeSelectOption value="none">ไม่มีลายน้ำ</NativeSelectOption>
                <NativeSelectOption value="text">ข้อความ</NativeSelectOption>
                <NativeSelectOption value="logo">รูป</NativeSelectOption>
                <NativeSelectOption value="both">ข้อความ + รูป</NativeSelectOption>
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="tpl-wm-text">ข้อความลายน้ำ</FieldLabel>
                <Input id="tpl-wm-text" value={s.watermarkText} onChange={(e) => set('watermarkText', e.target.value)} disabled={!textWm} placeholder="เช่น SIAMRAJATHANEE" />
                <Field orientation="horizontal" className="w-auto">
                  <Checkbox id="tpl-wm-tile" checked={s.watermarkTile} onCheckedChange={(v) => set('watermarkTile', v === true)} disabled={!textWm} />
                  <FieldLabel htmlFor="tpl-wm-tile" className="font-normal">ซ้ำเต็มหน้า</FieldLabel>
                </Field>
              </Field>
              <Field>
                <FieldLabel htmlFor="tpl-wm-op">ความเข้มข้อความ {s.watermarkOpacity}%</FieldLabel>
                <Input id="tpl-wm-op" type="range" min={3} max={60} value={s.watermarkOpacity} onChange={(e) => set('watermarkOpacity', Number(e.target.value))} disabled={!textWm} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="tpl-wm-img">รูปลายน้ำกลางหน้า</FieldLabel>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-14 items-center justify-center rounded border bg-muted/40">
                  {s.watermarkImage ? <img src={s.watermarkImage} alt="" className="max-h-12 max-w-12 object-contain" /> : <span className="text-xs text-muted-foreground">ไม่มีรูป</span>}
                </div>
                <Input id="tpl-wm-img" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => pickImage(e.target.files?.[0], 'watermarkImage', setWmImageError)} disabled={!imageWm} className="max-w-64" />
                <Button type="button" variant="outline" size="sm" disabled={!imageWm} onClick={() => set('watermarkImage', SO_CIRCLE_DATA_URL)}>ใช้วงกลม SO</Button>
                <Button type="button" variant="outline" size="sm" disabled={!imageWm || !s.logo} onClick={() => set('watermarkImage', s.logo)}>ใช้รูปโลโก้</Button>
              </div>
              <FieldDescription>อัปโหลดรูปเอง หรือกดเลือกรูปที่มีให้ · PNG, JPG หรือ SVG ไม่เกิน 1 MB</FieldDescription>
              {wmImageError && <FieldError>{wmImageError}</FieldError>}
              {imageWm && !s.watermarkImage && <FieldError>ยังไม่ได้เลือกรูป ลายน้ำรูปจะไม่แสดง</FieldError>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="tpl-wm-size">ขนาดรูป {s.watermarkImageSize}% ของหน้า</FieldLabel>
                <Input id="tpl-wm-size" type="range" min={10} max={80} value={s.watermarkImageSize} onChange={(e) => set('watermarkImageSize', Number(e.target.value))} disabled={!imageWm} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tpl-wm-img-op">ความเข้มรูป {s.watermarkImageOpacity}%</FieldLabel>
                <Input id="tpl-wm-img-op" type="range" min={3} max={60} value={s.watermarkImageOpacity} onChange={(e) => set('watermarkImageOpacity', Number(e.target.value))} disabled={!imageWm} />
              </Field>
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">แสดงในเรซูเม่</FieldLegend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {([
                ['showPhoto', 'รูปผู้สมัคร'],
                ['showContacts', 'เบอร์โทร อีเมล LINE'],
                ['showSources', 'แหล่งที่มา'],
              ] as const).map(([key, label]) => (
                <Field key={key} orientation="horizontal" className="w-auto">
                  <Checkbox id={`tpl-${key}`} checked={s[key]} onCheckedChange={(v) => set(key, v === true)} />
                  <FieldLabel htmlFor={`tpl-${key}`} className="font-normal">{label}</FieldLabel>
                </Field>
              ))}
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">หัวข้อและลำดับ</FieldLegend>
            <div className="flex flex-col gap-1.5">
              {sectionRows.map((sec) => {
                const on = s.sections.includes(sec.key);
                const i = s.sections.indexOf(sec.key);
                return (
                  <div key={sec.key} className="flex items-center gap-2">
                    <Checkbox id={`tpl-sec-${sec.key}`} checked={on} onCheckedChange={(v) => toggleSection(sec.key, v === true)} />
                    <label htmlFor={`tpl-sec-${sec.key}`} className={`min-w-36 text-sm ${on ? '' : 'text-muted-foreground'}`}>{sec.label}</label>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`เลื่อน${sec.label}ขึ้น`} disabled={!on || i === 0} onClick={() => moveSection(sec.key, -1)}>
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`เลื่อน${sec.label}ลง`} disabled={!on || i === s.sections.length - 1} onClick={() => moveSection(sec.key, 1)}>
                      <ArrowDownIcon />
                    </Button>
                  </div>
                );
              })}
            </div>
            {s.layout === 'sidebar' && <FieldDescription>แบบแถบข้าง: ข้อมูลส่วนตัวกับทักษะอยู่ในแถบซ้ายเสมอ</FieldDescription>}
            {s.layout === 'profile' && <FieldDescription>แบบแถบขวา: ภาษา ความเชี่ยวชาญ จุดเด่น ข้อมูลส่วนตัว และงานที่ต้องการอยู่ในแถบเทาด้านขวาเสมอ</FieldDescription>}
          </FieldSet>

          <Field>
            <FieldLabel htmlFor="tpl-foot">ข้อความท้ายกระดาษ</FieldLabel>
            <Input id="tpl-foot" value={s.footerText} onChange={(e) => set('footerText', e.target.value)} placeholder="เว้นว่าง = ไม่มีท้ายกระดาษ" />
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          <Button type="submit">บันทึก</Button>
          <Button variant="outline" asChild>
            <Link href="/settings/resume-templates">ยกเลิก</Link>
          </Button>
        </div>
      </form>

      <Card className="h-fit xl:sticky xl:top-4">
        <CardHeader>
          <CardTitle>ตัวอย่าง</CardTitle>
        </CardHeader>
        <CardContent>
          {/* หน้า A4 กว้าง 794px ย่อให้พอดีช่อง */}
          <div className="relative w-full overflow-hidden rounded border bg-white" style={{ aspectRatio: '210 / 297' }}>
            <iframe
              title="ตัวอย่างเรซูเม่"
              srcDoc={preview}
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{ width: 794, height: 1123, transform: 'scale(var(--preview-scale))' }}
              ref={frameRef}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
