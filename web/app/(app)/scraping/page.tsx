import Link from 'next/link';
import { listConnectorOptions, listTasks } from '@/lib/repo';
import { NewTaskForm } from './NewTaskForm';
import { TaskList } from './TaskList';
import { ScrapingNav } from '@/components/ScrapingNav';

export const dynamic = 'force-dynamic';

export default async function ScrapingPage() {
  const [connectors, tasks] = await Promise.all([listConnectorOptions(), listTasks()]);

  return (
    <div className="space-y-6">
      <ScrapingNav />
      <div>
        <h1 className="text-[28px] font-medium tracking-tight">สร้างงาน Scraping</h1>
        <p className="mt-1 text-sm text-subtle">สร้างงานดึงข้อมูล ตั้งเวลา หรือสั่งรันทันที พร้อมดูความคืบหน้าสด</p>
      </div>

      {connectors.length === 0 ? (
        <div className="card px-5 py-12 text-center">
          <p className="text-subtle">ยังไม่มี connector — ต้องเพิ่มบัญชีแพลตฟอร์มก่อนจึงจะสร้างงานได้</p>
          <Link href="/settings/connectors" className="btn-primary mt-4 inline-flex">
            ไปหน้า Connector
          </Link>
        </div>
      ) : (
        <NewTaskForm connectors={connectors} />
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold">งานทั้งหมด</h2>
        <TaskList initialTasks={tasks} />
      </div>
    </div>
  );
}
