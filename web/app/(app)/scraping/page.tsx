import Link from 'next/link';
import { listConnectorOptions, listTasks } from '@/lib/repo';
import { NewTaskForm } from './NewTaskForm';
import { TaskList } from './TaskList';
import { ScrapingNav } from '@/components/ScrapingNav';

export const dynamic = 'force-dynamic';

export default async function ScrapingPage({ searchParams }: { searchParams?: { notice?: string } }) {
  const [connectors, tasks] = await Promise.all([listConnectorOptions(), listTasks()]);
  const readyConnectors = connectors.filter((connector) => connector.available);
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;

  return (
    <div className="space-y-6">
      <ScrapingNav />
      <div>
        <p className="eyebrow">งานค้นหาที่สร้างเอง</p>
        <h1 className="mt-1 text-[28px] font-medium tracking-tight">สร้างงานค้นหาผู้สมัคร</h1>
        <p className="mt-1 text-sm text-subtle">ใช้หน้านี้เมื่อไม่มีใบขอจากศูนย์งาน ระบบจะพาไปหน้าเฉพาะของงานทันทีหลังสั่งเริ่ม</p>
      </div>

      {notice && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}

      {readyConnectors.length === 0 ? (
        <div className="card px-5 py-12 text-center">
          <p className="text-subtle">ยังไม่มีบัญชีค้นหาผู้สมัครที่พร้อมใช้งาน — ตรวจ Connector ก่อนเริ่มงาน</p>
          <Link href="/settings/connectors" className="btn-primary mt-4 inline-flex">
            ไปหน้าบัญชีที่ใช้งาน
          </Link>
        </div>
      ) : (
        <details className="group rounded-2xl border border-line bg-white shadow-card" open>
          <summary className="cursor-pointer list-none px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">+ สร้างงานค้นหาเอง</span>
              <span className="text-xs text-subtle">บัญชีที่พร้อม {readyConnectors.length} บัญชี</span>
            </div>
            <p className="mt-1 text-xs text-subtle">กรอกรายละเอียดงานครั้งเดียว แล้วระบบวิเคราะห์คำค้นและเริ่มค้นหาให้</p>
          </summary>
          <div className="border-t border-line p-5"><NewTaskForm connectors={connectors} /></div>
        </details>
      )}

      <div>
        <h2 className="mb-1 text-base font-semibold">งานค้นหาที่กำลังทำและประวัติ</h2>
        <p className="mb-3 text-sm text-subtle">เปิดงานใดก็ได้เพื่อดูความคืบหน้า ผลผู้สมัคร และสิ่งที่ต้องทำต่อของงานนั้น</p>
        <TaskList initialTasks={tasks} />
      </div>
    </div>
  );
}
