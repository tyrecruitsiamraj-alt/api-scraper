import Link from 'next/link';
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { AutopostNav } from '@/components/AutopostNav';
import { PrintButton } from '@/components/PrintButton';
import { weeklyReport, type ReportMetric } from '@/lib/repo';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** เทียบสัปดาห์ก่อน (WoW) เป็น % */
function Delta({ m }: { m: ReportMetric }) {
  if (m.prev === 0 && m.value === 0) return <span className="text-xs text-muted-foreground">—</span>;
  if (m.prev === 0) return <span className="text-xs text-muted-foreground">สัปดาห์ก่อนเป็น 0</span>;
  const pct = Math.round(((m.value - m.prev) / m.prev) * 100);
  if (pct === 0) return <span className="text-xs text-muted-foreground">เท่าสัปดาห์ก่อน</span>;
  const up = pct > 0;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn('inline-flex items-center gap-0.5 font-medium', up ? 'text-foreground' : 'text-destructive')}>
        {up ? <ArrowUpIcon className="size-3" aria-label="เพิ่มขึ้น" /> : <ArrowDownIcon className="size-3" aria-label="ลดลง" />}
        {Math.abs(pct)}%
      </span>
      เทียบสัปดาห์ก่อน
    </span>
  );
}

function MetricCard({ label, m }: { label: string; m: ReportMetric }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{m.value.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent>
        <Delta m={m} />
      </CardContent>
    </Card>
  );
}

export default async function WeeklyReportPage({ searchParams }: { searchParams?: { w?: string } }) {
  const offset = Math.max(0, Math.min(52, parseInt(searchParams?.w ?? '0', 10) || 0));
  const report = await weeklyReport(offset);

  // เติมครบ 7 วันของหน้าต่าง (วันที่ไม่มีโพสต์ = 0) เพื่อให้ตารางรายวันไม่ขาดช่วง
  const days: { day: string; posts: number; leads: number; dow: number; label: string }[] = [];
  if (report) {
    const byDay = new Map(report.byDay.map((d) => [d.day, d]));
    const start = new Date(report.from);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const hit = byDay.get(key);
      days.push({
        day: key,
        posts: hit?.posts ?? 0,
        leads: hit?.leads ?? 0,
        dow: d.getDay(),
        label: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      });
    }
  }
  const maxDayLeads = Math.max(1, ...days.map((d) => d.leads));
  const maxPosLeads = report && report.byPosition.length ? Math.max(...report.byPosition.map((p) => p.leads)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">รายงานสัปดาห์</h1>
          {report && (
            <p className="text-sm text-muted-foreground">
              {fmtDate(report.from)} – {fmtDate(new Date(new Date(report.to).getTime() - 86_400_000).toISOString())}
              {offset === 0 ? ' (7 วันล่าสุด)' : ` (ย้อนหลัง ${offset} สัปดาห์)`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link href={`/autopost/report?w=${offset + 1}`}>
              <ChevronLeftIcon data-icon="inline-start" />
              สัปดาห์ก่อน
            </Link>
          </Button>
          {offset > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={offset - 1 === 0 ? '/autopost/report' : `/autopost/report?w=${offset - 1}`}>
                สัปดาห์ถัดไป
                <ChevronRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          )}
          <PrintButton />
        </div>
      </div>

      <div className="print:hidden">
        <AutopostNav />
      </div>

      {!report ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>ยังไม่มีข้อมูลรายงาน</EmptyTitle>
            <EmptyDescription>ตรวจการเชื่อมต่อฐานข้อมูล Auto-Post</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="โพสต์" m={report.posts} />
            <MetricCard label="ผู้สนใจ (เบอร์โทร)" m={report.leads} />
            <MetricCard label="ผู้สมัครที่ดึงได้" m={report.candidates} />
            <MetricCard label="แคมเปญที่โพสต์" m={report.campaigns} />
          </div>

          {/* โพสต์ & lead รายวัน */}
          <Card>
            <CardHeader>
              <CardTitle>ผลรายวัน</CardTitle>
              <CardDescription>จำนวนโพสต์และผู้สนใจในแต่ละวัน</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วัน</TableHead>
                    <TableHead className="w-1/2">
                      <span className="sr-only">สัดส่วนผู้สนใจ</span>
                    </TableHead>
                    <TableHead className="text-right">ผู้สนใจ</TableHead>
                    <TableHead className="text-right">โพสต์</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((d) => (
                    <TableRow key={d.day}>
                      <TableCell>
                        {DOW_TH[d.dow]} <span className="text-muted-foreground">{d.label}</span>
                      </TableCell>
                      <TableCell>
                        <Progress value={(d.leads / maxDayLeads) * 100} aria-label={`${d.label} ${d.leads} เบอร์`} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{d.leads}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{d.posts}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* lead ตามตำแหน่ง */}
          {report.byPosition.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>ผู้สนใจแยกตามตำแหน่ง</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ตำแหน่ง</TableHead>
                      <TableHead className="w-1/3">
                        <span className="sr-only">สัดส่วน</span>
                      </TableHead>
                      <TableHead className="text-right">เบอร์</TableHead>
                      <TableHead className="text-right">โพสต์</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byPosition.map((p) => (
                      <TableRow key={p.position}>
                        <TableCell className="max-w-56 truncate" title={p.position}>
                          {p.position}
                        </TableCell>
                        <TableCell>
                          <Progress
                            value={maxPosLeads ? (p.leads / maxPosLeads) * 100 : 0}
                            aria-label={`${p.position} ${p.leads} เบอร์`}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{p.leads}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{p.posts}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* โพสต์เด่นของสัปดาห์ */}
          {report.topPosts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>โพสต์ที่ได้เบอร์มากสุดของสัปดาห์</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ตำแหน่งและกลุ่ม</TableHead>
                      <TableHead className="text-right">เบอร์</TableHead>
                      <TableHead className="text-right">คอมเมนต์</TableHead>
                      <TableHead className="text-right">ถูกใจ</TableHead>
                      <TableHead className="text-right print:hidden">
                        <span className="sr-only">ลิงก์</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.topPosts.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="max-w-72">
                          <div className="truncate">{t.job_title || 'ไม่ระบุตำแหน่ง'}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.group_name || 'ไม่ระบุกลุ่ม'}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="tabular-nums">{t.lead_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.comment_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.reactions}</TableCell>
                        <TableCell className="text-right print:hidden">
                          {t.post_link && (
                            <Button asChild variant="ghost" size="sm">
                              <a href={t.post_link} target="_blank" rel="noreferrer">
                                ดูโพสต์
                                <ExternalLinkIcon data-icon="inline-end" />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">สร้างโดย SO Recruitment วันที่ {fmtDate(new Date().toISOString())}</p>
        </>
      )}
    </div>
  );
}
