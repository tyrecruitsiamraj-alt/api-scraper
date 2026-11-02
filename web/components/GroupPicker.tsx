'use client';

import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { businessUnitLabel } from '@/lib/business-units';
import type { PostingGroup } from '@/lib/repo';

/**
 * เลือกกลุ่ม Facebook ที่บัญชีจะโพสต์ — อยู่ในฟอร์มเพิ่ม/แก้ไขบัญชี
 * กลุ่มเรียงตามธุรกิจ (LBD/LBA/LM…) ติ๊กหัวข้อธุรกิจ = เลือกทุกกลุ่มของธุรกิจนั้น
 * ส่งค่าเป็น checkbox ชื่อ groupIds หลายตัวในฟอร์มที่ครอบอยู่
 */
export function GroupPicker({
  groups,
  defaultSelected = [],
  idPrefix,
}: {
  groups: PostingGroup[];
  defaultSelected?: string[];
  idPrefix: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));

  const sections = useMemo(() => {
    const map = new Map<string, PostingGroup[]>();
    for (const g of groups) {
      const key = g.department ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    // ธุรกิจที่ระบุแล้วขึ้นก่อน "ไม่ระบุธุรกิจ" ไว้ท้าย
    return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [groups]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleSection = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  if (groups.length === 0) {
    return (
      <FieldDescription>
        ยังไม่มีกลุ่มในคลัง เพิ่มที่ ตั้งค่า → กลุ่มโพสต์ ก่อน บัญชีนี้ค่อยกลับมาเลือกทีหลังได้
      </FieldDescription>
    );
  }

  return (
    <FieldSet>
      <FieldLegend>กลุ่มที่บัญชีนี้โพสต์</FieldLegend>
      <FieldDescription>เลือกไว้ {selected.size} จาก {groups.length} กลุ่ม · ติ๊กชื่อธุรกิจ = เลือกทุกกลุ่มของธุรกิจนั้น</FieldDescription>
      <div className="flex flex-col gap-4">
        {sections.map(([dept, list]) => {
          const ids = list.map((g) => g.id);
          const picked = ids.filter((id) => selected.has(id)).length;
          const all = picked === ids.length;
          const sectionId = `${idPrefix}-dept-${dept || 'none'}`;
          return (
            <div key={dept || 'none'} className="flex flex-col gap-2">
              <Field orientation="horizontal">
                <Checkbox
                  id={sectionId}
                  checked={all ? true : picked > 0 ? 'indeterminate' : false}
                  onCheckedChange={(v) => toggleSection(ids, v === true)}
                />
                <FieldLabel htmlFor={sectionId} className="font-medium">
                  {businessUnitLabel(dept) ?? 'ยังไม่ได้เลือกธุรกิจ'}
                  <span className="font-normal text-muted-foreground">
                    {picked}/{ids.length}
                  </span>
                </FieldLabel>
              </Field>
              <div className="grid gap-x-4 gap-y-2 pl-6 sm:grid-cols-2">
                {list.map((g) => {
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
              </div>
            </div>
          );
        })}
      </div>
    </FieldSet>
  );
}
