'use client';

import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { setGroupJobTypesAction } from '@/lib/actions';
import { GROUP_JOB_TYPES } from '@/lib/group-job-types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** ติ๊กประเภทงานในฟอร์ม (ใช้ทั้งฟอร์มเพิ่มกลุ่มและแก้รายแถว) — ส่งเป็น checkbox ชื่อ jobTypes */
export function GroupJobTypeChecks({ idPrefix, defaultSelected = [] }: { idPrefix: string; defaultSelected?: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {GROUP_JOB_TYPES.map((t) => {
        const id = `${idPrefix}-jt-${t}`;
        return (
          <Field key={t} orientation="horizontal">
            <Checkbox id={id} name="jobTypes" value={t} defaultChecked={defaultSelected.includes(t)} />
            <FieldLabel htmlFor={id} className="font-normal">{t}</FieldLabel>
          </Field>
        );
      })}
    </div>
  );
}

/**
 * ช่องเลือกประเภทงานแบบ dropdown สำหรับฟอร์มเพิ่มกลุ่ม — หน้าตาเหมือนช่องเลือกอื่นในแถวเดียวกัน
 * กดแล้วติ๊กได้หลายอย่าง ค่าที่เลือกส่งเป็น hidden input ชื่อ jobTypes
 */
export function GroupJobTypesDropdown({ id }: { id: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (t: string, on: boolean) =>
    setSelected((prev) => (on ? GROUP_JOB_TYPES.filter((x) => x === t || prev.includes(x)) : prev.filter((x) => x !== t)));
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" className="w-full justify-between font-normal">
            <span className="truncate">{selected.length ? selected.join(', ') : 'เลือกประเภทงาน'}</span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="start">
          <div className="flex flex-col gap-2">
            {GROUP_JOB_TYPES.map((t) => {
              const cid = `${id}-${t}`;
              return (
                <Field key={t} orientation="horizontal">
                  <Checkbox id={cid} checked={selected.includes(t)} onCheckedChange={(v) => toggle(t, v === true)} />
                  <FieldLabel htmlFor={cid} className="font-normal">{t}</FieldLabel>
                </Field>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selected.map((t) => <input key={t} type="hidden" name="jobTypes" value={t} />)}
    </>
  );
}

/** ปุ่มบนแถวกลุ่ม: แสดงประเภทงานที่ตั้งไว้ กดแล้วติ๊กแก้ แล้วบันทึก */
export function GroupJobTypesEditor({ groupId, groupName, value }: { groupId: string; groupName: string; value: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-48 justify-between" aria-label={`ประเภทงานของกลุ่ม ${groupName}`}>
          <span className="truncate">{value.length ? value.join(', ') : 'เลือกประเภทงาน'}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form action={setGroupJobTypesAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={groupId} />
          <p className="text-sm font-medium">กลุ่มนี้รับงานประเภทไหน</p>
          <GroupJobTypeChecks idPrefix={`row-${groupId}`} defaultSelected={value} />
          <Button size="sm" className="self-end">บันทึก</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
