'use client';

import { useState } from 'react';
import { editConnectorAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { GroupPicker } from '@/components/GroupPicker';
import type { PostingGroup } from '@/lib/repo';

/**
 * ปุ่ม "แก้ไข" + modal ฟอร์มแก้ข้อมูล connector (Scraper หรือ Facebook).
 * รหัสผ่านเว้นว่าง = คงรหัสเดิม (ไม่บังคับกรอกซ้ำ).
 */
export function ConnectorEditButton({
  id,
  platform,
  label,
  username,
  skipWarmup = false,
  hasPassword = false,
  groups = [],
  groupIds = [],
}: {
  id: string;
  platform: string;
  label: string;
  username: string;
  /** Facebook: บัญชีที่ใช้งานมานานแล้ว ไม่ต้องวอร์ม */
  skipWarmup?: boolean;
  /** มีรหัสผ่านบันทึกไว้แล้ว */
  hasPassword?: boolean;
  /** Facebook: คลังกลุ่มทั้งหมด ให้เลือกว่าบัญชีนี้โพสต์กลุ่มไหน */
  groups?: PostingGroup[];
  /** Facebook: กลุ่มที่เลือกไว้ตอนนี้ */
  groupIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const isFb = platform === 'facebook';
  const fieldId = `edit-connector-${id}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">แก้ไข</Button>
      </DialogTrigger>
      <DialogContent className={isFb ? 'max-h-[90vh] overflow-y-auto sm:max-w-lg' : 'sm:max-w-sm'}>
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
              <Input
                id={`${fieldId}-password`}
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={hasPassword ? '••••••••' : undefined}
              />
              <FieldDescription>
                {hasPassword ? 'บันทึกรหัสผ่านไว้แล้ว ระบบไม่โชว์รหัสเดิม เว้นว่างไว้ถ้าจะใช้รหัสเดิม' : 'ยังไม่มีรหัสผ่าน'}
              </FieldDescription>
            </Field>
            {isFb && (
              <Field orientation="horizontal">
                <Checkbox id={`${fieldId}-skip-warmup`} name="skipWarmup" value="1" defaultChecked={skipWarmup} />
                <FieldContent>
                  <FieldLabel htmlFor={`${fieldId}-skip-warmup`}>บัญชีนี้ใช้งานมานานแล้ว</FieldLabel>
                  <FieldDescription>ติ๊กแล้วจะไม่จำกัดโพสต์ช่วงวอร์มบัญชีใหม่ (5–12 กลุ่มต่อวันใน 3 สัปดาห์แรก)</FieldDescription>
                </FieldContent>
              </Field>
            )}
            {isFb && (
              <>
                <FieldSeparator />
                <GroupPicker groups={groups} defaultSelected={groupIds} idPrefix={fieldId} />
              </>
            )}
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
