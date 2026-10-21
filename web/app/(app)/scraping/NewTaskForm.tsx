'use client';

import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { createTaskAction } from '@/lib/actions';
import { EDUCATION_LEVELS, GENDERS, PROVINCES, SALARY_LABELS, SALARY_STEPS } from '@/lib/filter-options';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type ConnectorOption = { id: string; platform: string; label: string; scrape_limit: number; available: boolean; block_reason: string | null };

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

export function NewTaskForm({ connectors }: { connectors: ConnectorOption[] }) {
  const [scheduled, setScheduled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const readyConnectors = connectors.filter((connector) => connector.available);
  const noConnector = readyConnectors.length === 0;

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        try {
          await createTaskAction(fd);
          // reset the uncontrolled fields after a successful create
          (document.getElementById('new-task-form') as HTMLFormElement | null)?.reset();
          setScheduled(false);
        } finally {
          setSubmitting(false);
        }
      }}
      id="new-task-form"
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="mode" value="count" />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="nt-job-description">รายละเอียดเนื้องาน</FieldLabel>
          <Textarea
            id="nt-job-description"
            name="jobDescription"
            required
            rows={5}
            placeholder="วางหน้าที่ คุณสมบัติ พื้นที่ทำงาน และเงื่อนไขที่ต้องการ"
            className="min-h-32 leading-relaxed"
          />
          <FieldDescription>ไม่ต้องคิดคำค้นเอง ระบบจะเลือกคำค้นและตำแหน่งใกล้เคียงใน Job Family เดียวกันให้</FieldDescription>
        </Field>

        <Field className="md:max-w-72">
          <FieldLabel htmlFor="nt-target">จำนวน Resume ที่ต้องการ</FieldLabel>
          <Input id="nt-target" name="targetCount" type="number" min={1} max={1000} defaultValue={15} required />
          <FieldDescription>คนเดิมนับครั้งเดียว งานจะขึ้นว่าสำเร็จเมื่อครบเป้าเท่านั้น</FieldDescription>
        </Field>
      </FieldGroup>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="group/trigger -ml-2.5">
            ตัวเลือกเพิ่มเติม
            <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/trigger:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        {/* forceMount: ช่องในนี้ (เช่น connectorId) ต้องส่งไปกับฟอร์มแม้ตอนพับอยู่ */}
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <FieldGroup className="mt-4">
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nt-name">ชื่องาน (ไม่บังคับ)</FieldLabel>
                <Input id="nt-name" name="name" placeholder="เว้นว่างได้ ระบบตั้งชื่อจากรายละเอียดงานให้" />
              </Field>
              <Field>
                <FieldLabel htmlFor="nt-connector">แหล่งค้นหา</FieldLabel>
                <NativeSelect id="nt-connector" name="connectorId" required className="w-full" defaultValue={readyConnectors[0]?.id ?? ''}>
                  {noConnector && <NativeSelectOption value="">ยังไม่มีบัญชีที่พร้อมใช้</NativeSelectOption>}
                  {connectors.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id} disabled={!c.available}>
                      {PLATFORM_LABEL[c.platform] ?? c.platform} · {c.label}{c.available ? ` (รอบละ ${c.scrape_limit})` : ` (ยังใช้ไม่ได้: ${c.block_reason})`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {connectors.some((connector) => !connector.available) && (
                  <FieldDescription>บัญชีที่ยังใช้ไม่ได้จะเลือกไม่ได้ กันไม่ให้สั่งงานแล้วล้มซ้ำ</FieldDescription>
                )}
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nt-position">ตำแหน่ง (ไม่บังคับ)</FieldLabel>
                <Input id="nt-position" name="position" placeholder="เช่น Developer" />
              </Field>
              <Field>
                <FieldLabel htmlFor="nt-keyword">คำค้น (ไม่บังคับ)</FieldLabel>
                <Input id="nt-keyword" name="keyword" placeholder="เช่น React" />
              </Field>
            </div>

            {/* auto-expand to adjacent positions when short of target */}
            <Field orientation="horizontal">
              <Checkbox id="nt-expand" name="expandAdjacent" defaultChecked />
              <FieldContent>
                <FieldLabel htmlFor="nt-expand">ถ้าหาไม่ครบ ให้ขยายไปตำแหน่งใกล้เคียง</FieldLabel>
                <FieldDescription>
                  ถ้าได้ผู้สมัครน้อยกว่าเป้า ระบบจะให้ AI จัดกลุ่มงาน (Job Family) แล้วค้นตำแหน่งใกล้เคียงในกลุ่มเดียวกันจนครบ
                  ใช้ AI ของบริษัท ไม่มีค่าใช้จ่าย ไม่ต้องตั้งคีย์
                </FieldDescription>
              </FieldContent>
            </Field>

            <Separator />

            {/* filters (province ก่อน · gender · salary · education · age) */}
            <FieldSet>
              <FieldLegend variant="label">ตัวกรอง (ไม่บังคับ)</FieldLegend>
              <FieldDescription>
                ใช้ได้ทั้ง JobBKK และ JobThai ระบบเริ่มจาก Resume ที่เพิ่งอัปเดตและอยู่ลำดับต้นของแพลตฟอร์มก่อน
                ส่วนอายุจะตรวจซ้ำจาก Resume จริงก่อนนับเข้ายอด
              </FieldDescription>
              <div className="grid gap-5 md:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="nt-industry">ประเภทงาน / สาขาอาชีพ</FieldLabel>
                  <Input id="nt-industry" name="industry" placeholder="เช่น การขาย, IT Support" />
                </Field>

                <Field>
                  <FieldLabel htmlFor="nt-province">จังหวัด</FieldLabel>
                  <Input id="nt-province" name="province" list="province-options" placeholder="เช่น กรุงเทพมหานคร" />
                  <datalist id="province-options">
                    {PROVINCES.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </Field>

                <Field>
                  <FieldLabel htmlFor="nt-gender">เพศ</FieldLabel>
                  <NativeSelect id="nt-gender" name="gender" className="w-full" defaultValue="ไม่ระบุ">
                    {GENDERS.map((g) => (
                      <NativeSelectOption key={g} value={g}>{g}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel htmlFor="nt-education">วุฒิการศึกษา (ขั้นต่ำ)</FieldLabel>
                  <NativeSelect id="nt-education" name="education" className="w-full" defaultValue="ไม่ระบุ">
                    {EDUCATION_LEVELS.map((e) => (
                      <NativeSelectOption key={e} value={e}>{e}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel htmlFor="nt-salary-min">เงินเดือน (บาท/เดือน)</FieldLabel>
                  <div className="flex items-center gap-2">
                    <NativeSelect id="nt-salary-min" name="salaryMin" className="w-full" defaultValue="" aria-label="เงินเดือนต่ำสุด">
                      <NativeSelectOption value="">ต่ำสุด</NativeSelectOption>
                      {SALARY_STEPS.map((s) => (
                        <NativeSelectOption key={s} value={s}>{SALARY_LABELS[s]}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <span className="text-muted-foreground">ถึง</span>
                    <NativeSelect name="salaryMax" className="w-full" defaultValue="" aria-label="เงินเดือนสูงสุด">
                      <NativeSelectOption value="">สูงสุด</NativeSelectOption>
                      {SALARY_STEPS.map((s) => (
                        <NativeSelectOption key={s} value={s}>{SALARY_LABELS[s]}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="nt-age-min">อายุ (ปี)</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input id="nt-age-min" name="ageMin" type="number" min={15} max={70} placeholder="ต่ำสุด" aria-label="อายุต่ำสุด" />
                    <span className="text-muted-foreground">ถึง</span>
                    <Input name="ageMax" type="number" min={15} max={70} placeholder="สูงสุด" aria-label="อายุสูงสุด" />
                  </div>
                </Field>
              </div>
            </FieldSet>

            <Separator />

            {/* schedule */}
            <Field orientation="horizontal">
              <Checkbox
                id="nt-scheduled"
                checked={scheduled}
                onCheckedChange={(checked) => setScheduled(checked === true)}
              />
              <FieldLabel htmlFor="nt-scheduled">ตั้งเวลาทำงานซ้ำ</FieldLabel>
            </Field>
            {scheduled && (
              <Field className="md:max-w-72">
                <FieldLabel htmlFor="nt-schedule" className="sr-only">รอบการทำงานซ้ำ</FieldLabel>
                <NativeSelect id="nt-schedule" name="schedule" className="w-full" defaultValue="@hourly">
                  <NativeSelectOption value="every:1800">ทุก 30 นาที</NativeSelectOption>
                  <NativeSelectOption value="@hourly">ทุกชั่วโมง</NativeSelectOption>
                  <NativeSelectOption value="@daily">ทุกวัน</NativeSelectOption>
                </NativeSelect>
              </Field>
            )}
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="runNow" value="on" disabled={submitting || noConnector}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'กำลังบันทึก' : 'สร้างและเริ่มเลย'}
          </Button>
          <Button type="submit" variant="outline" disabled={submitting || noConnector}>
            บันทึกไว้ก่อน
          </Button>
        </div>
        {noConnector && <FieldError>ยังเริ่มค้นหาไม่ได้ ตรวจ Connector ที่ตั้งไว้ก่อน</FieldError>}
      </div>
    </form>
  );
}
