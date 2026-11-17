'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** ค่าพิเศษของตัวกรอง: งานเก่าที่ไม่ได้เก็บชื่อคนสั่ง */
export const UNKNOWN_REQUESTER = '__unknown__';

/**
 * ค้นหาใบงาน (?q= เลขใบขอ/ตำแหน่ง) และเลือก "ใครสั่ง" (?by=) — หน้าเซิร์ฟเวอร์กรองรายการให้
 * พิมพ์แล้วรอ 300 มิลลิวินาทีค่อยเปลี่ยนลิงก์ ไม่โหลดหน้าใหม่ทุกตัวอักษร
 */
export function ScrapRequesterFilter({
  value,
  query,
  options,
  unknownCount,
}: {
  value: string;
  query: string;
  options: { name: string; count: number }[];
  unknownCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (next: { q: string; by: string }) => {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set('q', next.q.trim());
    if (next.by) params.set('by', next.by);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Field className="w-full sm:w-80">
        <FieldLabel htmlFor="scrap-search">ค้นหาใบงาน</FieldLabel>
        <Input
          id="scrap-search"
          type="search"
          value={text}
          placeholder="เลขใบขอ หรือ ตำแหน่ง"
          autoComplete="off"
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: next, by: value }), 300);
          }}
        />
      </Field>
      <Field className="w-full sm:w-72">
        <FieldLabel htmlFor="scrap-requester">ใครสั่ง</FieldLabel>
        <NativeSelect
          id="scrap-requester"
          value={value}
          className="w-full"
          onChange={(e) => go({ q: text, by: e.target.value })}
        >
          <NativeSelectOption value="">ทุกคน</NativeSelectOption>
          {options.map((o) => (
            <NativeSelectOption key={o.name} value={o.name}>{`${o.name} (${o.count})`}</NativeSelectOption>
          ))}
          {unknownCount > 0 && (
            <NativeSelectOption value={UNKNOWN_REQUESTER}>{`ไม่รู้ชื่อคนสั่ง (${unknownCount})`}</NativeSelectOption>
          )}
        </NativeSelect>
      </Field>
    </div>
  );
}
