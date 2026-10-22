import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronDownIcon, ExternalLinkIcon } from 'lucide-react';
import { getPostTask, getPostTaskLogs } from '@/lib/post-tasks';
import { listJarvisPostOrders } from '@/lib/repo';
import { AutoRefresh } from '@/components/AutoRefresh';
import { GroupDetailDialog } from '@/components/post/GroupDetailDialog';
import { RepostForm } from '@/components/post/jarvis-forms';
import { GroupStatusBadge, GroupStrip, PostTaskSteps, taskStageBadge, thaiTime } from '@/components/post/post-ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'destructive' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

const num = (n: number | null) => (n === null ? '-' : n.toLocaleString('th-TH'));

export default async function PostTaskPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const task = await getPostTask(params.id);
  if (!task) notFound();
  const [logs, orders] = await Promise.all([
    task.run_id ? getPostTaskLogs(task.run_id) : Promise.resolve([]),
    task.request_no ? listJarvisPostOrders() : Promise.resolve([]),
  ]);
  const order = task.request_no ? orders.find((o) => o.request_no === task.request_no) ?? null : null;
  const live = task.status === 'queued' || task.status === 'running';
  const groups = task.groups;
  const sum = (pick: (g: (typeof groups)[number]) => number | null) =>
    groups.some((g) => pick(g) !== null) ? groups.reduce((n, g) => n + (pick(g) ?? 0), 0) : null;
  const meta = [
    task.account ? `บัญชี ${task.account}` : null,
    task.worker ? `เครื่อง ${task.worker}` : null,
    task.requested_by ? `สั่งโดย ${task.requested_by}` : null,
    `สั่งเมื่อ ${thaiTime(task.created_at)}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-6">
      {live && <AutoRefresh seconds={8} />}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/autopost/jobs">งานโพสต์</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{task.request_no ?? task.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {task.title}
            {task.is_repost && <Badge variant="outline">โพสต์ซ้ำ</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        {taskStageBadge(task)}
      </header>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <PostTaskSteps task={task} />
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="สั่งโพสต์" value={`${task.counts.planned} กลุ่ม`} />
            <Stat label="สำเร็จ" value={task.counts.posted} tone="success" />
            <Stat label="ไม่สำเร็จ" value={task.counts.failed} tone={task.counts.failed ? 'destructive' : undefined} />
            <Stat label="กำลังโพสต์" value={task.current ? `กลุ่มที่ ${task.current.order}` : '-'} />
            <Stat label="ไลก์รวม" value={num(sum((g) => g.reactions))} />
            <Stat label="คอมเมนต์รวม" value={num(sum((g) => g.comments))} />
          </dl>
          <GroupStrip groups={task.groups} />
        </CardContent>
      </Card>

      {task.counts.not_member > 0 && (
        <Alert>
          <AlertTitle>ยังไม่ได้เข้ากลุ่ม {task.counts.not_member} กลุ่ม</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              ระบบกดเข้าร่วมให้ได้รอบละไม่เกิน 5 กลุ่ม กลุ่มที่ต้องตอบคำถามหรือรอแอดมินอนุมัติ ต้องเข้าร่วมเองด้วยบัญชี {task.account ?? 'ที่โพสต์'} แล้วค่อยโพสต์ซ้ำ
            </p>
            <ul className="flex flex-col gap-1">
              {task.groups
                .filter((g) => g.status === 'not_member')
                .map((g) => (
                  <li key={g.group_id} className="flex flex-wrap items-center gap-2">
                    <a href={`https://www.facebook.com/groups/${g.group_id}`} target="_blank" rel="noreferrer" className="underline">
                      {g.name}
                    </a>
                    <span className="text-muted-foreground">{String(g.error ?? '').replace(/\s*\(.*$/, '')}</span>
                  </li>
                ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {task.error && (
        <Alert variant="destructive">
          <AlertTitle>รอบนี้มีปัญหา</AlertTitle>
          <AlertDescription className="whitespace-pre-line break-words">{task.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ผลรายกลุ่ม</CardTitle>
          <CardDescription>เรียงตามลำดับที่โพสต์ กด "ดูผล" เพื่อดูไลก์ คอมเมนต์ และลิงก์ของกลุ่มนั้น</CardDescription>
        </CardHeader>
        <CardContent>
          {task.groups.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>ยังไม่รู้ว่าจะโพสต์กลุ่มไหน</EmptyTitle>
                <EmptyDescription>รอเครื่องรับงาน แล้วรายชื่อกลุ่มจะขึ้นที่นี่</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>กลุ่ม</TableHead>
                  <TableHead>ผล</TableHead>
                  <TableHead className="hidden md:table-cell">ในกลุ่ม</TableHead>
                  <TableHead className="text-right">ไลก์</TableHead>
                  <TableHead className="text-right">คอมเมนต์</TableHead>
                  <TableHead className="hidden lg:table-cell">เวลา</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">รายละเอียด</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {task.groups.map((g) => (
                  <TableRow key={g.group_id}>
                    <TableCell className="text-muted-foreground tabular-nums">{g.order}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        {g.name}
                        {g.post_link && (
                          <Button asChild variant="ghost" size="icon-xs" aria-label="เปิดโพสต์">
                            <a href={g.post_link} target="_blank" rel="noreferrer">
                              <ExternalLinkIcon />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <GroupStatusBadge status={g.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{g.approval ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(g.reactions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(g.comments)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{thaiTime(g.finished_at ?? g.started_at)}</TableCell>
                    <TableCell className="text-right">
                      <GroupDetailDialog group={g} worker={task.worker} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {order && order.jarvis_status !== 'pending' && !live && (
        <Card>
          <CardHeader>
            <CardTitle>โพสต์ใบนี้ซ้ำ</CardTitle>
            <CardDescription>สร้างงานโพสต์รอบใหม่จาก {order.request_no} ลงกลุ่มที่เลือก</CardDescription>
          </CardHeader>
          <CardContent>
            <RepostForm
              order={order}
              defaultOpen={task.groups.some((g) => g.status !== 'posted')}
              unfinishedFbIds={task.groups.filter((g) => g.status !== 'posted').map((g) => g.group_id)}
            />
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 self-start">
              บันทึกการทำงานของเครื่อง ({logs.length})
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {logs.map((l, i) => (
                <li key={`${l.at}-${i}`} className="flex gap-3">
                  <span className="shrink-0 text-muted-foreground tabular-nums">{thaiTime(l.at, false)}</span>
                  <span className={l.level === 'success' ? 'text-success' : l.level === 'warn' || l.level === 'error' ? 'text-destructive' : undefined}>
                    {l.message}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
