'use client';

import { useState } from 'react';
import Link from 'next/link';
import { repostJarvisOrderAction } from '@/lib/actions';
import type { JarvisRepostGroup } from '@/lib/repo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';

function thaiTime(value: string): string {
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * เลือกกลุ่มสำหรับโพสต์ซ้ำ — ปุ่ม "เลือกกลุ่มที่ยังไม่สำเร็จ" ติ๊กกลุ่มที่รอบนี้ไม่สำเร็จ/ยังไม่ได้โพสต์
 * (เฉพาะกลุ่มที่โพสต์ได้: มีบัญชีผูกและไม่ติดเว้น 2 วัน)
 */
export function RepostGroupPicker({
  requestNo,
  groups,
  busy,
  gapDays,
  unfinishedFbIds = [],
}: {
  requestNo: string;
  groups: JarvisRepostGroup[];
  busy: boolean;
  gapDays: number;
  unfinishedFbIds?: string[];
}) {
  const canPick = (g: JarvisRepostGroup) => !busy && Boolean(g.account_label) && !g.blocked_until;
  const unfinished = groups.filter((g) => canPick(g) && unfinishedFbIds.includes(g.fb_group_id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={repostJarvisOrderAction} className="flex flex-col gap-4">
      <input type="hidden" name="requestNo" value={requestNo} />
      <FieldSet>
        <FieldLegend variant="label">เลือกกลุ่ม ({selected.size} กลุ่ม)</FieldLegend>
        <FieldDescription>
          กลุ่มเดิมต้องเว้น {gapDays} วัน เพิ่มกลุ่มได้ที่ <Link href="/settings/posting">ตั้งค่าการโพสต์</Link>
        </FieldDescription>
        <div className="flex flex-wrap gap-2">
          {unfinishedFbIds.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!unfinished.length}
              onClick={() => setSelected(new Set(unfinished.map((g) => g.id)))}
            >
              เลือกกลุ่มที่ยังไม่สำเร็จ ({unfinished.length})
            </Button>
          )}
          {selected.size > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              ล้างที่เลือก
            </Button>
          )}
        </div>
        {groups.map((g) => {
          const id = `repost-${requestNo}-${g.id}`;
          const disabled = !canPick(g);
          return (
            <Field key={g.id} orientation="horizontal" data-disabled={disabled || undefined}>
              <Checkbox
                id={id}
                name="groupId"
                value={g.id}
                disabled={disabled}
                checked={selected.has(g.id)}
                onCheckedChange={(v) => toggle(g.id, v === true)}
              />
              <FieldLabel htmlFor={id} className="font-normal">
                {g.name}
                <span className="text-muted-foreground">
                  {!g.account_label
                    ? ' · ยังไม่มีบัญชี Facebook ที่ผูกกลุ่มนี้'
                    : g.blocked_until
                      ? ` · โพสต์ซ้ำได้หลัง ${thaiTime(g.blocked_until)}`
                      : unfinishedFbIds.includes(g.fb_group_id)
                        ? ' · รอบนี้ยังไม่สำเร็จ'
                        : ` · โพสต์ด้วย ${g.account_label}`}
                </span>
              </FieldLabel>
            </Field>
          );
        })}
      </FieldSet>
      {busy && <p className="text-sm text-muted-foreground">มีรอบโพสต์ของใบนี้รอคิวอยู่ รอให้เสร็จก่อน</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Field orientation="horizontal" className="w-auto" data-disabled={busy || !selected.size || undefined}>
          <Checkbox
            id={`repost-confirm-${requestNo}`}
            name="confirm"
            value="yes"
            disabled={busy || !selected.size}
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
          />
          <FieldLabel htmlFor={`repost-confirm-${requestNo}`} className="font-normal">
            ยืนยันว่าจะโพสต์จริงลงกลุ่ม
          </FieldLabel>
        </Field>
        <Button size="sm" disabled={busy || !selected.size || !confirmed}>
          โพสต์ซ้ำ {selected.size > 0 ? `${selected.size} กลุ่ม` : ''}
        </Button>
      </div>
    </form>
  );
}
