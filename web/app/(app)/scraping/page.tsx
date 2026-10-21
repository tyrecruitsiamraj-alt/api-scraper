import Link from 'next/link';
import { ChevronDownIcon } from 'lucide-react';
import { listConnectorOptions, listTasks } from '@/lib/repo';
import { NewTaskForm } from './NewTaskForm';
import { TaskList } from './TaskList';
import { ScrapingNav } from '@/components/ScrapingNav';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

export default async function ScrapingPage({ searchParams }: { searchParams?: { notice?: string } }) {
  const [connectors, tasks] = await Promise.all([listConnectorOptions(), listTasks()]);
  const readyConnectors = connectors.filter((connector) => connector.available);
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;

  return (
    <div>
      <ScrapingNav />
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">งานค้นหาที่สร้างเอง</p>
          <h1 className="text-2xl leading-snug font-semibold">สร้างงานค้นหาผู้สมัคร</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            ใช้หน้านี้เมื่อไม่มีใบขอเข้ามาที่ศูนย์งาน พอสั่งเริ่มแล้วระบบจะพาไปหน้าของงานนั้นเลย
          </p>
        </header>

        {notice && (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {readyConnectors.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ยังไม่มีบัญชีค้นหาที่พร้อมใช้</EmptyTitle>
              <EmptyDescription>ตรวจ Connector ก่อนเริ่มงาน</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/settings/connectors">ไปหน้าบัญชีที่ใช้งาน</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Collapsible defaultOpen asChild>
            <Card>
              <CardHeader>
                <CardTitle>สร้างงานค้นหาเอง</CardTitle>
                <CardDescription className="leading-relaxed">
                  วางรายละเอียดงานครั้งเดียว ระบบจะหาคำค้นและตำแหน่งที่ตรงกัน แล้วเก็บ Resume ที่ไม่ซ้ำจนครบจำนวน
                  (บัญชีที่พร้อม {readyConnectors.length} บัญชี)
                </CardDescription>
                <CardAction>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="group/trigger" aria-label="ย่อหรือขยายฟอร์ม">
                      <ChevronDownIcon className="transition-transform group-data-[state=open]/trigger:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                </CardAction>
              </CardHeader>
              <CollapsibleContent forceMount className="data-[state=closed]:hidden">
                <CardContent>
                  <NewTaskForm connectors={connectors} />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">งานค้นหาที่กำลังทำและประวัติ</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">เปิดงานเพื่อดูความคืบหน้า ผู้สมัครที่ได้ และสิ่งที่ต้องทำต่อ</p>
          </div>
          <TaskList initialTasks={tasks} />
        </section>
      </div>
    </div>
  );
}
