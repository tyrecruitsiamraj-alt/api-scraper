'use client';

import { useState } from 'react';
import { requestAiCallAction } from '@/lib/actions';
import type { CommentLead } from '@/lib/comment-leads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function thaiTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** คนที่ฝากเบอร์ไว้ในคอมเมนต์ — ติ๊กเลือกแล้วส่งให้ AI โทร */
export function LeadCallTable({ leads }: { leads: CommentLead[] }) {
  const selectable = leads.filter((l) => l.phone && !l.ai_call_requested_at);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allOn = selectable.length > 0 && selectable.every((l) => selected.has(l.id));

  return (
    <form action={requestAiCallAction} className="flex flex-col gap-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="leadId" value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!selected.size}>
          ส่ง AI โทร {selected.size ? `${selected.size} คน` : ''}
        </Button>
        {selectable.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(allOn ? new Set() : new Set(selectable.map((l) => l.id)))}
          >
            {allOn ? 'ล้างที่เลือก' : `เลือกทุกคนที่ยังไม่ได้ส่ง (${selectable.length})`}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">เลือก</span>
            </TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>เบอร์</TableHead>
            <TableHead className="hidden md:table-cell">คอมเมนต์</TableHead>
            <TableHead className="hidden lg:table-cell">ใบงาน</TableHead>
            <TableHead>AI โทร</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => {
            const canPick = Boolean(l.phone) && !l.ai_call_requested_at;
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <Checkbox
                    aria-label={`เลือก ${l.commenter_name ?? ''}`}
                    disabled={!canPick}
                    checked={selected.has(l.id)}
                    onCheckedChange={(v) => toggle(l.id, v === true)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {l.commenter_profile_url ? (
                    <a href={l.commenter_profile_url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      {l.commenter_name}
                    </a>
                  ) : (
                    l.commenter_name
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{l.phone ?? '-'}</TableCell>
                <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">{l.comment_text}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{l.request_no ?? '-'}</TableCell>
                <TableCell>
                  {l.ai_call_batch_id ? (
                    <Badge variant="outline" className="border-success/30 bg-success/10 text-success">ส่งแล้ว</Badge>
                  ) : l.ai_call_requested_at ? (
                    <Badge variant="outline" title={`ขอเมื่อ ${thaiTime(l.ai_call_requested_at)}`}>รอส่ง Jarvis</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </form>
  );
}
