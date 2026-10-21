import Link from 'next/link';
import { CircleAlertIcon, PlusIcon } from 'lucide-react';
import { listTasks } from '@/lib/repo';
import {
  SCRAP_GROUP_LABEL,
  listJarvisScrapRequests,
  listScrapConnectorChoices,
  scrapTaskUpdatedAt,
  toScrapTaskRow,
  type ScrapTaskGroup,
} from '@/lib/scrap-tasks';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ScrapIntakeCard } from '@/components/scrap/ScrapIntakeCard';
import { ScrapQueueKick } from '@/components/scrap/ScrapQueueKick';
import { ScrapTaskRow, type ScrapTaskRowData } from '@/components/scrap/ScrapTaskRow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dynamic = 'force-dynamic';

type TabKey = ScrapTaskGroup | 'all';

const TAB_ORDER: TabKey[] = ['working', 'review', 'attention', 'done', 'idle', 'all'];

const EMPTY_TEXT: Record<TabKey, string> = {
  working: 'ไม่มีงานที่กำลังทำ',
  review: 'ไม่มีงานที่รอตรวจรับ',
  attention: 'ไม่มีงานที่ติดปัญหา',
  done: 'ยังไม่มีงานที่เสร็จ',
  idle: 'ไม่มีงานที่บันทึกไว้แต่ยังไม่เริ่ม',
  all: 'ยังไม่มีงาน Scrap',
};

export default async function ScrapingPage(props: { searchParams?: Promise<{ notice?: string }> }) {
  const searchParams = await props.searchParams;
  const [tasks, requests, connectors] = await Promise.all([
    listTasks(),
    listJarvisScrapRequests(),
    listScrapConnectorChoices(),
  ]);
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const readyConnectors = connectors.filter((c) => c.available).length;

  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(scrapTaskUpdatedAt(b)).getTime() - new Date(scrapTaskUpdatedAt(a)).getTime(),
  );
  const rows = sortedTasks.map(toScrapTaskRow);
  const byTab: Record<TabKey, ScrapTaskRowData[]> = {
    working: rows.filter((r) => r.stage.group === 'working'),
    review: rows.filter((r) => r.stage.group === 'review'),
    attention: rows.filter((r) => r.stage.group === 'attention'),
    done: rows.filter((r) => r.stage.group === 'done'),
    idle: rows.filter((r) => r.stage.group === 'idle'),
    all: rows,
  };
  const defaultTab: TabKey =
    byTab.attention.length > 0 ? 'attention'
      : byTab.review.length > 0 ? 'review'
        : byTab.working.length > 0 ? 'working'
          : 'all';

  const anyBusy = tasks.some((t) => t.status === 'queued' || t.status === 'running');
  const anyQueued = tasks.some((t) => t.status === 'queued');

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh seconds={anyBusy ? 10 : 30} />
      <ScrapQueueKick active={anyQueued} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-snug font-semibold">งาน Scrap</h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            ค้นหาผู้สมัครจาก JobBKK และ JobThai กดที่งานเพื่อดูว่าถึงขั้นไหน ได้คนกี่คน และต้องทำอะไรต่อ
          </p>
        </div>
        <Button asChild>
          <Link href="/scraping/new">
            <PlusIcon data-icon="inline-start" />
            สร้างงานค้นหาเอง
          </Link>
        </Button>
      </header>

      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {readyConnectors === 0 && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>ยังไม่มีบัญชีค้นหาที่พร้อมใช้</AlertTitle>
          <AlertDescription>
            เริ่มงานใหม่ไม่ได้จนกว่าจะมีบัญชี JobBKK หรือ JobThai ที่ใช้ได้{' '}
            <Link href="/settings/connectors" className="underline underline-offset-4">ไปตรวจบัญชี</Link>
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="jarvis-requests">
        <h2 id="jarvis-requests" className="flex items-center gap-2 text-base font-semibold">
          คำขอจาก Jarvis รอกดเริ่ม
          {requests.length > 0 && <Badge variant="secondary" className="tabular-nums">{requests.length}</Badge>}
        </h2>
        {requests.length === 0 ? (
          <Empty className="border py-8">
            <EmptyHeader>
              <EmptyTitle>ไม่มีคำขอที่รอเริ่ม</EmptyTitle>
              <EmptyDescription>สั่ง Scrap จากหน้าใบขอใน Jarvis แล้วคำขอจะขึ้นที่นี่</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          requests.map((item) => <ScrapIntakeCard key={item.id} item={item} connectors={connectors} />)
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="scrap-tasks">
        <h2 id="scrap-tasks" className="text-base font-semibold">งานค้นหา</h2>
        <Tabs defaultValue={defaultTab} className="gap-4">
          <TabsList aria-label="กรองงานตามสถานะ" className="max-w-full justify-start overflow-x-auto">
            {TAB_ORDER.map((key) => (
              <TabsTrigger key={key} value={key} className="flex-none px-3">
                {key === 'all' ? 'ทั้งหมด' : SCRAP_GROUP_LABEL[key]}
                <span className="tabular-nums text-muted-foreground">{byTab[key].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_ORDER.map((key) => (
            <TabsContent key={key} value={key} className="flex flex-col gap-2">
              {byTab[key].length === 0 ? (
                <Empty className="border py-10">
                  <EmptyHeader>
                    <EmptyDescription>{EMPTY_TEXT[key]}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                byTab[key].map((row) => <ScrapTaskRow key={row.id} task={row} />)
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}
