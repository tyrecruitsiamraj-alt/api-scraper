'use client';

import { useEffect, useMemo, useState } from 'react';
import { listPickerGroupsAction } from '@/lib/actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { GROUP_SECTORS } from '@/lib/group-sectors';
import type { PostingGroup } from '@/lib/repo';

/** แสดงได้ทีละกี่กลุ่ม — คลังมี 2,400+ กลุ่ม ต้องกรองก่อน */
const MAX_VISIBLE = 120;

function provincesOf(g: PostingGroup): string[] {
  return String(g.province ?? '').split(/[,،]/).map((v) => v.trim()).filter(Boolean);
}

/**
 * เลือกกลุ่ม Facebook ที่บัญชีจะโพสต์ — อยู่ในฟอร์มเพิ่ม/แก้ไขบัญชี
 * โหลดรายชื่อกลุ่มตอนเปิดฟอร์ม (ไม่ฝังในหน้า — เดิมฝัง 2,437 กลุ่ม × ทุกบัญชี ทำหน้าบัญชีช้า 4 พ.ย. 2569)
 * กรองตามประเภท (เอกชน/ราชการ) จังหวัด และคำค้น · กลุ่มที่ติ๊กไว้แต่ถูกกรองออกยังถูกส่งไปกับฟอร์ม
 */
export function GroupPicker({
  groups: initialGroups,
  defaultSelected = [],
  idPrefix,
}: {
  groups?: PostingGroup[];
  defaultSelected?: string[];
  idPrefix: string;
}) {
  const [groups, setGroups] = useState<PostingGroup[] | null>(initialGroups && initialGroups.length ? initialGroups : null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [sector, setSector] = useState<string>('private');
  const [province, setProvince] = useState<string>('');
  const [query, setQuery] = useState<string>('');

  useEffect(() => {
    if (groups) return;
    let alive = true;
    listPickerGroupsAction().then((rows) => {
      if (alive) setGroups(rows);
    }).catch(() => {
      if (alive) setGroups([]);
    });
    return () => {
      alive = false;
    };
  }, [groups]);

  const inSector = useMemo(() => (groups ?? []).filter((g) => g.sector === sector), [groups, sector]);
  const provinceOptions = useMemo(
    () => [...new Set(inSector.flatMap(provincesOf))].sort((a, b) => a.localeCompare(b, 'th')),
    [inSector],
  );
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inSector.filter((g) =>
      (!province || (province === '__none__' ? provincesOf(g).length === 0 : provincesOf(g).includes(province)))
      && (!needle || `${g.name} ${g.fb_group_id}`.toLowerCase().includes(needle)));
  }, [inSector, province, query]);
  const visible = matching.slice(0, MAX_VISIBLE);
  const visibleIds = new Set(visible.map((g) => g.id));
  const hiddenSelected = [...selected].filter((id) => !visibleIds.has(id));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAllVisible = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const g of visible) {
        if (on) next.add(g.id);
        else next.delete(g.id);
      }
      return next;
    });

  if (groups === null) {
    return (
      <FieldSet>
        <FieldLegend>กลุ่มที่บัญชีนี้โพสต์</FieldLegend>
        <FieldDescription className="flex items-center gap-2"><Spinner /> กำลังโหลดรายชื่อกลุ่ม</FieldDescription>
        {[...selected].map((id) => <input key={id} type="hidden" name="groupIds" value={id} />)}
      </FieldSet>
    );
  }

  if (groups.length === 0) {
    return (
      <FieldDescription>
        ยังไม่มีกลุ่มในคลัง เพิ่มที่ ตั้งค่า → กลุ่มโพสต์ ก่อน บัญชีนี้ค่อยกลับมาเลือกทีหลังได้
      </FieldDescription>
    );
  }

  const allVisiblePicked = visible.length > 0 && visible.every((g) => selected.has(g.id));
  const someVisiblePicked = visible.some((g) => selected.has(g.id));

  return (
    <FieldSet>
      <FieldLegend>กลุ่มที่บัญชีนี้โพสต์</FieldLegend>
      <FieldDescription>เลือกไว้ {selected.size} จาก {groups.length} กลุ่ม</FieldDescription>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-sector`}>ประเภท</FieldLabel>
          <NativeSelect id={`${idPrefix}-sector`} size="sm" value={sector} onChange={(e) => { setSector(e.target.value); setProvince(''); }} className="w-full">
            {GROUP_SECTORS.map((s) => (
              <NativeSelectOption key={s.code} value={s.code}>
                {`${s.label} (${groups.filter((g) => g.sector === s.code).length})`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-province`}>จังหวัด</FieldLabel>
          <NativeSelect id={`${idPrefix}-province`} size="sm" value={province} onChange={(e) => setProvince(e.target.value)} className="w-full">
            <NativeSelectOption value="">ทุกจังหวัด</NativeSelectOption>
            <NativeSelectOption value="__none__">ยังไม่ระบุจังหวัด</NativeSelectOption>
            {provinceOptions.map((p) => <NativeSelectOption key={p} value={p}>{p}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-q`}>ค้นหาชื่อกลุ่ม</FieldLabel>
          <Input id={`${idPrefix}-q`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="เช่น ขับรถ" className="h-8" />
        </Field>
      </div>
      <Field orientation="horizontal">
        <Checkbox
          id={`${idPrefix}-all`}
          checked={allVisiblePicked ? true : someVisiblePicked ? 'indeterminate' : false}
          onCheckedChange={(v) => toggleAllVisible(v === true)}
          disabled={visible.length === 0}
        />
        <FieldLabel htmlFor={`${idPrefix}-all`} className="font-medium">
          เลือกทุกกลุ่มที่แสดง
          <span className="font-normal text-muted-foreground">
            {matching.length > MAX_VISIBLE ? `แสดง ${MAX_VISIBLE} จาก ${matching.length} กลุ่ม เลือกจังหวัดหรือพิมพ์ค้นหาให้แคบลง` : `${matching.length} กลุ่ม`}
          </span>
        </FieldLabel>
      </Field>
      <div className="grid max-h-80 gap-x-4 gap-y-2 overflow-y-auto pl-6 sm:grid-cols-2">
        {visible.map((g) => {
          const id = `${idPrefix}-grp-${g.id}`;
          return (
            <Field key={g.id} orientation="horizontal">
              <Checkbox
                id={id}
                name="groupIds"
                value={g.id}
                checked={selected.has(g.id)}
                onCheckedChange={(v) => toggle(g.id, v === true)}
              />
              <FieldLabel htmlFor={id} className="min-w-0 font-normal">
                <span className="truncate">{g.name}</span>
              </FieldLabel>
            </Field>
          );
        })}
        {visible.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีกลุ่มตามเงื่อนไขนี้</p>}
      </div>
      {hiddenSelected.map((id) => <input key={id} type="hidden" name="groupIds" value={id} />)}
    </FieldSet>
  );
}
