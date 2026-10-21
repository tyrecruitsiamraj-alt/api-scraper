import Link from 'next/link';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { listJarvisPostOrders, listPostAssignments } from '@/lib/repo';
import { listPostTasks } from '@/lib/post-tasks';
import type { PostTask } from '@/lib/post-tasks';
import { postAssignmentNowAction, runFacebookPreflightAction } from '@/lib/actions';
import { AutopostNav } from '@/components/AutopostNav';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ConfirmAndSubmit, PendingOrderCard } from '@/components/post/jarvis-forms';
import { countsLine, GroupStrip, taskStageBadge, thaiTime } from '@/components/post/post-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dynamic = 'force-dynamic';

const QUEUE_LABEL: Record<string, string> = {
  queued: 'รอคิว',
  running: 'กำลังโพสต์',
  completed: 'โพสต์เสร็จ',
  failed: 'ไม่สำเร็จ',
  cancelled: 'ยกเลิก',
};

function TaskRow({ task }: { task: PostTask }) {
  const meta = [task.account, task.worker ? `เครื่อง ${task.worker}` : null, `สั่งเมื่อ ${thaiTime(task.created_at)}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <Item variant="outline" asChild>
      <Link href={`/autopost/runs/${task.id}`}>
        <ItemContent className="gap-2">
          <ItemTitle className="flex-wrap">
            {task.title}
            {task.is_repost && <Badge variant="outline">โพสต์ซ้ำ</Badge>}
          </ItemTitle>
          <ItemDescription>{meta}</ItemDescription>
          <p className="text-sm">{countsLine(task)}</p>
          <GroupStrip groups={task.groups} />
        </ItemContent>
        <ItemActions>
          {taskStageBadge(task)}
          <ChevronRightIcon className="text-muted-foreground" />
        </ItemActions>
      </Link>
    </Item>
  );
}

function TaskList({ tasks, empty }: { tasks: PostTask[]; empty: string }) {
  if (!tasks.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{empty}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ItemGroup className="gap-3">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </ItemGroup>
  );
}

export default async function AutopostJobsPage(props: { searchParams?: Promise<{ notice?: string }> }) {
  const searchParams = await props.searchParams;
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const [orders, tasks, assignments] = await Promise.all([listJarvisPostOrders(), listPostTasks(), listPostAssignments()]);
  const pendingOrders = orders.filter((o) => o.jarvis_status === 'pending');
  const legacy = assignments.filter((row) => !row.id.startsWith('jv-'));

  const live = tasks.filter((t) => t.status === 'queued' || t.status === 'running');
  const problem = tasks.filter((t) => !live.includes(t) && (t.stage.state === 'failed' || t.counts.failed > 0));
  const done = tasks.filter((t) => !live.includes(t) && !problem.includes(t));
  const defaultTab = live.length ? 'live' : problem.length ? 'problem' : 'done';

  return (
    <div className="flex flex-col gap-6">
      {live.length > 0 && <AutoRefresh seconds={10} />}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">งานโพสต์</h1>
        <p className="text-sm text-muted-foreground">
          สั่งโพสต์จาก Jarvis แล้วดูแต่ละรอบว่าถึงกลุ่มไหน สำเร็จหรือไม่ กดที่งานเพื่อดูผลรายกลุ่ม
        </p>
      </div>

      <AutopostNav />

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {pendingOrders.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            คำสั่งจาก Jarvis รอโพสต์
            <Badge variant="secondary">{pendingOrders.length}</Badge>
          </h2>
          {pendingOrders.map((order) => (
            <PendingOrderCard key={order.request_no} order={order} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">งานโพสต์ (รายรอบ)</h2>
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="live">กำลังทำ {live.length}</TabsTrigger>
            <TabsTrigger value="problem">ติดปัญหา {problem.length}</TabsTrigger>
            <TabsTrigger value="done">เสร็จแล้ว {done.length}</TabsTrigger>
            <TabsTrigger value="all">ทั้งหมด {tasks.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="live" className="mt-3">
            <TaskList tasks={live} empty="ไม่มีงานที่กำลังโพสต์" />
          </TabsContent>
          <TabsContent value="problem" className="mt-3">
            <TaskList tasks={problem} empty="ไม่มีงานที่ติดปัญหา" />
          </TabsContent>
          <TabsContent value="done" className="mt-3">
            <TaskList tasks={done} empty="ยังไม่มีงานที่เสร็จ" />
          </TabsContent>
          <TabsContent value="all" className="mt-3">
            <TaskList tasks={tasks} empty="ยังไม่มีงานโพสต์" />
          </TabsContent>
        </Tabs>
      </section>

      {legacy.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              งานโพสต์ที่ผูกไว้ในระบบเดิม ({legacy.length})
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 flex flex-col gap-3">
            {legacy.map((row) => {
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
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
