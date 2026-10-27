'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** ค่าพิเศษของตัวกรอง: งานเก่าที่ไม่ได้เก็บชื่อคนสั่ง */
export const UNKNOWN_REQUESTER = '__unknown__';

/** เลือก "ใครสั่ง" แล้วเปลี่ยน ?by= ในลิงก์ หน้าเซิร์ฟเวอร์กรองรายการให้ */
export function ScrapRequesterFilter({
  value,
  options,
  unknownCount,
}: {
  value: string;
  options: { name: string; count: number }[];
  unknownCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Field className="w-full sm:w-72">
      <FieldLabel htmlFor="scrap-requester">ใครสั่ง</FieldLabel>
      <NativeSelect
        id="scrap-requester"
        value={value}
        className="w-full"
        onChange={(e) => {
          const next = e.target.value;
          router.push(next ? `${pathname}?by=${encodeURIComponent(next)}` : pathname);
        }}
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
  );
}
