import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeftIcon, ExternalLinkIcon } from 'lucide-react';
import { autopostRun, autopostRunPosts } from '@/lib/repo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
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
    return new Date(v).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

function Detail({ label, value }: { label: string; value?: unknown }) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );
}

export default async function AutopostRunDetail({ params }: { params: { id: string } }) {
  const run = await autopostRun(params.id);
  if (!run) notFound();
  const posts = run.run_id ? await autopostRunPosts(run.run_id) : [];
  const posted = posts.filter((p) => p.post_link && p.post_link.trim()).length;
  const postedPct = posts.length > 0 ? Math.round((posted / posts.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/autopost/runs">
            <ChevronLeftIcon data-icon="inline-start" />
            กลับไปรอบโพสต์
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{run.account || run.user_id || 'รอบโพสต์'}</CardTitle>
          <CardDescription>
            โพสต์สำเร็จ {posted} จาก {posts.length} กลุ่ม
          </CardDescription>
          <CardAction>
            <RunStatus status={run.status} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {posts.length > 0 && <Progress value={postedPct} aria-label="สัดส่วนกลุ่มที่โพสต์สำเร็จ" />}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="เครื่องที่ทำงาน" value={run.worker_id} />
            <Detail label="สั่งโดย" value={run.requested_by === 'auto-daily' ? 'รอบอัตโนมัติ 8:00' : run.requested_by} />
            <Detail label="เริ่ม" value={fmt(run.started_at)} />
            <Detail label="เสร็จ" value={fmt(run.finished_at)} />
          </dl>
          {run.error && (
            <Alert variant="destructive">
              <AlertTitle>ข้อผิดพลาด</AlertTitle>
              <AlertDescription>{run.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>โพสต์ลงกลุ่ม</CardTitle>
          <CardDescription>รายการที่โพสต์ลง Facebook จริงในรอบนี้</CardDescription>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>ยังไม่มีบันทึกการโพสต์ของรอบนี้</EmptyTitle>
                <EmptyDescription>อาจยังโพสต์ไม่เสร็จ หรือยังไม่มีเครื่องมารับงาน</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>งาน</TableHead>
                  <TableHead>กลุ่ม Facebook</TableHead>
                  <TableHead>ผล</TableHead>
                  <TableHead className="text-right">คอมเมนต์</TableHead>
                  <TableHead>เวลา</TableHead>
                  <TableHead className="text-right">ลิงก์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((p) => {
                  const hasLink = Boolean(p.post_link && p.post_link.trim());
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.job_title || '—'}</TableCell>
                      <TableCell>{p.group_name || p.group_id || '—'}</TableCell>
                      <TableCell>
                        {hasLink ? (
                          <Badge variant="secondary">โพสต์แล้ว</Badge>
                        ) : (
                          <Badge variant="outline">ไม่มีลิงก์</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.comment_count}</TableCell>
                      <TableCell className="text-muted-foreground">{fmt(p.created_at)}</TableCell>
                      <TableCell className="text-right">
                        {hasLink ? (
                          <Button asChild variant="ghost" size="sm">
                            <a href={p.post_link!} target="_blank" rel="noreferrer">
                              เปิดโพสต์
                              <ExternalLinkIcon data-icon="inline-end" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">อาจโพสต์ไม่สำเร็จ</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
