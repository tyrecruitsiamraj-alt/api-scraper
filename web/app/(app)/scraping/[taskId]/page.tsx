import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScrapingNav } from '@/components/ScrapingNav';
import { TaskList } from '../TaskList';
import { getTask } from '@/lib/repo';
import { operatorJobTitle } from '@/lib/operator-copy';

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
  searchParams?: { started?: string; created?: string };
}) {
  const task = await getTask(params.taskId);
  if (!task) notFound();
  const title = operatorJobTitle({ position: task.criteria?.position || task.criteria?.keyword, title: task.name, requestNo: task.source_request_no });

  return (
    <div className="space-y-5">
      <ScrapingNav />
      <Link href="/orchestrator" className="text-sm text-subtle hover:text-accent">← กลับศูนย์งาน</Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">ใบงานค้นหาผู้สมัคร</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-subtle">{task.source_request_no || 'งานค้นหาที่สร้างเอง'} · {task.platform === 'jobthai' ? 'JobThai' : task.platform === 'jobbkk' ? 'JobBKK' : task.platform} · {task.connector_label}</p>
        </div>
        <Link href={`/candidates/jobs/${task.id}`} className="btn-secondary">ดูผู้สมัครของงานนี้</Link>
      </header>

      {searchParams?.started === '1' && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">✓ รับคำสั่งแล้ว ระบบกำลังส่งงานให้เครื่องค้นหา หน้านี้จะอัปเดตความคืบหน้าเอง</div>}
      {searchParams?.created === '1' && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">✓ บันทึกงานแล้ว เมื่อต้องการเริ่ม ให้กด “รันตอนนี้” เพียงครั้งเดียว</div>}

      <TaskList initialTasks={[task]} />
    </div>
  );
}
