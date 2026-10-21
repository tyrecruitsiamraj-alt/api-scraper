'use client';

import { useEffect, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import type { AutopostActivity as Activity } from '@/lib/repo';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function RunStatus({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <Badge variant="secondary">
          <Spinner data-icon="inline-start" />
          กำลังโพสต์
        </Badge>
      );
    case 'queued':
      return <Badge variant="outline">รอคิว</Badge>;
    case 'completed':
      return <Badge variant="secondary">เสร็จ</Badge>;
    case 'failed':
      return <Badge variant="destructive">ล้มเหลว</Badge>;
    case 'cancelled':
      return <Badge variant="ghost">ยกเลิก</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function LogLevel({ level }: { level: string }) {
  if (level === 'success') return <Badge variant="secondary">สำเร็จ</Badge>;
  if (level === 'warn') return <Badge variant="outline">เตือน</Badge>;
  if (level === 'error') return <Badge variant="destructive">ผิดพลาด</Badge>;
  return null;
}

function timeAgo(s: string | null): string {
  if (!s) return '—';
  const ms = Date.now() - new Date(s).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'เมื่อครู่';
  if (m < 60) return `${m} นาทีก่อน`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ก่อน`;
  return `${Math.floor(h / 24)} วันก่อน`;
}
function fmt(s: string) {
  return new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
}

export function AutopostActivity({ initial }: { initial: Activity | null }) {
  const [a, setA] = useState(initial);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/autopost-activity', { cache: 'no-store' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { activity: Activity | null };
        setA(data.activity);
      } catch {
        /* ignore */
      }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  if (!a) return null;

  // worker แตะคิวล่าสุดภายใน 5 นาที = เห็นว่ากำลังทำงานแน่ๆ (idle+ว่างจะเดาไม่ได้ จึงไม่ฟันธงว่า offline)
  const workerMs = a.worker_last_seen ? Date.now() - new Date(a.worker_last_seen).getTime() : Infinity;
  const workerActive = a.running > 0 || workerMs < 5 * 60 * 1000;
  // สถานะที่ "แย่จริง": มีงานรอคิวแต่ไม่มีอะไรมาหยิบ = worker ไม่รัน
  const jobsStuck = a.queued > 0 && a.running === 0 && workerMs > 3 * 60 * 1000;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">สถานะการโพสต์</h2>
        <span className="text-xs text-muted-foreground">อัปเดตทุก 4 วินาที</span>
        {a.running > 0 ? (
          <Badge variant="secondary">
            <Spinner data-icon="inline-start" />
            กำลังโพสต์ {a.running}
          </Badge>
        ) : jobsStuck ? (
          <Badge variant="destructive">งานค้าง Worker ยังไม่ทำงาน</Badge>
        ) : workerActive ? (
          <Badge variant="secondary">Worker ทำงานล่าสุด {timeAgo(a.worker_last_seen)}</Badge>
        ) : (
          <Badge variant="outline">ไม่มีงานในคิว</Badge>
        )}
        {a.queued > 0 && <Badge variant="outline">รอคิว {a.queued}</Badge>}
      </div>

      {jobsStuck && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>มีงาน {a.queued} รายการรออยู่ แต่ยังไม่มีเครื่องมารับงาน</AlertTitle>
          <AlertDescription>
            เปิดระบบอัตโนมัติบนเครื่องหลัก
            {a.worker_last_seen && <> (Worker แตะคิวล่าสุด {timeAgo(a.worker_last_seen)})</>}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* recent runs */}
        <Card size="sm">
          <CardHeader>
            <CardTitle>งานโพสต์ล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            {a.runs.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>ยังไม่มีงาน</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">สถานะ</TableHead>
                    <TableHead>บัญชี</TableHead>
                    <TableHead className="w-24 text-right">เวลา</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <RunStatus status={r.status} />
                      </TableCell>
                      <TableCell>
                        <div className="truncate">{r.account ?? 'ทุกบัญชี'}</div>
                        {r.error && (
                          <div className="truncate text-xs text-destructive" title={r.error}>
                            {r.error}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {timeAgo(r.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* recent logs */}
        <Card size="sm">
          <CardHeader>
            <CardTitle>บันทึกล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            {a.logs.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>ยังไม่มีบันทึก</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ScrollArea className="h-80">
                <ul className="flex flex-col gap-2 pr-3">
                  {a.logs.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(l.created_at)}</span>
                      <LogLevel level={l.level} />
                      <span
                        className={cn(
                          'min-w-0 flex-1',
                          l.level === 'error' ? 'text-destructive' : l.level === 'info' ? 'text-muted-foreground' : 'text-foreground',
                        )}
                      >
                        {l.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
