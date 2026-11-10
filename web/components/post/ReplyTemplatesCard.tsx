'use client';

import { useState } from 'react';
import { ChevronsUpDownIcon } from 'lucide-react';
import {
  DEFAULT_REPLY_TEMPLATES,
  REPLY_PLACEHOLDERS,
  renderReply,
  replyTemplateProblem,
} from '../../../autopost/server/comment-reply-templates.js';
import { saveReplyTemplateAction } from '@/lib/actions';
import type { ReplyTemplateView } from '@/lib/comment-leads';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

function thaiTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function TemplateForm({ template }: { template: ReplyTemplateView }) {
  const [body, setBody] = useState(template.body);
  const fallback = (DEFAULT_REPLY_TEMPLATES as Record<string, string>)[template.kind];
  const problem = replyTemplateProblem(body);
  const preview = problem ? null : renderReply(body, template.sample.values);
  const changed = body.trim() !== template.body.trim();

  return (
    <form action={saveReplyTemplateAction} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={template.kind} />
      <Field>
        <FieldLabel htmlFor={`reply-${template.kind}`}>ตอบ{template.label}</FieldLabel>
        <Textarea
          id={`reply-${template.kind}`}
          name="body"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <FieldDescription>
          {template.updated_at
            ? `แก้ล่าสุด ${thaiTime(template.updated_at)}${template.updated_by ? ` โดย ${template.updated_by}` : ''}`
            : 'ข้อความตั้งต้นของระบบ ยังไม่มีใครแก้'}
        </FieldDescription>
      </Field>

      <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="text-xs text-muted-foreground">
          ตัวอย่าง{template.sample.comment ? ` · ตอบคอมเมนต์ล่าสุด "${template.sample.comment}"` : ' · ยังไม่มีคอมเมนต์แบบนี้ ใช้ชื่อสมมุติ'}
        </span>
        {problem ? (
          <span className="text-destructive">{problem}</span>
        ) : preview ? (
          <span className="whitespace-pre-wrap">{preview}</span>
        ) : (
          <span className="text-muted-foreground">ไม่ตอบเอง ส่งให้คนตอบในหน้านี้</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={Boolean(problem) || !changed}>
          บันทึก
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={body.trim() === fallback.trim()} onClick={() => setBody(fallback)}>
          ใช้ข้อความตั้งต้น
        </Button>
      </div>
    </form>
  );
}

/** ข้อความที่บอทตอบใต้คอมเมนต์เอง — แก้ได้ เห็นตัวอย่างจากคอมเมนต์จริงทันทีที่พิมพ์ */
export function ReplyTemplatesCard({ templates }: { templates: ReplyTemplateView[] }) {
  return (
    <Collapsible asChild>
      <Card>
        <CardHeader>
          <CardTitle>ข้อความที่ระบบตอบเอง</CardTitle>
          <CardDescription>ใช้กับคอมเมนต์ใหม่ตั้งแต่รอบเก็บคอมเมนต์ถัดไป · เว้นว่าง = ไม่ตอบเอง ส่งให้คนตอบ</CardDescription>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                แก้ข้อความ
                <ChevronsUpDownIcon data-icon="inline-end" />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {templates.map((t) => (
                <TemplateForm key={t.kind} template={t} />
              ))}
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">คำแทนที่ใช้ได้</span>
              <ul className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
                {REPLY_PLACEHOLDERS.map((p) => (
                  <li key={p.key}>
                    <span className="font-mono text-foreground">{`{${p.key}}`}</span> {p.hint}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
