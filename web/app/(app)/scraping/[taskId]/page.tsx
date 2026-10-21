import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckIcon, CircleAlertIcon, UsersIcon } from 'lucide-react';
import { getTask } from '@/lib/repo';
import { humanizeOperatorError } from '@/lib/operator-copy';
import { cn } from '@/lib/utils';
import {
  RUN_STATUS_LABEL,
  criteriaEntries,
  deriveScrapStage,
  formatBangkokDateTime,
  listScrapRuns,
  platformLabel,
  scheduleLabel,
  scrapTaskTarget,
  scrapTaskTitle,
  scrapTaskUpdatedAt,
} from '@/lib/scrap-tasks';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ScrapQueueKick } from '@/components/scrap/ScrapQueueKick';
import { ScrapStageStepper } from '@/components/scrap/ScrapStageStepper';
import { ScrapStatusBadge } from '@/components/scrap/ScrapStatusBadge';
import { AdjacentPlanPanel, TaskApproveForm, TaskCriteriaEditor, TaskManageActions, TaskRunForm } from '../TaskList';
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'destructive' | 'success' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'destructive' && 'text-destructive',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function runSearchTerm(criteria: Record<string, unknown> | null) {
  const position = String(criteria?.position ?? '').trim();
  const keyword = String(criteria?.keyword ?? '').trim();
  if (position && keyword && position !== keyword) return `${position} · ${keyword}`;
  return position || keyword || '-';
}

