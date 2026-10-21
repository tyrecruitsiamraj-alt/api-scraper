import Link from 'next/link';
import { listConnectorOptions } from '@/lib/repo';
import { NewTaskForm } from '../NewTaskForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

export default async function NewScrapTaskPage(props: { searchParams?: Promise<{ notice?: string }> }) {
  const searchParams = await props.searchParams;
  const connectors = await listConnectorOptions();
  const readyConnectors = connectors.filter((connector) => connector.available);
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/scraping">งาน Scrap</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>สร้างงานค้นหาเอง</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-snug font-semibold">สร้างงานค้นหาเอง</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          ใช้เมื่อไม่มีคำขอจาก Jarvis กดเริ่มแล้วระบบจะพาไปหน้าของงานนั้น
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
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงาน</CardTitle>
            <CardDescription className="leading-relaxed">
              วางรายละเอียดงานครั้งเดียว ระบบจะหาคำค้นและตำแหน่งที่ตรงกัน แล้วเก็บ Resume ที่ไม่ซ้ำจนครบจำนวน
              (บัญชีที่พร้อม {readyConnectors.length} บัญชี)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewTaskForm connectors={connectors} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
