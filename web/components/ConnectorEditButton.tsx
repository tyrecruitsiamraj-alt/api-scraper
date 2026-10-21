'use client';

import { useState } from 'react';
import { editConnectorAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * ปุ่ม "แก้ไข" + modal ฟอร์มแก้ข้อมูล connector (Scraper หรือ Facebook).
 * รหัสผ่านเว้นว่าง = คงรหัสเดิม (ไม่บังคับกรอกซ้ำ).
 */
export function ConnectorEditButton({
  id,
  platform,
  label,
  username,
}: {
  id: string;
  platform: string;
  label: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const isFb = platform === 'facebook';
  const fieldId = `edit-connector-${id}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">แก้ไข</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form action={editConnectorAction} onSubmit={() => setOpen(false)} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>แก้ไขบัญชี{isFb ? ' Facebook' : 'ค้นหาผู้สมัคร'}</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="platform" value={platform} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-label`}>ชื่อที่แสดง</FieldLabel>
              <Input id={`${fieldId}-label`} name="label" defaultValue={label} required />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-username`}>{isFb ? 'อีเมลหรือเบอร์ที่ใช้ล็อกอิน Facebook' : 'ชื่อผู้ใช้'}</FieldLabel>
              <Input id={`${fieldId}-username`} name="username" defaultValue={username} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-password`}>รหัสผ่าน</FieldLabel>
              <Input id={`${fieldId}-password`} name="password" type="password" />
              <FieldDescription>เว้นว่างไว้ถ้าจะใช้รหัสเดิม</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">ยกเลิก</Button>
            </DialogClose>
            <Button type="submit">บันทึก</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
