'use client';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** ช่องเลือกตัวกรองที่ส่งฟอร์มทันทีเมื่อเปลี่ยนค่า (ฟอร์ม GET ของหน้ารายการ) */
export function AutoSubmitSelect({
  id,
  name,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <NativeSelect
      id={id}
      name={name}
      size="sm"
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="w-full"
    >
      {options.map((o) => (
        <NativeSelectOption key={o.value || 'all'} value={o.value}>{o.label}</NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
