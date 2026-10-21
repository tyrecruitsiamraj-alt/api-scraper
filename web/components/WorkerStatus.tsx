import { CheckIcon, ChevronDownIcon, CircleAlertIcon, XIcon } from 'lucide-react';
import { getWorkflowReadiness } from '@/lib/repo';
import { runWorkflowSelfTestAction } from '@/lib/actions';
import { WorkflowSelfTestButton } from '@/components/WorkflowSelfTestButton';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * แถบสถานะเครื่อง worker บนศูนย์งาน — แก้ปัญหา "worker ตายเงียบไม่มีใครรู้"
 * (server component: อ่าน heartbeat จาก DB ทั้งฝั่ง scraper และ autopost)
 */
export async function WorkerStatus() {
  const readiness = await getWorkflowReadiness();
  const workers = readiness.workers;
  const offline = workers.filter((w) => !w.online);
  const workerNeedsRefresh = readiness.checks.some((check) => (
    ['image_provider', 'facebook_preflight'].includes(check.code) && check.status !== 'pass'
  ));
  const badgeVariant = readiness.status === 'ready' ? 'secondary' : readiness.status === 'blocked' ? 'destructive' : 'outline';

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          ความพร้อมทั้งระบบ
          <Badge variant={badgeVariant} className="tabular-nums">{readiness.score}/100</Badge>
        </CardTitle>
        <CardDescription className="leading-relaxed">{readiness.summary}</CardDescription>
        <CardAction>
          <form action={runWorkflowSelfTestAction}>
            <WorkflowSelfTestButton />
          </form>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group/trigger -ml-2.5">
              ดูผลตรวจ {readiness.checks.length} จุด
              <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/trigger:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 grid gap-2 text-sm leading-relaxed md:grid-cols-2">
              {readiness.checks.map((check) => {
                const Icon = check.status === 'pass' ? CheckIcon : check.status === 'fail' ? XIcon : CircleAlertIcon;
                return (
                  <li
                    key={check.code}
                    className={cn(
                      'flex items-start gap-2',
                      check.status === 'pass' ? 'text-muted-foreground' : check.status === 'fail' ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    <Icon className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-medium">{check.label}</span> · {check.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
        {workerNeedsRefresh && (
          <Alert variant="destructive">
            <AlertTitle>ต้องเปิด worker ใหม่ที่เครื่อง Windows</AlertTitle>
            <AlertDescription>
              ดับเบิลคลิกไฟล์ <code>start-workers.bat</code> หนึ่งครั้ง ระบบจะหยุดบอทเก่า ดึงโค้ด <code>main</code>
              {' '}แล้วเปิด Scraper กับ AutoPost ใหม่ ถ้าดึงโค้ดไม่สำเร็จจะไม่เปิดรุ่นเก่าให้
            </AlertDescription>
          </Alert>
        )}
        {workers.length > 0 && offline.length > 0 && (
          <p className="text-sm text-muted-foreground">เครื่องออฟไลน์: {offline.map((worker) => worker.name).join(', ')}</p>
        )}
      </CardContent>
    </Card>
  );
}
