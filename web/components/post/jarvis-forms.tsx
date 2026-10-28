import { ChevronDownIcon } from 'lucide-react';
import { postJarvisOrderAction, returnJarvisPostOrderAction } from '@/lib/actions';
import { postModeLabel, REPOST_MIN_GAP_DAYS } from '@/lib/repo';
import type { JarvisPostOrder } from '@/lib/repo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { thaiTime } from './post-ui';
import { CaptionEditor } from './CaptionEditor';
import { RepostGroupPicker } from './RepostGroupPicker';
import { Textarea } from '@/components/ui/textarea';

/** ติ๊กยืนยัน + ปุ่ม — server action เช็ก confirm=yes อีกชั้นและแจ้งกลับถ้าไม่ได้ติ๊ก */
export function ConfirmAndSubmit({ id, label, disabled }: { id: string; label: string; disabled: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Field orientation="horizontal" className="w-auto" data-disabled={disabled || undefined}>
        <Checkbox id={id} name="confirm" value="yes" disabled={disabled} />
        <FieldLabel htmlFor={id} className="font-normal">ยืนยันว่าจะโพสต์จริงลงกลุ่ม</FieldLabel>
      </Field>
      <Button size="sm" disabled={disabled}>{label}</Button>
    </div>
  );
}

/** โพสต์ใบสั่งจาก Jarvis ที่โพสต์ไปแล้วซ้ำ ลงกลุ่มที่เลือก */
export function RepostForm({
  order,
  defaultOpen = false,
  unfinishedFbIds = [],
}: {
  order: JarvisPostOrder;
  defaultOpen?: boolean;
  /** Facebook group id ของกลุ่มที่รอบนี้ไม่สำเร็จ/ยังไม่ได้โพสต์ — ใช้กับปุ่มเลือกอัตโนมัติ */
  unfinishedFbIds?: string[];
}) {
  const busy = order.queue_status === 'queued' || order.queue_status === 'running';
  return (
    <Collapsible className="w-full" defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm">
          โพสต์ซ้ำ
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <RepostGroupPicker
          requestNo={order.request_no}
          groups={order.repost_groups}
          busy={busy}
          gapDays={REPOST_MIN_GAP_DAYS}
          unfinishedFbIds={unfinishedFbIds}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** ใบสั่งโพสต์จาก Jarvis ที่ยังไม่ได้โพสต์ */
export function PendingOrderCard({ order }: { order: JarvisPostOrder }) {
  const blockers = [
    ...order.issues,
    ...(!order.issues.length && !order.worker_online ? [order.worker_problem ?? 'เครื่องยังไม่พร้อมรับงาน'] : []),
  ];
  const meta = [
    order.request_no,
    postModeLabel(order.post_mode),
    `${order.group_names.length} กลุ่ม`,
    order.account_label ? `บัญชี ${order.account_label}` : null,
    `Jarvis สั่งเมื่อ ${thaiTime(order.created_at)}`,
  ].filter(Boolean).join(' · ');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{order.position}</CardTitle>
        <CardDescription>{meta}</CardDescription>
        <CardAction>
          <Badge variant={blockers.length ? 'destructive' : 'outline'}>{blockers.length ? 'โพสต์ไม่ได้' : 'รอสั่งโพสต์'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {blockers.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>ยังโพสต์ไม่ได้</AlertTitle>
            <AlertDescription>{blockers.join(' · ')}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">กลุ่ม: {order.group_names.join(', ') || '-'}</p>
        <Collapsible defaultOpen={order.issues.some((i) => !i.startsWith('ชนิด'))}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              ข้อความประกาศ / แก้ข้อความ
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <CaptionEditor requestNo={order.request_no} caption={order.caption} />
          </CollapsibleContent>
        </Collapsible>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              ตีกลับให้ Jarvis แก้
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <form action={returnJarvisPostOrderAction} className="flex flex-col gap-3">
              <input type="hidden" name="requestNo" value={order.request_no} />
              <Field>
                <FieldLabel htmlFor={`return-${order.request_no}`}>เหตุผลที่ตีกลับ (ผู้สั่งใน Jarvis จะเห็นข้อความนี้)</FieldLabel>
                <Textarea
                  id={`return-${order.request_no}`}
                  name="reason"
                  rows={3}
                  required
                  defaultValue={order.issues.length ? `แก้ข้อความประกาศ: ${order.issues.join(', ')}` : ''}
                />
              </Field>
              <Button variant="destructive" size="sm" className="self-start">ตีกลับใบนี้</Button>
            </form>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      <CardFooter>
        <form action={postJarvisOrderAction}>
          <input type="hidden" name="requestNo" value={order.request_no} />
          <ConfirmAndSubmit id={`post-confirm-${order.request_no}`} label="โพสต์" disabled={blockers.length > 0} />
        </form>
      </CardFooter>
    </Card>
  );
}
