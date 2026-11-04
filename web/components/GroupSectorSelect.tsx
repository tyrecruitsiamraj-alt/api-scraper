'use client';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { GROUP_SECTORS } from '@/lib/group-sectors';

/** ช่องเลือกประเภทกลุ่ม ราชการ/เอกชน — submitOnChange = เลือกแล้วบันทึกทันที */
export function GroupSectorSelect({
  name,
  defaultValue,
  ariaLabel,
  submitOnChange = false,
  id,
}: {
  name: string;
  defaultValue: string;
  ariaLabel?: string;
  submitOnChange?: boolean;
  id?: string;
}) {
  return (
    <NativeSelect
      size="sm"
      id={id}
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      onChange={submitOnChange ? (e) => e.currentTarget.form?.requestSubmit() : undefined}
      className="w-full"
    >
      {GROUP_SECTORS.map((s) => (
        <NativeSelectOption key={s.code} value={s.code}>
          {s.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
