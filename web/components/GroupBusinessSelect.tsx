'use client';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { BUSINESS_UNITS } from '@/lib/business-units';

/**
 * ช่องเลือกธุรกิจของกลุ่ม — เลือกแล้วบันทึกทันที (ส่งฟอร์มที่ครอบอยู่) ไม่ต้องมีปุ่มบันทึกต่อแถว
 * ใช้ในฟอร์มเพิ่มกลุ่มด้วย (ตอนนั้นไม่ส่งเอง เพราะยังไม่ได้กรอก ID กลุ่ม)
 */
export function GroupBusinessSelect({
  name,
  defaultValue,
  ariaLabel,
  submitOnChange = false,
  id,
}: {
  name: string;
  defaultValue: string | null;
  ariaLabel?: string;
  submitOnChange?: boolean;
  id?: string;
}) {
  return (
    <NativeSelect
      size="sm"
      id={id}
      name={name}
      defaultValue={defaultValue ?? ''}
      aria-label={ariaLabel}
      onChange={submitOnChange ? (e) => e.currentTarget.form?.requestSubmit() : undefined}
      className="w-full"
    >
      <NativeSelectOption value="">ไม่ระบุธุรกิจ</NativeSelectOption>
      {BUSINESS_UNITS.map((u) => (
        <NativeSelectOption key={u.code} value={u.code}>
          {u.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
