import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import { autopostRuns } from '@/lib/repo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

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

function fmt(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

/** requested_by → ข้อความอ่านง่าย (auto-daily = รอบอัตโนมัติ 8:00, อื่น ๆ = คนสั่ง) */
function whoRequested(v: string | null): string {
  if (!v) return '—';
  if (v === 'auto-daily') return 'รอบอัตโนมัติ 8:00';
  if (v === 'orchestrator') return 'ระบบสร้างประกาศ';
  return v;
}

export default async function AutopostRunsPage() {
  const runs = await autopostRuns(80);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">รอบโพสต์ (Runs)</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          บัญชีไหนโพสต์อยู่บน Worker เครื่องไหน ใครเป็นคนสั่ง กดเข้าไปดูว่าโพสต์ลงกลุ่มไหนบ้าง
        </p>
      </div>

      {runs.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>ยังไม่มีรอบโพสต์</EmptyTitle>
            <EmptyDescription>หรือยังเชื่อมต่อฐานข้อมูล Auto-Post ไม่ได้</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>บัญชี Facebook</TableHead>
                  <TableHead>เครื่องที่ทำงาน</TableHead>
                  <TableHead>สั่งโดย</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">โพสต์สำเร็จ</TableHead>
                  <TableHead>เวลา</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">ดูรายละเอียด</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.account || r.user_id || '—'}</TableCell>
                    <TableCell>
                      {r.worker_id ? (
                        <span className="font-mono text-xs text-muted-foreground">{r.worker_id}</span>
                      ) : r.status === 'queued' && r.pinned_worker ? (
                        <span className="text-xs">
                          รอเครื่อง <span className="font-mono">{r.pinned_worker}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">ยังไม่มีเครื่องรับงาน</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{whoRequested(r.requested_by)}</TableCell>
                    <TableCell>
                      <RunStatus status={r.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.posted}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(r.started_at || r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/autopost/runs/${r.id}`}>
                          ดูโพสต์
                          <ChevronRightIcon data-icon="inline-end" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Worker รับงานโพสต์ตามลำดับจากส่วนกลาง ช่อง “สั่งโดย” บอกว่างานมาจากผู้ใช้ ระบบสร้างประกาศ หรือรอบอัตโนมัติ 8:00
      </p>
    </div>
  );
}
