import Link from 'next/link';
import {
  autopostOverview,
  autopostActivity,
  listBestPostTimes,
  listPendingApprovalContents,
  postQueueList,
} from '@/lib/repo';
import { AutopostActivity } from '@/components/AutopostActivity';
import { AutopostNav } from '@/components/AutopostNav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DOW_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

export const dynamic = 'force-dynamic';

// โหมด Auto-Post: หน้าภาพรวมของตัวเอง (ข้อมูล Auto-Post ล้วน แยกจากภาพรวม Scraping)
function Stat({
  label,
  value,
  sub,
  progress,
}: {
  label: string;
  value: string | number;
  sub?: string;
  progress?: number;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {(sub || progress !== undefined) && (
        <CardContent className="flex flex-col gap-2">
          {progress !== undefined && <Progress value={progress} aria-label={label} />}
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      )}
    </Card>
  );
}

function QueueStatus({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <Badge variant="secondary">
        <Spinner data-icon="inline-start" />
        กำลังโพสต์
      </Badge>
    );
  }
  if (status === 'queued') return <Badge variant="outline">รอคิว</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default async function AutopostOverviewPage() {
  const [a, activity, pending, queue, bestTimes] = await Promise.all([
    autopostOverview(),
    autopostActivity(),
    listPendingApprovalContents(),
    postQueueList(),
    listBestPostTimes(3),
  ]);

  const capacityPct = a && a.capacity > 0 ? Math.min(100, Math.round((a.posts_today / a.capacity) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">ภาพรวมการโพสต์</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          งานที่รอโพสต์ ความพร้อมของระบบ และจำนวนที่แต่ละบัญชียังโพสต์ได้วันนี้
        </p>
      </div>

      <AutopostNav />

      {!a ? (
        <Alert variant="destructive">
          <AlertTitle>ยังอ่านข้อมูลการโพสต์ไม่ได้</AlertTitle>
          <AlertDescription>ตรวจว่าบริการเผยแพร่ Facebook เปิดอยู่</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="โพสต์วันนี้"
              value={`${a.posts_today.toLocaleString()} / ${a.capacity.toLocaleString()}`}
              sub={`${a.accounts} บัญชี`}
              progress={capacityPct}
            />
            <Stat
              label="บัญชีเต็มโควต้า"
              value={a.over_cap.toLocaleString()}
              sub={a.paused > 0 ? `พักชั่วคราว ${a.paused} บัญชี` : 'ทุกบัญชีพร้อมใช้งาน'}
            />
            <Stat label="ผู้สนใจวันนี้" value={a.leads_today.toLocaleString()} sub="เบอร์ที่พบในคอมเมนต์" />
            <Stat label="ผู้สนใจ 14 วัน" value={a.leads_14d.toLocaleString()} />
          </div>

          <Card size="sm">
            <CardHeader>
              <CardTitle>ช่วงเวลาโพสต์แนะนำ</CardTitle>
            </CardHeader>
            <CardContent>
              {bestTimes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bestTimes.map((t) => (
                    <Badge key={`${t.dow}-${t.hour}`} variant="secondary">
                      {DOW_TH[t.dow]} {String(t.hour).padStart(2, '0')}:00 คะแนน {t.score.toFixed(1)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  ข้อมูลยังไม่พอ ใช้ช่วงทั่วไปไปก่อน: เช้า 07-09 น. เที่ยง 12-13 น. เย็น 18-20 น. ระบบจะปรับเองเมื่อมีโพสต์สะสมมากขึ้น
                </p>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            จัดการบัญชี Facebook กลุ่มที่จะโพสต์ และเนื้อหางานได้จากเมนู “ตั้งค่า”
          </p>
        </>
      )}

      {/* Content AI ปิดแล้ว — โพสต์ใช้ caption/รูปที่คนเตรียมในหน้างานโพสต์ */}
      <Card>
        <CardHeader>
          <CardTitle>เริ่มโพสต์</CardTitle>
          <CardDescription className="leading-relaxed">
            {pending.length > 0
              ? `มีร่างเก่าค้าง ${pending.length} ใบ ระบบไม่สร้างประกาศใหม่อัตโนมัติแล้ว ให้เตรียม caption และรูปในหน้างานโพสต์`
              : 'เตรียม caption และรูป แล้วสั่งโพสต์จากหน้างานโพสต์'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/autopost/jobs">ไปงานโพสต์</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/orchestrator">ห้องค้นหาผู้สมัคร</Link>
          </Button>
        </CardContent>
      </Card>

      {/* คิวโพสต์ — worker รันตามลำดับเวลาเข้าคิว บัญชีละ 1 งานพร้อมกัน */}
      <Card>
        <CardHeader>
          <CardTitle>คิวโพสต์</CardTitle>
          <CardDescription className="leading-relaxed">
            รันตามลำดับที่เข้าคิว แต่ละบัญชีโพสต์ได้ทีละ 1 งาน เพื่อลดโอกาสโดนบล็อก
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{queue.length} งาน</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>คิวว่าง</EmptyTitle>
                <EmptyDescription>ไม่มีงานรอโพสต์</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ลำดับ</TableHead>
                  <TableHead>บัญชี</TableHead>
                  <TableHead>งาน</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
                    <TableCell>{row.account || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{row.job_title || '—'}</TableCell>
                    <TableCell>
                      <QueueStatus status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AutopostActivity initial={activity} />
    </div>
  );
}
