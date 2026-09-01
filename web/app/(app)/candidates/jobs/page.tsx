import Link from 'next/link';
import { ScrapingNav } from '@/components/ScrapingNav';
import { listCandidateJobGroups } from '@/lib/repo';
import { humanizeJobFamily, operatorJobTitle } from '@/lib/operator-copy';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: 'ได้ครบเป้า', cls: 'bg-emerald-50 text-emerald-700' },
  partial: { label: 'ได้ยังไม่ครบ', cls: 'bg-amber-50 text-amber-700' },
  running: { label: 'กำลังค้นหา', cls: 'bg-blue-50 text-blue-700' },
  queued: { label: 'รอเริ่มค้นหา', cls: 'bg-blue-50 text-blue-700' },
  error: { label: 'ต้องช่วยแก้', cls: 'bg-red-50 text-red-700' },
};

function dateTime(value: string | null) {
  if (!value) return 'ยังไม่มีผลล่าสุด';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default async function CandidateJobsPage() {
  const jobs = await listCandidateJobGroups();
  return (
    <div>
      <ScrapingNav />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">ดูผลตามงานที่สั่ง</p>
          <h1 className="mt-1 text-[28px] font-medium tracking-tight">ผู้สมัครตามใบงาน</h1>
          <p className="mt-1 text-sm text-subtle">แต่ละกล่องคือหนึ่งงานค้นหา กดเข้าไปเพื่อดูผู้สมัครที่ระบบเรียงคนตรงงานที่สุดไว้ก่อน</p>
        </div>
        <Link href="/scraping" className="btn-primary">สร้างงานค้นหาใหม่</Link>
      </header>

      {jobs.length === 0 ? (
        <section className="card px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">ยังไม่มีใบงานที่ได้ผู้สมัคร</h2>
          <p className="mt-2 text-sm text-subtle">เมื่อระบบ Scrap และผูก Resume กับใบงานแล้ว กล่องของงานจะขึ้นที่หน้านี้อัตโนมัติ</p>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const target = Math.max(0, job.target_count ?? 0);
            const percent = target ? Math.min(100, Math.round((job.qualified_count / target) * 100)) : 0;
            const state = STATUS[job.status] ?? { label: job.status, cls: 'bg-black/5 text-subtle' };
            const title = operatorJobTitle({ position: job.position, title: job.name, requestNo: job.source_request_no });
            const family = humanizeJobFamily(job.job_family);
            return (
              <Link key={job.id} href={`/candidates/jobs/${job.id}`} className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-accent">{job.source_request_no || 'งานค้นหาที่สร้างเอง'}</p>
                    <h2 className="mt-1 line-clamp-2 text-lg font-semibold text-ink group-hover:text-accent">{title}</h2>
                    <p className="mt-1 truncate text-xs text-subtle">{family || `${PLATFORM[job.platform] || job.platform} · ${job.connector_label}`}</p>
                  </div>
                  <span className={`pill shrink-0 ${state.cls}`}>{state.label}</span>
                </div>

                <div className="mt-5 grid grid-cols-4 divide-x divide-line rounded-xl bg-[#f7f9fc] py-3 text-center">
                  <div><b className="block text-lg text-emerald-700">{job.qualified_count}</b><span className="text-[11px] text-subtle">ผ่าน</span></div>
                  <div><b className="block text-lg text-amber-700">{job.needs_review_count}</b><span className="text-[11px] text-subtle">ต้องตรวจ</span></div>
                  <div><b className="block text-lg text-red-700">{job.rejected_count}</b><span className="text-[11px] text-subtle">ไม่ผ่าน</span></div>
                  <div><b className="block text-lg">{job.total_count}</b><span className="text-[11px] text-subtle">พบทั้งหมด</span></div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-subtle">ผ่านเกณฑ์ {job.qualified_count}/{target || '—'} คน</span>
                    <span className="font-medium text-ink">{target ? `${percent}% ของเป้าหมาย` : 'ไม่ได้กำหนดเป้า'}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs">
                  <span className="text-subtle">ผลล่าสุด {dateTime(job.latest_matched_at)}</span>
                  <span className="font-medium text-accent">ดูคนที่เหมาะที่สุด →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
