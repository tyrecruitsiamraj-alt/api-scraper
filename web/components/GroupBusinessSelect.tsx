'use client';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { BUSINESS_UNITS } from '@/lib/business-units';

/**
 * ช่องเลือกธุรกิจ (LBD/LBA/LM) — ใช้ทั้งบัญชีและกลุ่ม
 * submitOnChange: เลือกแล้วบันทึกทันที (ส่งฟอร์มที่ครอบอยู่) ไม่ต้องมีปุ่มบันทึกต่อแถว
 * required: ฟอร์มเพิ่มใหม่ต้องเลือก จะได้ไม่มีของหลุดไปก้อน "ยังไม่ได้เลือกธุรกิจ"
 */
export function GroupBusinessSelect({
  name,
  defaultValue,
  ariaLabel,
  submitOnChange = false,
  required = false,
  id,
}: {
  name: string;
  defaultValue: string | null;
  ariaLabel?: string;
  submitOnChange?: boolean;
  required?: boolean;
  id?: string;
}) {
  return (
    <NativeSelect
      size="sm"
      id={id}
      name={name}
      defaultValue={defaultValue ?? ''}
      aria-label={ariaLabel}
      required={required}
      onChange={submitOnChange ? (e) => e.currentTarget.form?.requestSubmit() : undefined}
      className="w-full"
    >
      <NativeSelectOption value="" disabled={required}>
        {required ? 'เลือกธุรกิจ' : 'ยังไม่ได้เลือก'}
      </NativeSelectOption>
      {BUSINESS_UNITS.map((u) => (
        <NativeSelectOption key={u.code} value={u.code}>
          {`${u.code} · ${u.detail}`}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
