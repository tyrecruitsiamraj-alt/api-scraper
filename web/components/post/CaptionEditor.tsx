'use client';

import { useState } from 'react';
import { editJarvisCaptionAction } from '@/lib/actions';
import { postCaptionIssues, MAX_CAPTION_LENGTH } from '../../../src/core/post-caption-check.js';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

/** แก้แคปชั่นคำสั่งโพสต์ — ตรวจข้อความระหว่างพิมพ์ด้วยกติกาเดียวกับตอนโพสต์ */
export function CaptionEditor({ requestNo, caption }: { requestNo: string; caption: string }) {
  const [text, setText] = useState(caption);
  const issues = postCaptionIssues(text);
  const id = `caption-${requestNo}`;
  return (
    <form action={editJarvisCaptionAction} className="flex flex-col gap-3">
      <input type="hidden" name="requestNo" value={requestNo} />
      <Field data-invalid={issues.length > 0 || undefined}>
        <FieldLabel htmlFor={id}>ข้อความประกาศ</FieldLabel>
        <Textarea
          id={id}
          name="caption"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          aria-invalid={issues.length > 0 || undefined}
        />
        <FieldDescription>
          {issues.length ? (
            <span className="text-destructive">ยังโพสต์ไม่ได้: {issues.join(' · ')}</span>
          ) : (
            <span className="text-success">ข้อความผ่านแล้ว บันทึกแล้วกดโพสต์ได้</span>
          )}
          {` · ${text.length.toLocaleString('th-TH')}/${MAX_CAPTION_LENGTH.toLocaleString('th-TH')} ตัวอักษร · บันทึกแล้วจะแก้ในใบสั่งของ Jarvis ด้วย (เก็บข้อความเดิมไว้)`}
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!text.trim() || text === caption}>บันทึกข้อความ</Button>
        {text !== caption && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(caption)}>
            คืนข้อความเดิม
          </Button>
        )}
      </div>
    </form>
  );
}
