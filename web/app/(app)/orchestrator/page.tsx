import Link from 'next/link';
import { ChevronDownIcon, ChevronRightIcon, CircleAlertIcon } from 'lucide-react';
import { listJarvisPostOrders, listSoRecruitPostingRequests, listTasks } from '@/lib/repo';
import { listPostTasks } from '@/lib/post-tasks';
import type { PostTask } from '@/lib/post-tasks';
import { listJarvisScrapRequests, scrapTaskUpdatedAt, toScrapTaskRow } from '@/lib/scrap-tasks';
import type { ScrapTaskRowData } from '@/components/scrap/ScrapTaskRow';
import { rejectDisabledContentRequestsAction } from '@/lib/actions';
import { operatorJobTitle } from '@/lib/operator-copy';
import { isContentGenerationEnabled, productScopeSummary } from '@/lib/product-scope';
import { AutoRefresh } from '@/components/AutoRefresh';
import { WorkerStatus } from '@/components/WorkerStatus';
import { MachineStatus } from '@/components/MachineStatus';
import { ScrapStatusBadge } from '@/components/scrap/ScrapStatusBadge';
import { countsLine, GroupStrip, taskStageBadge } from '@/components/post/post-ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

export const dynamic = 'force-dynamic';

function Count({ label, value, href, tone }: { label: string; value: number; href: string; tone?: 'destructive' | 'warning' }) {
  return (
    <Link href={href} className="flex flex-col gap-0.5 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-2xl font-semibold tabular-nums ${value > 0 && tone === 'destructive' ? 'text-destructive' : value > 0 && tone === 'warning' ? 'text-warning' : ''}`}
      >
        {value}
      </span>
    </Link>
  );
}

function ScrapRow({ task }: { task: ScrapTaskRowData }) {
  return (
    <Item variant="outline" size="sm" asChild>
      <Link href={`/scraping/${task.id}`}>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap">
            <span className="truncate">{task.title}</span>
            <Badge variant="outline">Scrap</Badge>
          </ItemTitle>
          <ItemDescription>{[task.requestNo, task.stage.stepText].filter(Boolean).join(' · ')}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ScrapStatusBadge group={task.stage.group} label={task.stage.statusLabel} />
          <ChevronRightIcon className="text-muted-foreground" />
        </ItemActions>
      </Link>
    </Item>
  );
}

