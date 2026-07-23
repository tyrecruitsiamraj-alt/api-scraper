import Link from 'next/link';
import { AutopostNav } from '@/components/AutopostNav';
import { PrintButton } from '@/components/PrintButton';
import { weeklyReport, type ReportMetric } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** ป้าย WoW: ▲/▼ % เทียบสัปดาห์ก่อน */
function Delta({ m }: { m: ReportMetric }) {
  if (m.prev === 0 && m.value === 0) return <span className="text-xs text-subtle">—</span>;
  if (m.prev === 0) return <span className="text-xs font-medium text-emerald-600">ใหม่</span>;
  const pct = Math.round(((m.value - m.prev) / m.prev) * 100);
  if (pct === 0) return <span className="text-xs text-subtle">เท่าเดิม</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% <span className="text-subtle">เทียบสัปดาห์ก่อน</span>
    </span>
  );
}

function MetricCard({ label, m, accent }: { label: string; m: ReportMetric; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-subtle">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${accent ? 'text-accent' : ''}`}>
        {m.value.toLocaleString()}
      </div>
      <div className="mt-1">
        <Delta m={m} />
      </div>
    </div>
  );
}

export default async function WeeklyReportPage({ searchParams }: { searchParams?: { w?: string } }) {
  const offset = Math.max(0, Math.min(52, parseInt(searchParams?.w ?? '0', 10) || 0));
  const report = await weeklyReport(offset);

  // เติมครบ 7 วันของหน้าต่าง (วันที่ไม่มีโพสต์ = 0) เพื่อกราฟแท่งไม่ขาดช่วง
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">รายงานสัปดาห์</h1>
          {report && (
            <p className="mt-1 text-sm text-subtle">
              {fmtDate(report.from)} – {fmtDate(new Date(new Date(report.to).getTime() - 86_400_000).toISOString())}
              {offset === 0 ? ' · 7 วันล่าสุด' : ` · ย้อนหลัง ${offset} สัปดาห์`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <Link
            href={`/autopost/report?w=${offset + 1}`}
            className="btn-sm rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition hover:border-accent/40 hover:text-accent"
          >
            ← สัปดาห์ก่อน
          </Link>
          {offset > 0 && (
            <Link
              href={offset - 1 === 0 ? '/autopost/report' : `/autopost/report?w=${offset - 1}`}
              className="btn-sm rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition hover:border-accent/40 hover:text-accent"
            >
              สัปดาห์ถัดไป →
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      <div className="print:hidden">
        <AutopostNav />
      </div>

      {!report ? (
        <div className="card px-5 py-10 text-center text-sm text-subtle">
          ยังไม่มีข้อมูลรายงาน — ตรวจสอบการเชื่อมต่อฐานข้อมูล Auto-Post
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="โพสต์" m={report.posts} />
            <MetricCard label="Lead (เบอร์)" m={report.leads} accent />
            <MetricCard label="ผู้สมัครที่ดึงได้" m={report.candidates} />
            <MetricCard label="แคมเปญที่โพสต์" m={report.campaigns} />
          </div>

          {/* โพสต์ & lead รายวัน */}
          <div>
            <h2 className="mb-3 text-base font-semibold">รายวัน (โพสต์ &amp; Lead)</h2>
            <div className="card p-4">
              <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
                {days.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.posts} โพสต์ · ${d.leads} เบอร์`}>
                    <span className="text-[11px] font-medium tabular-nums text-ink">{d.leads || ''}</span>
                    <div
                      className="w-full max-w-[36px] rounded-t bg-accent"
                      style={{ height: `${Math.round((d.leads / maxDayLeads) * 96)}px`, minHeight: d.leads ? 3 : 0 }}
                    />
                    <span className="mt-1 text-[10px] text-subtle">{DOW_TH[d.dow]}</span>
                    <span className="text-[10px] tabular-nums text-subtle">{d.posts}<span className="opacity-60">p</span></span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-subtle">แท่ง = จำนวน Lead ต่อวัน · ตัวเลขล่าง (p) = จำนวนโพสต์</p>
            </div>
          </div>

          {/* lead ตามตำแหน่ง */}
          {report.byPosition.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold">Lead ตามตำแหน่ง</h2>
              <div className="card divide-y divide-hairline">
                {report.byPosition.map((p) => (
                  <div key={p.position} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-40 shrink-0 truncate text-sm text-ink sm:w-56" title={p.position}>{p.position}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${maxPosLeads ? Math.max(4, (p.leads / maxPosLeads) * 100) : 0}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs text-subtle">
                      <span className="font-semibold tabular-nums text-ink">{p.leads}</span> เบอร์ · {p.posts} โพสต์
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* โพสต์เด่นของสัปดาห์ */}
          {report.topPosts.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold">โพสต์เด่นของสัปดาห์</h2>
              <div className="card divide-y divide-hairline">
                {report.topPosts.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="pill shrink-0 bg-accent/10 text-accent">{t.lead_count}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{t.job_title || 'ไม่ระบุตำแหน่ง'}</div>
                      <div className="truncate text-[11px] text-subtle">{t.group_name || 'ไม่ระบุกลุ่ม'}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-subtle">💬 {t.comment_count} · 👍 {t.reactions}</span>
                    {t.post_link && (
                      <a href={t.post_link} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] font-medium text-accent hover:underline print:hidden">
                        ดูโพสต์
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-subtle">สร้างโดย SO Recruitment · {fmtDate(new Date().toISOString())}</p>
        </>
      )}
    </div>
  );
}
