import { dashboardStats, listProviderLimits, recentRuns } from '@/lib/repo';
import { WorkerStatus } from '@/components/WorkerStatus';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const RUN_STATUS: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  running: 'outline',
  success: 'secondary',
  partial: 'outline',
  failed: 'destructive',
  cooldown: 'outline',
};

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const p = pct(n, total);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {n.toLocaleString()} ({p}%)
        </span>
      </div>
      <Progress value={p} aria-label={label} />
    </div>
  );
}

export default async function DashboardPage() {
  const [{ totals, byPlatform, completeness }, runs, limits] = await Promise.all([
    dashboardStats(),
    recentRuns(12),
    listProviderLimits(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">ภาพรวม</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">คลังผู้สมัครและการดึงข้อมูล (Scraping)</p>
      </div>

      {/* ให้ผู้ใช้เห็นก่อนกดงานว่าเครื่อง/สิทธิ์/คิวพร้อมจริงหรือไม่ */}
      <WorkerStatus />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ผู้สมัครทั้งหมด" value={totals.candidates.toLocaleString()} />
        <Stat label="แหล่งที่มา (sources)" value={totals.sources.toLocaleString()} />
        <Stat label="ไฟล์แนบ" value={totals.assets.toLocaleString()} />
        <Stat
          label="โควต้าที่ใช้วันนี้ (รวม)"
          value={limits.reduce((a, p) => a + p.used_today, 0).toLocaleString()}
          sub={`จากเพดาน ${limits.reduce((a, p) => a + p.daily_cap, 0).toLocaleString()}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ผู้สมัครตามแพลตฟอร์ม</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {byPlatform.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>}
            {byPlatform.map((p) => (
              <Bar key={p.platform} label={PLATFORM_LABEL[p.platform] ?? p.platform} n={p.n} total={totals.candidates} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ความครบของข้อมูล</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Bar label="มีเบอร์โทร" n={completeness.with_phone} total={completeness.total} />
            <Bar label="มีอีเมล" n={completeness.with_email} total={completeness.total} />
            <Bar label="มีไฟล์แนบ" n={completeness.with_attachment} total={completeness.total} />
            <Bar label="อ่านข้อความจากไฟล์ (AI) ได้" n={completeness.extracted} total={completeness.total} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>การดึงข้อมูลล่าสุด</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เวลา</TableHead>
                <TableHead>แพลตฟอร์ม</TableHead>
                <TableHead>Connector</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">ใหม่ / อัปเดต / พลาด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    ยังไม่มีการดึงข้อมูล
                  </TableCell>
                </TableRow>
              )}
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{fmtDate(r.started_at)}</TableCell>
                  <TableCell>{PLATFORM_LABEL[r.platform] ?? r.platform}</TableCell>
                  <TableCell className="text-muted-foreground">{r.connector_label ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={RUN_STATUS[r.status] ?? 'outline'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    <span className="text-foreground">{r.new_count}</span> / {r.updated_count} /{' '}
                    <span className={cn(r.failed && 'text-destructive')}>{r.failed}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