function PostRow({ task }: { task: PostTask }) {
  return (
    <Item variant="outline" size="sm" asChild>
      <Link href={`/autopost/runs/${task.id}`}>
        <ItemContent className="min-w-0 gap-1.5">
          <ItemTitle className="flex-wrap">
            <span className="truncate">{task.title}</span>
            <Badge variant="outline">โพสต์</Badge>
          </ItemTitle>
          <ItemDescription>{countsLine(task)}</ItemDescription>
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

// ศูนย์งาน = หน้าสรุปของงาน Scrap และงานโพสต์ ตัวงานจริงอยู่ในหน้าของแต่ละฝั่ง
export default async function OrchestratorPage(props: { searchParams?: Promise<{ notice?: string }> }) {
  const searchParams = await props.searchParams;
  const [jarvisScrap, tasks, postOrders, postTasks, reqs] = await Promise.all([
    listJarvisScrapRequests(),
    listTasks(),
    listJarvisPostOrders(),
    listPostTasks(),
    listSoRecruitPostingRequests(),
  ]);

  // งานที่ไม่ขยับเกิน 14 วันไม่นับในหน้าสรุป (ยังดูได้ที่หน้างาน Scrap แท็บทั้งหมด)
  const recentCutoff = Date.now() - 14 * 86_400_000;
  const scrapRows = tasks
    .filter((t) => t.status !== 'idle' || t.source_request_no)
    .filter((t) => t.status === 'queued' || t.status === 'running' || new Date(scrapTaskUpdatedAt(t)).getTime() > recentCutoff)
    .map(toScrapTaskRow);
  const scrap = {
    waiting: jarvisScrap.length,
    working: scrapRows.filter((t) => t.stage.group === 'working'),
    review: scrapRows.filter((t) => t.stage.group === 'review'),
    attention: scrapRows.filter((t) => t.stage.group === 'attention'),
  };
  const weekAgo = Date.now() - 7 * 86_400_000;
  const pendingPosts = postOrders.filter((o) => o.jarvis_status === 'pending');
  const livePosts = postTasks.filter((t) => t.status === 'queued' || t.status === 'running');
  const problemPosts = postTasks.filter(
    (t) => !livePosts.includes(t) && (t.stage.state === 'failed' || t.counts.failed > 0 || t.counts.not_member > 0) && new Date(t.created_at).getTime() > weekAgo,
  );
  const postedGroups7d = postTasks
    .filter((t) => new Date(t.created_at).getTime() > weekAgo)
    .reduce((n, t) => n + t.counts.posted, 0);

  // คำขอสร้างประกาศแบบเดิม (ไม่มี caption) ระบบนี้ไม่ทำแล้ว ให้ตีกลับได้จากที่นี่
  const disabledContent = isContentGenerationEnabled()
    ? []
    : reqs
      .filter((r) => r.request_type === 'content' && !String((r.job_snapshot ?? {}).caption ?? '').trim())
      .map((r) => ({
        requestNo: r.request_no,
        title: operatorJobTitle({
          position: String((r.job_snapshot as Record<string, unknown> | null)?.position ?? ''),
          title: r.erp_title,
          requestNo: r.request_no,
        }),
      }));

  const live = scrap.working.length > 0 || livePosts.length > 0;
  const nothingToDo =
    !scrap.waiting && !scrap.review.length && !scrap.attention.length && !pendingPosts.length && !problemPosts.length;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh seconds={live ? 15 : 30} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">ศูนย์งาน</h1>
        <p className="text-sm text-muted-foreground">สรุปงาน Scrap และงานโพสต์ กดตัวเลขหรือรายการเพื่อไปที่งานนั้น</p>
      </div>

      {typeof searchParams?.notice === 'string' && (
        <Alert role="status">
          <AlertDescription>{searchParams.notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>งาน Scrap</CardTitle>
            <CardDescription>หาผู้สมัครจาก JobThai และ JobBKK</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/scraping">
                  ไปหน้างาน Scrap
                  <ChevronRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Count label="Jarvis รอกดเริ่ม" value={scrap.waiting} href="/scraping" tone="warning" />
            <Count label="กำลังทำ" value={scrap.working.length} href="/scraping" />
            <Count label="ต้องตรวจรับ" value={scrap.review.length} href="/scraping" tone="warning" />
            <Count label="ติดปัญหา (14 วัน)" value={scrap.attention.length} href="/scraping" tone="destructive" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>งานโพสต์</CardTitle>
            <CardDescription>โพสต์ประกาศลงกลุ่ม Facebook</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/autopost/jobs">
                  ไปหน้างานโพสต์
                  <ChevronRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Count label="Jarvis รอโพสต์" value={pendingPosts.length} href="/autopost/jobs" tone="warning" />
            <Count label="กำลังโพสต์" value={livePosts.length} href="/autopost/jobs" />
            <Count label="ติดปัญหา (7 วัน)" value={problemPosts.length} href="/autopost/jobs" tone="destructive" />
            <Count label="กลุ่มที่โพสต์ได้ (7 วัน)" value={postedGroups7d} href="/autopost/jobs" />
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">ต้องจัดการตอนนี้</h2>
        {nothingToDo ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ไม่มีงานที่ต้องจัดการ</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {scrap.waiting > 0 && (
              <Item variant="outline" size="sm" asChild>
                <Link href="/scraping">
                  <ItemContent>
                    <ItemTitle>คำขอ Scrap จาก Jarvis รอกดเริ่ม {scrap.waiting} รายการ</ItemTitle>
                    <ItemDescription>{jarvisScrap.map((r) => r.requestNo).filter(Boolean).slice(0, 5).join(' · ')}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRightIcon className="text-muted-foreground" />
                  </ItemActions>
                </Link>
              </Item>
            )}
            {pendingPosts.length > 0 && (
              <Item variant="outline" size="sm" asChild>
                <Link href="/autopost/jobs">
                  <ItemContent>
                    <ItemTitle>คำสั่งโพสต์จาก Jarvis รอโพสต์ {pendingPosts.length} รายการ</ItemTitle>
                    <ItemDescription>{pendingPosts.map((o) => o.request_no).slice(0, 5).join(' · ')}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRightIcon className="text-muted-foreground" />
                  </ItemActions>
                </Link>
              </Item>
            )}
            {[...scrap.attention, ...scrap.review].map((t) => (
              <ScrapRow key={t.id} task={t} />
            ))}
            {problemPosts.map((t) => (
              <PostRow key={t.id} task={t} />
            ))}
          </ItemGroup>
        )}
      </section>

      {live && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">กำลังทำ</h2>
          <ItemGroup className="gap-2">
            {scrap.working.map((t) => (
              <ScrapRow key={t.id} task={t} />
            ))}
            {livePosts.map((t) => (
              <PostRow key={t.id} task={t} />
            ))}
          </ItemGroup>
        </section>
      )}

      {disabledContent.length > 0 && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>มีคำขอสร้างประกาศ {disabledContent.length} รายการ ระบบนี้ไม่รับแล้ว</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              {disabledContent.slice(0, 3).map((r) => r.title || r.requestNo).join(' · ')}
              {disabledContent.length > 3 ? ` และอีก ${disabledContent.length - 3} รายการ` : ''}
            </p>
            <form action={rejectDisabledContentRequestsAction}>
              {disabledContent.map((r) => (
                <input key={r.requestNo} type="hidden" name="requestNo" value={r.requestNo} />
              ))}
              <Button variant="secondary" size="sm">ตีกลับทั้งหมด</Button>
            </form>
          </AlertDescription>
        </Alert>
      )}

      <MachineStatus />

      <Collapsible className="rounded-lg border bg-card px-4 py-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2">
            ความพร้อมทั้งระบบ · {productScopeSummary()}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 pb-2">
          <WorkerStatus />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
