'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon } from 'lucide-react';
import { rejectRequestAction, startSoRecruitScrapeAction } from '@/lib/actions';
import { EDUCATION_LEVELS, GENDERS, PROVINCES, SALARY_LABELS, SALARY_STEPS } from '@/lib/filter-options';
import type { ScrapConnectorChoice, ScrapIntakeItem } from '@/lib/scrap-tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/*
 * การ์ดคำขอ Scrap จาก Jarvis ที่รอกดเริ่ม
 * ฟอร์มทั้งหมดคัดลอกจาก components/WorkCenter.tsx (ScrapeQuickRunForm, ScrapeIntakeForm,
 * RejectForm, ConnectorSelect) ชื่อช่อง ค่า hidden และ server action ต้องตรงกันทุกตัว.
 */

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  } catch {
    return value;
  }
}

function salarySelectOptions(extra?: string) {
  const value = String(extra ?? '').replace(/\D/g, '');
  if (value && !(SALARY_STEPS as readonly string[]).includes(value)) return [value, ...SALARY_STEPS];
  return [...SALARY_STEPS];
}

function salaryLabel(step: string) {
  return SALARY_LABELS[step] ?? Number(step).toLocaleString('en-US');
}

function scrapePlanSummary(f: Record<string, string>) {
  const bits = [
    f.position,
    f.location,
    f.qty ? `เป้า ${f.qty} คน` : '',
    f.gender && f.gender !== 'ไม่ระบุ' ? f.gender : '',
  ].filter(Boolean);
  return bits.join(' · ') || 'ตามใบขอ';
}

