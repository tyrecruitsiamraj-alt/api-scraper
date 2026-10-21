import Link from 'next/link';
import { ArrowRightIcon, ClipboardListIcon } from 'lucide-react';
import { ScrapingNav } from '@/components/ScrapingNav';
import { listCandidateJobGroups } from '@/lib/repo';
import { humanizeJobFamily, operatorJobTitle } from '@/lib/operator-copy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';

export const dynamic = 'force-dynamic';

type BadgeVariant = 'secondary' | 'outline' | 'destructive';

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  done: { label: 'ได้ครบเป้า', variant: 'secondary' },
  partial: { label: 'ได้ยังไม่ครบ', variant: 'outline' },
  running: { label: 'กำลังค้นหา', variant: 'outline' },
  queued: { label: 'รอเริ่มค้นหา', variant: 'outline' },
  error: { label: 'ต้องช่วยแก้', variant: 'destructive' },
};

function dateTime(value: string | null) {
  if (!value) return 'ยังไม่มีผลล่าสุด';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default async function CandidateJobsPage() {
  const jobs = await listCandidateJobGroups();
  return (
    <div>
      <ScrapingNav />
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">ดูผลตามงานที่สั่ง</p>
            <h1 className="text-2xl font-semibold">ผู้สมัครตามใบงาน</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">หนึ่งการ์ดต่อหนึ่งงานค้นหา กดเข้าไปดูผู้สมัคร คนที่ตรงงานที่สุดจะอยู่บนสุด</p>
          </div>
          <Button asChild>
            <Link href="/scraping">สร้างงานค้นหาใหม่</Link>
          </Button>
        </header>

        {jobs.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia>
              <EmptyTitle>ยังไม่มีใบงานที่ได้ผู้สมัคร</EmptyTitle>
              <EmptyDescription>เมื่อ Scrap แล้วผูก Resume กับใบงานได้ งานจะขึ้นที่หน้านี้เอง</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" asChild>
                <Link href="/scraping">สร้างงานค้นหาใหม่</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
              const target = Math.max(0, job.target_count ?? 0);
              const percent = target ? Math.min(100, Math.round((job.qualified_count / target) * 100)) : 0;
              const state = STATUS[job.status] ?? { label: job.status, variant: 'outline' as const };
              const title = operatorJobTitle({ position: job.position, title: job.name, requestNo: job.source_request_no });
              const family = humanizeJobFamily(job.job_family);
              return (
                <Link
                  key={job.id}
                  href={`/candidates/jobs/${job.id}`}
                  className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card className="h-full transition-colors group-hover:bg-muted/40">
                    <CardHeader>
                      <CardDescription>{job.source_request_no || 'งานค้นหาที่สร้างเอง'}</CardDescription>
                      <CardTitle className="line-clamp-2">{title}</CardTitle>
                      <CardDescription className="truncate">{family || `${PLATFORM[job.platform] || job.platform} · ${job.connector_label}`}</CardDescription>
                      <CardAction>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </CardAction>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-4">
                      <dl className="grid grid-cols-4 divide-x rounded-lg bg-muted/50 py-3 text-center">
                        <div className="flex flex-col-reverse gap-0.5"><dt className="text-xs text-muted-foreground">ผ่าน</dt><dd className="text-lg font-semibold">{job.qualified_count}</dd></div>
                        <div className="flex flex-col-reverse gap-0.5"><dt className="text-xs text-muted-foreground">ต้องตรวจ</dt><dd className="text-lg font-semibold">{job.needs_review_count}</dd></div>
                        <div className="flex flex-col-reverse gap-0.5"><dt className="text-xs text-muted-foreground">ไม่ผ่าน</dt><dd className="text-lg font-semibold">{job.rejected_count}</dd></div>
                        <div className="flex flex-col-reverse gap-0.5"><dt className="text-xs text-muted-foreground">พบทั้งหมด</dt><dd className="text-lg font-semibold">{job.total_count}</dd></div>
                      </dl>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">ผ่านเกณฑ์ {job.qualified_count}/{target || '—'} คน</span>
                          <span className="font-medium">{target ? `${percent}% ของเป้า` : 'ไม่ได้กำหนดเป้า'}</span>
                        </div>
                        <Progress value={percent} aria-label="ความคืบหน้าเทียบเป้า" />
                      </div>
                    </CardContent>

                    <CardFooter className="mt-auto justify-between text-xs">
                      <span className="text-muted-foreground">ผลล่าสุด {dateTime(job.latest_matched_at)}</span>
                      <span className="flex items-center gap-1 font-medium text-primary">
                        ดูผู้สมัคร
                        <ArrowRightIcon className="size-3.5" />
                      </span>
                    </CardFooter>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
