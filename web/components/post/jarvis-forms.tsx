import Link from 'next/link';
import { ChevronDownIcon } from 'lucide-react';
import { postJarvisOrderAction, repostJarvisOrderAction } from '@/lib/actions';
import { postModeLabel, REPOST_MIN_GAP_DAYS } from '@/lib/repo';
import type { JarvisPostOrder } from '@/lib/repo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { thaiTime } from './post-ui';

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
export function RepostForm({ order, defaultOpen = false }: { order: JarvisPostOrder; defaultOpen?: boolean }) {
  const busy = order.queue_status === 'queued' || order.queue_status === 'running';
  const pickable = order.repost_groups.filter((g) => g.account_label && !g.blocked_until);
  return (
    <Collapsible className="w-full" defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm">
          โพสต์ซ้ำ
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form action={repostJarvisOrderAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="requestNo" value={order.request_no} />
          <FieldSet>
            <FieldLegend variant="label">เลือกกลุ่ม</FieldLegend>
            <FieldDescription>
              กลุ่มเดิมต้องเว้น {REPOST_MIN_GAP_DAYS} วัน เพิ่มกลุ่มได้ที่{' '}
              <Link href="/settings/posting">ตั้งค่าการโพสต์</Link>
            </FieldDescription>
            {order.repost_groups.map((g) => {
              const id = `repost-${order.request_no}-${g.id}`;
              const disabled = busy || !g.account_label || Boolean(g.blocked_until);
              return (
                <Field key={g.id} orientation="horizontal" data-disabled={disabled || undefined}>
                  <Checkbox id={id} name="groupId" value={g.id} disabled={disabled} />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {g.name}
                    <span className="text-muted-foreground">
                      {!g.account_label
                        ? ' · ยังไม่มีบัญชี Facebook ที่ผูกกลุ่มนี้'
                        : g.blocked_until
                          ? ` · โพสต์ซ้ำได้หลัง ${thaiTime(g.blocked_until)}`
                          : ` · โพสต์ด้วย ${g.account_label}`}
                    </span>
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldSet>
          {busy && <p className="text-sm text-muted-foreground">มีรอบโพสต์ของใบนี้รอคิวอยู่ รอให้เสร็จก่อน</p>}
          <ConfirmAndSubmit id={`repost-confirm-${order.request_no}`} label="โพสต์ซ้ำ" disabled={busy || !pickable.length} />
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** ใบสั่งโพสต์จาก Jarvis ที่ยังไม่ได้โพสต์ */
export function PendingOrderCard({ order }: { order: JarvisPostOrder }) {
  const blockers = [
    ...order.issues,
    ...(!order.issues.length && !order.worker_online ? ['เครื่องที่ผูกกับบัญชี Facebook ยังออฟไลน์'] : []),
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
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              ข้อความประกาศ
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-muted p-4 font-sans text-sm whitespace-pre-wrap">{order.caption}</pre>
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