/** หน้างาน Scrap หนึ่งงาน: อยู่ขั้นไหน ติดอะไร ได้คนกี่คน และปุ่มที่ใช้กับงานนี้ */
export default async function ScrapeTaskDetailPage(
  props: {
    params: Promise<{ taskId: string }>;
    searchParams?: Promise<{ started?: string; created?: string; notice?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const [task, runs] = await Promise.all([getTask(params.taskId), listScrapRuns(params.taskId)]);
  // งานถูกลบ (เช่น เพิ่งกดลบจากหน้านี้) หรือ id ผิด: กลับไปหน้ารายการ
  if (!task) redirect(`/scraping?notice=${encodeURIComponent('ไม่พบงานนี้ อาจถูกลบไปแล้ว')}`);

  const title = scrapTaskTitle(task);
  const stage = deriveScrapStage(task);
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const status = task.status;
  const busy = status === 'running' || status === 'queued';
  const target = scrapTaskTarget(task);
  const qualified = task.qualified_count ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((qualified / target) * 100)) : 0;
  const alreadyComplete = status === 'done' && target > 0 && qualified >= target;
  const runDisabled = busy || !task.enabled || alreadyComplete || !task.connector_available;
  const humanError = humanizeOperatorError(task.last_error);
  const criteria = criteriaEntries(task.criteria);
  const needsApproval = status === 'done' && task.review_status === 'pending';

  const lastProgressAt = task.last_progress_at ? new Date(task.last_progress_at).getTime() : null;
  const staleMin = lastProgressAt ? Math.floor((Date.now() - lastProgressAt) / 60000) : 0;
  const looksStuck = status === 'running' && staleMin >= 10;

  const meta = [
    task.source_request_no || 'สร้างเอง',
    platformLabel(task.platform),
    task.connector_label,
    `สร้างเมื่อ ${formatBangkokDateTime(task.created_at)}`,
  ];

  return (
    <div className="flex flex-col gap-6">
      {busy && <AutoRefresh seconds={10} />}
      <ScrapQueueKick active={status === 'queued'} />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/scraping">งาน Scrap</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl leading-snug font-semibold">{title}</h1>
            <ScrapStatusBadge group={stage.group} label={stage.statusLabel} />
            {!task.enabled && <Badge variant="outline">ปิดอยู่</Badge>}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{meta.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {needsApproval ? <TaskApproveForm taskId={task.id} /> : <TaskRunForm task={task} disabled={runDisabled} alreadyComplete={alreadyComplete} />}
          <Button variant="outline" asChild>
            <Link href={`/candidates/jobs/${task.id}`}>
              <UsersIcon data-icon="inline-start" />
              ดูผู้สมัคร
            </Link>
          </Button>
        </div>
      </header>

      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {searchParams?.started === '1' && busy && (
        <Alert role="status">
          <CheckIcon />
          <AlertTitle>รับคำสั่งแล้ว</AlertTitle>
          <AlertDescription>ระบบกำลังส่งงานให้เครื่องค้นหา หน้านี้อัปเดตเองทุก 10 วินาที</AlertDescription>
        </Alert>
      )}
      {searchParams?.created === '1' && status === 'idle' && (
        <Alert role="status">
          <CheckIcon />
          <AlertTitle>บันทึกงานแล้ว</AlertTitle>
          <AlertDescription>พร้อมเมื่อไหร่ กด “รันตอนนี้” ครั้งเดียวพอ</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>อยู่ขั้นไหน</CardTitle>
          <CardDescription className="leading-relaxed">
            {stage.stepText}
            {stage.note ? ` · ${stage.note}` : ''}
            {status === 'running' && stage.current === 'search' && ` · เปิดดูแล้ว ${task.assessed_total ?? 0} โปรไฟล์`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ScrapStageStepper steps={stage.steps} running={stage.running} />
          {looksStuck && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>ไม่มีผลใหม่มา {staleMin} นาทีแล้ว</AlertTitle>
              <AlertDescription>เครื่องยังเปิดอยู่แต่ยังไม่ได้โปรไฟล์ใหม่ รอต่ออีกสักพัก หรือดูสถานะเครื่องที่ศูนย์งาน</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {(status === 'error' || status === 'partial') && humanError && (
        <Alert variant={status === 'error' ? 'destructive' : 'default'}>
          <CircleAlertIcon />
          <AlertTitle>ติดอะไร: {humanError.title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-1.5">
            <p>{humanError.detail}</p>
            <p className="font-medium text-foreground">ทำต่อ: {humanError.next}</p>
            {humanError.technical && (
              <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs wrap-break-word text-muted-foreground">
                สาเหตุระบบ: {humanError.technical}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!task.connector_available && task.connector_block_reason && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>ยังเริ่มงานนี้ไม่ได้</AlertTitle>
          <AlertDescription>
            {task.connector_block_reason}{' '}
            <Link href="/settings/connectors" className="underline underline-offset-4">ไปตรวจบัญชี</Link>
          </AlertDescription>
        </Alert>
      )}
      {status === 'done' && qualified === 0 && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>รอบนี้ไม่พบผู้สมัครที่ผ่านเกณฑ์</AlertTitle>
          <AlertDescription>
            มักเกิดจากตัวกรองหลายอย่างพร้อมกัน (ตำแหน่ง จังหวัด วุฒิ อายุ) หรือคำค้นไม่ตรงกับคำที่คนเขียนใน Resume
            ลองเอาอายุหรือวุฒิออก แล้วกด “รันตอนนี้” อีกครั้ง
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ได้คนแล้วเท่าไร</CardTitle>
          <CardDescription>นับเฉพาะคนที่ไม่ซ้ำในงานนี้</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="เปิดดูแล้ว" value={task.assessed_total ?? 0} />
            <Stat label="ผ่านเกณฑ์" value={qualified} tone={qualified > 0 ? 'success' : undefined} />
            <Stat label="ต้องตรวจเพิ่ม" value={task.needs_review_count ?? 0} />
            <Stat label="ไม่ผ่าน" value={task.rejected_count ?? 0} />
            <Stat label="เป้า" value={target || '-'} />
          </dl>
          {target > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>ผ่านเกณฑ์เทียบกับเป้า</span>
                <span className="tabular-nums text-foreground">{qualified}/{target}</span>
              </div>
              <Progress value={pct} aria-label="ผ่านเกณฑ์เทียบกับเป้า" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>เกณฑ์การค้น</CardTitle>
          <CardDescription>
            {scheduleLabel(task.schedule_cron)}
            {task.mode === 'date_range' && task.updated_since ? ` · Resume ที่อัปเดตตั้งแต่ ${task.updated_since}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {criteria.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {criteria.map((entry) => (
                <div key={entry.label} className={entry.label === 'เนื้องาน' ? 'flex flex-col gap-0.5 sm:col-span-2' : 'flex flex-col gap-0.5'}>
                  <dt className="text-sm text-muted-foreground">{entry.label}</dt>
                  <dd className="text-sm leading-relaxed whitespace-pre-line">{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">ไม่ได้ใส่เกณฑ์เพิ่ม</p>
          )}
          {!busy && <TaskCriteriaEditor task={task} />}
          <AdjacentPlanPanel task={task} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติการรัน</CardTitle>
          <CardDescription>แต่ละรอบที่เครื่องค้นหาเข้าไปค้น ล่าสุดอยู่บนสุด</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <Empty className="border py-8">
              <EmptyHeader>
                <EmptyDescription>ยังไม่มีรอบที่รัน</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เริ่มเมื่อ</TableHead>
                  <TableHead>ค้นด้วย</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">พบ</TableHead>
                  <TableHead className="text-right">ผ่านเกณฑ์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const runError = run.status === 'failed' || run.status === 'cooldown' ? humanizeOperatorError(run.error) : null;
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">{formatBangkokDateTime(run.started_at)}</TableCell>
                      <TableCell className="max-w-64 truncate" title={runSearchTerm(run.criteria)}>
                        {runSearchTerm(run.criteria)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className={run.status === 'failed' ? 'text-destructive' : undefined}>
                            {RUN_STATUS_LABEL[run.status] ?? run.status}
                          </span>
                          {runError && <span className="text-xs text-muted-foreground">{runError.title}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{run.found}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.qualified_count}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>จัดการงาน</CardTitle>
          <CardDescription>อัปเดตล่าสุด {formatBangkokDateTime(scrapTaskUpdatedAt(task))}</CardDescription>
        </CardHeader>
        <CardFooter>
          <TaskManageActions task={task} />
        </CardFooter>
      </Card>
    </div>
  );
}
