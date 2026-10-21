import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScrapingNav } from '@/components/ScrapingNav';
import { TaskList } from '../TaskList';
import { getTask } from '@/lib/repo';
import { operatorJobTitle } from '@/lib/operator-copy';
import { ArrowLeftIcon, CheckIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

/**
 * Workspace เฉพาะงาน Scraping: ลิงก์จากศูนย์งาน/รายการ/ผู้สมัครต้องมาที่นี่
 * เสมอ เพื่อไม่บังคับให้เจ้าหน้าที่กลับไปหาการ์ดเดิมในหน้ารวม.
 */
export default async function ScrapeTaskDetailPage({
  params,
  searchParams,
}: {
  params: { taskId: string };
  searchParams?: { started?: string; created?: string; notice?: string };
}) {
  const task = await getTask(params.taskId);
  if (!task) notFound();
  const title = operatorJobTitle({ position: task.criteria?.position || task.criteria?.keyword, title: task.name, requestNo: task.source_request_no });
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;

  return (
    <div>
      <ScrapingNav />
      <div className="flex flex-col gap-5">
        <Button variant="ghost" size="sm" asChild className="-ml-2.5 self-start">
          <Link href="/orchestrator">
            <ArrowLeftIcon data-icon="inline-start" />
            กลับศูนย์งาน
          </Link>
        </Button>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">ใบงานค้นหาผู้สมัคร</p>
            <h1 className="text-2xl leading-snug font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{task.source_request_no || 'งานค้นหาที่สร้างเอง'} · {task.platform === 'jobthai' ? 'JobThai' : task.platform === 'jobbkk' ? 'JobBKK' : task.platform} · {task.connector_label}</p>
          </div>
          <Button variant="secondary" asChild>
            <Link href={`/candidates/jobs/${task.id}`}>ดูผู้สมัครของงานนี้</Link>
          </Button>
        </header>

        {notice && (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {searchParams?.started === '1' && (
          <Alert role="status">
            <CheckIcon />
            <AlertTitle>รับคำสั่งแล้ว</AlertTitle>
            <AlertDescription>ระบบกำลังส่งงานให้เครื่องค้นหา หน้านี้จะอัปเดตความคืบหน้าเอง</AlertDescription>
          </Alert>
        )}
        {searchParams?.created === '1' && (
          <Alert role="status">
            <CheckIcon />
            <AlertTitle>บันทึกงานแล้ว</AlertTitle>
            <AlertDescription>พร้อมเมื่อไหร่ กด “รันตอนนี้” ครั้งเดียวพอ</AlertDescription>
          </Alert>
        )}

        <TaskList initialTasks={[task]} />
      </div>
    </div>
  );
}