function ConnectorSelect({ id, connectors, defaultValue }: { id: string; connectors: ScrapConnectorChoice[]; defaultValue: string }) {
  return (
    <Field className="min-w-52 flex-1">
      <FieldLabel htmlFor={id}>บัญชีค้นหา</FieldLabel>
      <NativeSelect id={id} name="connectorId" required defaultValue={defaultValue} className="w-full">
        <NativeSelectOption value="" disabled>เลือก JobBKK หรือ JobThai</NativeSelectOption>
        {connectors.map((c) => (
          <NativeSelectOption key={c.id} value={c.id} disabled={!c.available}>
            {c.label}{c.available ? '' : ` (${c.blockReason})`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** ค่าเริ่มต้นของช่องบัญชีค้นหา: บัญชีที่เลือกใน Jarvis (ถ้าพร้อมใช้) ไม่งั้นบัญชีแรกที่พร้อม */
function pickDefaultConnector(item: ScrapIntakeItem, connectors: ScrapConnectorChoice[]): string {
  const requested = item.requestedConnectorIds.find((id) => connectors.some((c) => c.id === id && c.available));
  return requested ?? connectors.find((c) => c.available)?.id ?? '';
}

function ScrapeQuickRunForm({ item, connectors }: { item: ScrapIntakeItem; connectors: ScrapConnectorChoice[] }) {
  const f = item.requestFields ?? {};
  const defaultConnector = pickDefaultConnector(item, connectors);
  const canRun = Boolean(defaultConnector);
  return (
    <form action={startSoRecruitScrapeAction} className="flex flex-col gap-2" data-pause-refresh="1">
      <input type="hidden" name="requestNo" value={item.requestNo ?? ''} />
      <input type="hidden" name="scrapePosition" value={f.position ?? ''} />
      <input type="hidden" name="scrapeKeyword" value={f.keyword ?? ''} />
      <input type="hidden" name="scrapeIndustry" value={f.industry ?? ''} />
      <input type="hidden" name="scrapeProvince" value={f.location ?? ''} />
      <input type="hidden" name="scrapeTarget" value={f.qty ?? ''} />
      <input type="hidden" name="scrapeGender" value={f.gender || 'ไม่ระบุ'} />
      <input type="hidden" name="scrapeEducation" value={f.education || 'ไม่ระบุ'} />
      <input type="hidden" name="scrapeSalaryMin" value={f.salary_min ?? ''} />
      <input type="hidden" name="scrapeSalaryMax" value={f.salary_max ?? ''} />
      <input type="hidden" name="scrapeAgeMin" value={f.age_min ?? ''} />
      <input type="hidden" name="scrapeAgeMax" value={f.age_max ?? ''} />
      <div className="flex flex-wrap items-end gap-2">
        <ConnectorSelect id={`connector-quick-${item.id}`} connectors={connectors} defaultValue={defaultConnector} />
        <Button disabled={!canRun}>เริ่มค้นหา</Button>
      </div>
      {!canRun && (
        <Button variant="link" size="sm" asChild className="self-start px-0">
          <Link href="/settings/connectors">เพิ่มบัญชีค้นหาก่อน</Link>
        </Button>
      )}
    </form>
  );
}

function ScrapeIntakeForm({ item, connectors }: { item: ScrapIntakeItem; connectors: ScrapConnectorChoice[] }) {
  const f = item.requestFields ?? {};
  return (
    <form action={startSoRecruitScrapeAction} className="flex flex-col gap-4" data-pause-refresh="1">
      <input type="hidden" name="requestNo" value={item.requestNo ?? ''} />
      <input type="hidden" name="scrapeIndustry" value={f.industry ?? ''} />
      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label" className="px-1">แก้แผนก่อนเริ่ม</FieldLegend>
        <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`sp-pos-${item.id}`}>ตำแหน่ง</FieldLabel>
            <Input id={`sp-pos-${item.id}`} name="scrapePosition" defaultValue={f.position ?? ''} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-kw-${item.id}`}>Keyword</FieldLabel>
            <Input id={`sp-kw-${item.id}`} name="scrapeKeyword" defaultValue={f.keyword ?? ''} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-prov-${item.id}`}>จังหวัด</FieldLabel>
            <Input id={`sp-prov-${item.id}`} name="scrapeProvince" list={`province-options-${item.id}`} defaultValue={f.location ?? ''} />
            <datalist id={`province-options-${item.id}`}>
              {PROVINCES.map((province) => <option key={province} value={province} />)}
            </datalist>
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-target-${item.id}`}>เป้า (คน)</FieldLabel>
            <Input id={`sp-target-${item.id}`} name="scrapeTarget" type="number" min={1} defaultValue={f.qty || ''} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-gender-${item.id}`}>เพศ</FieldLabel>
            <NativeSelect id={`sp-gender-${item.id}`} name="scrapeGender" defaultValue={f.gender || 'ไม่ระบุ'} className="w-full">
              {GENDERS.map((gender) => <NativeSelectOption key={gender} value={gender}>{gender}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-edu-${item.id}`}>วุฒิ</FieldLabel>
            <NativeSelect id={`sp-edu-${item.id}`} name="scrapeEducation" defaultValue={f.education || 'ไม่ระบุ'} className="w-full">
              {EDUCATION_LEVELS.map((level) => <NativeSelectOption key={level} value={level}>{level}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`sp-sal-min-${item.id}`}>เงินเดือน</FieldLabel>
            <div className="flex items-center gap-2">
              <NativeSelect id={`sp-sal-min-${item.id}`} name="scrapeSalaryMin" defaultValue={f.salary_min ?? ''} className="w-full" aria-label="เงินเดือนต่ำสุด">
                <NativeSelectOption value="">ต่ำสุด</NativeSelectOption>
                {salarySelectOptions(f.salary_min).map((step) => (
                  <NativeSelectOption key={`min-${step}`} value={step}>{salaryLabel(step)}</NativeSelectOption>
                ))}
              </NativeSelect>
              <span className="text-muted-foreground">ถึง</span>
              <NativeSelect name="scrapeSalaryMax" defaultValue={f.salary_max ?? ''} className="w-full" aria-label="เงินเดือนสูงสุด">
                <NativeSelectOption value="">สูงสุด</NativeSelectOption>
                {salarySelectOptions(f.salary_max).map((step) => (
                  <NativeSelectOption key={`max-${step}`} value={step}>{salaryLabel(step)}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor={`sp-age-min-${item.id}`}>อายุ</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id={`sp-age-min-${item.id}`} name="scrapeAgeMin" type="number" min={15} max={80} defaultValue={f.age_min ?? ''} placeholder="ต่ำสุด" aria-label="อายุต่ำสุด" />
              <span className="text-muted-foreground">ถึง</span>
              <Input name="scrapeAgeMax" type="number" min={15} max={80} defaultValue={f.age_max ?? ''} placeholder="สูงสุด" aria-label="อายุสูงสุด" />
            </div>
          </Field>
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap items-end gap-2">
        <ConnectorSelect
          id={`connector-${item.id}`}
          connectors={connectors}
          defaultValue={pickDefaultConnector(item, connectors)}
        />
        <Button disabled={!connectors.some((c) => c.available)}>เริ่มค้นหา</Button>
      </div>
    </form>
  );
}

function RejectForm({ item }: { item: ScrapIntakeItem }) {
  if (!item.requestNo) return null;
  return (
    <form action={rejectRequestAction} className="mt-3 flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="requestNo" value={item.requestNo} />
      <input type="hidden" name="requestType" value="scraping" />
      {item.checklist && item.checklist.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">สิ่งที่ใบขอยังขาด</FieldLegend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {item.checklist.map((c) => {
              const id = `missing-${item.id}-${c.label}`;
              return (
                <Field key={c.label} orientation="horizontal" className="w-auto">
                  <Checkbox id={id} name="missing" value={c.label} defaultChecked={!c.ok} />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {c.label}{c.ok ? '' : ' (ขาด)'}
                  </FieldLabel>
                </Field>
              );
            })}
          </div>
        </FieldSet>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-52 flex-1">
          <FieldLabel htmlFor={`reject-reason-${item.id}`} className="sr-only">เหตุผลเพิ่มเติม</FieldLabel>
          <Input id={`reject-reason-${item.id}`} name="reason" placeholder="เหตุผลเพิ่มเติม (ไม่บังคับ)" />
        </Field>
        <Button variant="secondary">ตีกลับ</Button>
      </div>
    </form>
  );
}

export function ScrapIntakeActions({
  item,
  connectors,
  expanded,
  onTogglePlan,
}: {
  item: ScrapIntakeItem;
  connectors: ScrapConnectorChoice[];
  expanded: boolean;
  onTogglePlan: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-pause-refresh="1">
      {expanded ? (
        <ScrapeIntakeForm item={item} connectors={connectors} />
      ) : (
        <ScrapeQuickRunForm item={item} connectors={connectors} />
      )}
      <Collapsible data-pause-refresh="1">
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onTogglePlan}>
            {expanded ? 'ย่อแผน' : 'แก้แผนก่อนรัน'}
          </Button>
          {item.requestNo && (
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="group/trigger">
                ตีกลับใบขอ
                <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/trigger:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
        <CollapsibleContent>
          <RejectForm item={item} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** การ์ดคำขอหนึ่งใบ: ดูแผน เลือกบัญชี กดเริ่ม หรือตีกลับ */
export function ScrapIntakeCard({
  item,
  connectors,
  defaultExpanded = false,
}: {
  item: ScrapIntakeItem;
  connectors: ScrapConnectorChoice[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const missing = item.checklist.filter((c) => !c.ok);
  const meta = [item.requestNo, scrapePlanSummary(item.requestFields), fmtDate(item.createdAt)].filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-snug">{item.title}</CardTitle>
        <CardDescription className="leading-relaxed">
          {meta.join(' · ')}
          {item.requester ? ` · ส่งโดย ${item.requester}` : ''}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">รอกดเริ่ม</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {item.detail && <p className="text-sm leading-relaxed text-muted-foreground">{item.detail}</p>}
        {item.searchDescription && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 self-start">
                เนื้องานที่ใช้ค้น
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2">
              <p className="text-sm text-muted-foreground">
                ระบบวางแผนคำค้นจากเนื้องานนี้ ตำแหน่งในใบขอใช้เป็นแค่คำใบ้ (ตัดเบอร์โทรและลิงก์ออกแล้ว)
              </p>
              <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-sans text-sm whitespace-pre-wrap">
                {item.searchDescription}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
        {missing.length > 0 && (
          <p className="text-sm leading-relaxed text-destructive">
            ใบขอยังไม่มี: {missing.map((m) => m.label).join(', ')}
          </p>
        )}
        <ScrapIntakeActions
          item={item}
          connectors={connectors}
          expanded={expanded}
          onTogglePlan={() => setExpanded((v) => !v)}
        />
      </CardContent>
    </Card>
  );
}
