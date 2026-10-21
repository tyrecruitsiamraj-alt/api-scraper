import Link from 'next/link';
import { listJarvisPostOrders, listPostAssignments, postModeLabel, REPOST_MIN_GAP_DAYS } from '@/lib/repo';
import type { JarvisGroupResult, JarvisPostOrder } from '@/lib/repo';
import { postAssignmentNowAction, postJarvisOrderAction, repostJarvisOrderAction, runFacebookPreflightAction } from '@/lib/actions';
import { AutopostNav } from '@/components/AutopostNav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDownIcon, ExternalLinkIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

// เซิร์ฟเวอร์ Vercel เป็น UTC — บังคับเวลาไทย
function thaiTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** ข้อความ error ของ worker มีหมายเหตุภายในในวงเล็บท้ายประโยค — ตัดออกให้อ่านง่าย */
function shortError(message: string | null): string {
  return String(message ?? '').replace(/\s*\(.*$/, '').trim() || 'โพสต์ไม่สำเร็จ';
}

function orderStage(order: JarvisPostOrder, counts: ReturnType<typeof countGroups>): { label: string; variant: BadgeVariant } {
  if (order.jarvis_status === 'pending') {
    return order.issues.length ? { label: 'โพสต์ไม่ได้', variant: 'destructive' } : { label: 'รอสั่งโพสต์', variant: 'outline' };
  }
  if (order.queue_status === 'queued') return { label: 'รอเครื่องรับงาน', variant: 'outline' };
  if (order.queue_status === 'running') return { label: 'กำลังโพสต์', variant: 'secondary' };
  if (counts.posted === 0 && (counts.failed > 0 || order.queue_status === 'failed')) return { label: 'ไม่สำเร็จ', variant: 'destructive' };
  if (counts.posted > 0 && counts.posted < counts.planned) return { label: `โพสต์แล้ว ${counts.posted}/${counts.planned} กลุ่ม`, variant: 'secondary' };
  if (counts.posted > 0) return { label: 'โพสต์ครบแล้ว', variant: 'secondary' };
  return { label: 'รอผล', variant: 'outline' };
}

function countGroups(groups: JarvisGroupResult[]) {
  const sum = (pick: (g: JarvisGroupResult) => number | null) =>
    groups.some((g) => pick(g) !== null) ? groups.reduce((n, g) => n + (pick(g) ?? 0), 0) : null;
  return {
    planned: groups.length,
    posted: groups.filter((g) => g.status === 'posted').length,
    failed: groups.filter((g) => g.status === 'failed').length,
    waiting: groups.filter((g) => g.status === 'waiting').length,
    comments: sum((g) => g.comments),
    reactions: sum((g) => g.reactions),
  };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const RESULT_BADGE: Record<JarvisGroupResult['status'], { label: string; variant: BadgeVariant }> = {
  posted: { label: 'โพสต์แล้ว', variant: 'secondary' },
  failed: { label: 'ไม่สำเร็จ', variant: 'destructive' },
  waiting: { label: 'ยังไม่โพสต์', variant: 'outline' },
};

function GroupTable({ groups }: { groups: JarvisGroupResult[] }) {
  const num = (n: number | null) => (n === null ? '-' : n.toLocaleString('th-TH'));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>กลุ่ม</TableHead>
          <TableHead>ผล</TableHead>
          <TableHead>ในกลุ่ม</TableHead>
          <TableHead className="text-right">คอมเมนต์</TableHead>
          <TableHead className="text-right">ไลก์</TableHead>
          <TableHead className="text-right">แชร์</TableHead>
          <TableHead>เวลา</TableHead>
          <TableHead>โพสต์</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <TableRow key={g.fb_group_id}>
            <TableCell className="font-medium">{g.name}</TableCell>
            <TableCell>
              <div className="flex flex-col items-start gap-1">
                <Badge variant={RESULT_BADGE[g.status].variant}>{RESULT_BADGE[g.status].label}</Badge>
                {g.error && <span className="text-xs text-destructive">{shortError(g.error)}</span>}
              </div>
            </TableCell>
            <TableCell>{g.approval ?? '-'}</TableCell>
            <TableCell className="text-right tabular-nums">{num(g.comments)}</TableCell>
            <TableCell className="text-right tabular-nums">{num(g.reactions)}</TableCell>
            <TableCell className="text-right tabular-nums">{num(g.shares)}</TableCell>
            <TableCell className="text-muted-foreground">
              {g.at ? `${thaiTime(g.at)}${g.worker ? ` · ${g.worker}` : ''}` : '-'}
            </TableCell>
            <TableCell>
              {g.post_link ? (
                <Button asChild variant="link" size="sm" className="px-0">
                  <a href={g.post_link} target="_blank" rel="noreferrer">
                    เปิด
                    <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
              ) : (
                '-'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RepostForm({ order }: { order: JarvisPostOrder }) {
  const busy = order.queue_status === 'queued' || order.queue_status === 'running';
  const pickable = order.repost_groups.filter((g) => g.account_label && !g.blocked_until);
  return (
    <Collapsible className="w-full">
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
              return (
                <Field key={g.id} orientation="horizontal" data-disabled={busy || !g.account_label || Boolean(g.blocked_until) || undefined}>
                  <Checkbox id={id} name="groupId" value={g.id} disabled={busy || !g.account_label || Boolean(g.blocked_until)} />
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

/** ติ๊กยืนยัน + ปุ่ม — server action เช็ก confirm=yes อีกชั้นและแจ้งกลับถ้าไม่ได้ติ๊ก */
function ConfirmAndSubmit({ id, label, disabled }: { id: string; label: string; disabled: boolean }) {
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

function JarvisOrderCard({ order }: { order: JarvisPostOrder }) {
  const counts = countGroups(order.group_results);
  const stage = orderStage(order, counts);
  const failedGroups = order.group_results.filter((g) => g.status === 'failed');
  const blockers = order.jarvis_status === 'pending'
    ? [...order.issues, ...(!order.issues.length && !order.worker_online ? ['เครื่องที่ผูกกับบัญชี Facebook ยังออฟไลน์'] : [])]
    : failedGroups.map((g) => `${g.name}: ${shortError(g.error)}`);
  const noLink = order.group_results.some((g) => g.status === 'posted' && !g.post_link);
  const meta = [
    order.request_no,
    postModeLabel(order.post_mode),
    order.account_label ? `บัญชี ${order.account_label}` : null,
    order.requested_by_name ? `สั่งโดย ${order.requested_by_name}` : null,
    `Jarvis สั่งเมื่อ ${thaiTime(order.created_at)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{order.position}</CardTitle>
        <CardDescription>{meta}</CardDescription>
        <CardAction>
          <Badge variant={stage.variant}>{stage.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <Stat label="กลุ่มที่สั่ง" value={counts.planned} />
          <Stat label="โพสต์แล้ว" value={counts.posted} />
          <Stat label="ไม่สำเร็จ" value={counts.failed} />
          <Stat label="ยังไม่โพสต์" value={counts.waiting} />
          <Stat label="คอมเมนต์" value={counts.comments ?? '-'} />
          <Stat label="ไลก์" value={counts.reactions ?? '-'} />
        </dl>

        {blockers.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>{order.jarvis_status === 'pending' ? 'ยังโพสต์ไม่ได้' : 'มีกลุ่มที่โพสต์ไม่สำเร็จ'}</AlertTitle>
            <AlertDescription>{blockers.join(' · ')}</AlertDescription>
          </Alert>
        )}

        {order.group_results.length > 0 && <GroupTable groups={order.group_results} />}
        {noLink && (
          <p className="text-sm text-muted-foreground">
            ยอดคอมเมนต์และไลก์จะขึ้นเมื่อระบบเก็บลิงก์โพสต์ได้ โพสต์ที่ไม่มีลิงก์จึงยังไม่มีตัวเลข
          </p>
        )}

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

        {order.posts.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2">
                ประวัติการโพสต์ ({order.posts.length} ครั้ง)
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {order.posts.map((p) => (
                  <li key={`${p.at}-${p.group_name}`}>
                    {thaiTime(p.at)} · {p.group_name}
                    {p.worker ? ` · เครื่อง ${p.worker}` : ''}
                    {' · '}
                    <span className={p.ok ? undefined : 'text-destructive'}>{p.ok ? 'สำเร็จ' : shortError(p.message)}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
      <CardFooter>
        {order.jarvis_status === 'pending' ? (
          <form action={postJarvisOrderAction}>
            <input type="hidden" name="requestNo" value={order.request_no} />
            <ConfirmAndSubmit id={`post-confirm-${order.request_no}`} label="โพสต์" disabled={blockers.length > 0} />
          </form>
        ) : (
          <RepostForm order={order} />
        )}
      </CardFooter>
    </Card>
  );
}

const QUEUE_LABEL: Record<string, string> = {
  queued: 'รอคิว',
  running: 'กำลังโพสต์',
  completed: 'โพสต์เสร็จ',
  failed: 'ไม่สำเร็จ',
  cancelled: 'ยกเลิก',
};

// งานโพสต์ที่ผูกบัญชี+กลุ่มไว้แล้ว — สั่งโพสต์จริงหรือทดสอบแบบไม่โพสต์จากหน้านี้
export default async function AutopostJobsPage({ searchParams }: { searchParams?: { notice?: string } }) {
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const [orders, allRows] = await Promise.all([listJarvisPostOrders(), listPostAssignments()]);
  // งานที่สร้างจาก Jarvis แสดงในการ์ดด้านบนแล้ว ไม่ต้องซ้ำในรายการงานเดิม
  const rows = allRows.filter((row) => !row.id.startsWith('jv-'));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">งานโพสต์</h1>
        <p className="text-sm text-muted-foreground">
          สั่งโพสต์งานจาก Jarvis ดูผลรายกลุ่ม หรือทดสอบบัญชีแบบไม่โพสต์จริง
        </p>
      </div>

      <AutopostNav />

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">คำสั่งโพสต์จาก Jarvis</h2>
        {orders.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ยังไม่มีคำสั่งโพสต์จาก Jarvis</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          orders.map((order) => <JarvisOrderCard key={order.request_no} order={order} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">งานโพสต์อื่นในระบบ</h2>
        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ยังไม่มีงานโพสต์ที่ผูกบัญชีไว้</EmptyTitle>
              <EmptyDescription>
                เพิ่มบัญชีและกลุ่มได้ที่ <Link href="/settings/posting">ตั้งค่าการโพสต์</Link>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          rows.map((row) => {
            const busy = row.last_queue_status === 'queued' || row.last_queue_status === 'running';
            const blocker = !row.account_id
              ? 'ยังไม่ผูกบัญชี Facebook'
              : row.group_count <= 0
                ? 'ยังไม่เลือกกลุ่ม'
                : row.paused
                  ? 'บัญชีถูกพักชั่วคราว'
                  : !row.worker_online
                    ? `เครื่อง ${row.preferred_worker ?? '-'} ออฟไลน์`
                    : busy
                      ? 'มีงานโพสต์รอคิวอยู่แล้ว'
                      : null;
            return (
              <Card key={row.id}>
                <CardHeader>
                  <CardTitle>{row.job_titles}</CardTitle>
                  <CardDescription>
                    {row.account_label ?? 'ไม่มีบัญชี'} · {row.group_count} กลุ่ม · {row.has_image ? 'caption + รูป' : 'caption อย่างเดียว'}
                  </CardDescription>
                  <CardAction>
                    <Badge variant="outline">
                      {row.last_queue_status
                        ? `${QUEUE_LABEL[row.last_queue_status] ?? row.last_queue_status} · ${thaiTime(row.last_queue_at)}`
                        : 'ยังไม่เคยโพสต์'}
                    </Badge>
                  </CardAction>
                </CardHeader>
                {(row.caption_preview || blocker) && (
                  <CardContent className="flex flex-col gap-3">
                    {row.caption_preview && (
                      <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{row.caption_preview}</p>
                    )}
                    {blocker && (
                      <Alert>
                        <AlertDescription>โพสต์ไม่ได้ตอนนี้: {blocker}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                )}
                <CardFooter className="flex flex-wrap gap-4">
                  <form action={postAssignmentNowAction}>
                    <input type="hidden" name="assignmentId" value={row.id} />
                    <ConfirmAndSubmit id={`assignment-confirm-${row.id}`} label="โพสต์ตอนนี้" disabled={Boolean(blocker)} />
                  </form>
                  {row.account_id && (
                    <form action={runFacebookPreflightAction}>
                      <input type="hidden" name="fbAccountId" value={row.account_id} />
                      <Button variant="outline" size="sm" disabled={!row.worker_online}>ทดสอบแบบไม่โพสต์จริง</Button>
                    </form>
                  )}
                </CardFooter>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
