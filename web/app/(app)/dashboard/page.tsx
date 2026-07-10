import { dashboardStats, listProviderLimits, recentRuns } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const RUN_STATUS: Record<string, string> = {
  running: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  partial: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  cooldown: 'bg-amber-50 text-amber-700',
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
    <div className="card p-5">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const p = pct(n, total);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-subtle">
          {n.toLocaleString()} ({p}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
        <div className="h-full rounded-full bg-accent" style={{ width: `${p}%` }} />
      </div>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ภาพรวม</h1>
        <p className="mt-1 text-sm text-subtle">สถานะคลังผู้สมัครและการดึงข้อมูล (Scraping)</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ผู้สมัครทั้งหมด" value={totals.candidates.toLocaleString()} />
        <Stat label="แหล่งที่มา (sources)" value={totals.sources.toLocaleString()} />
        <Stat label="ไฟล์แนบ" value={totals.assets.toLocaleString()} />
        <Stat
          label="โควต้าวันนี้ (รวม)"
          value={limits.reduce((a, p) => a + p.used_today, 0).toLocaleString()}
          sub={`จากเพดาน ${limits.reduce((a, p) => a + p.daily_cap, 0).toLocaleString()}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* by platform */}
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold">ผู้สมัครตามแพลตฟอร์ม</h2>
          <div className="space-y-3">
            {byPlatform.length === 0 && <p className="text-sm text-subtle">ยังไม่มีข้อมูล</p>}
            {byPlatform.map((p) => (
              <Bar key={p.platform} label={PLATFORM_LABEL[p.platform] ?? p.platform} n={p.n} total={totals.candidates} />
            ))}
          </div>
        </div>

        {/* completeness */}
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold">ความครบถ้วนของข้อมูล</h2>
          <div className="space-y-3">
            <Bar label="มีเบอร์โทร" n={completeness.with_phone} total={completeness.total} />
            <Bar label="มีอีเมล" n={completeness.with_email} total={completeness.total} />
            <Bar label="มีไฟล์แนบ" n={completeness.with_attachment} total={completeness.total} />
            <Bar label="ดึงข้อความจากไฟล์ (AI) สำเร็จ" n={completeness.extracted} total={completeness.total} />
          </div>
        </div>
      </div>

      {/* recent runs */}
      <div className="card overflow-hidden">
        <h2 className="px-5 pt-5 text-base font-semibold">การดึงข้อมูลล่าสุด</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-subtle">
              <th className="px-5 py-3 font-medium">เวลา</th>
              <th className="px-5 py-3 font-medium">แพลตฟอร์ม</th>
              <th className="px-5 py-3 font-medium">Connector</th>
              <th className="px-5 py-3 font-medium">สถานะ</th>
              <th className="px-5 py-3 font-medium text-right">ใหม่ / อัปเดต / พลาด</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-subtle">
                  ยังไม่มีการดึงข้อมูล
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-hairline/60 last:border-0">
                <td className="px-5 py-3 text-subtle">{fmtDate(r.started_at)}</td>
                <td className="px-5 py-3">{PLATFORM_LABEL[r.platform] ?? r.platform}</td>
                <td className="px-5 py-3 text-subtle">{r.connector_label ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={`pill ${RUN_STATUS[r.status] ?? 'bg-black/5'}`}>{r.status}</span>
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-subtle">
                  <span className="text-green-700">{r.new_count}</span> / {r.updated_count} /{' '}
                  <span className={r.failed ? 'text-red-600' : ''}>{r.failed}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
