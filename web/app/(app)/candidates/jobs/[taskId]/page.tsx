import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScrapingNav } from '@/components/ScrapingNav';
import { getCandidateJobGroup, listCandidateJobMatches } from '@/lib/repo';
import { reassessCandidateJobAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const STATUS = {
  qualified: { label: 'ผ่านเกณฑ์', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  needs_review: { label: 'ต้องตรวจเพิ่ม', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected: { label: 'ไม่ผ่าน Hard Gate', cls: 'bg-red-50 text-red-700 border-red-200' },
} as const;

const REASON: Record<string, string> = {
  wrong_job_family: 'ประสบการณ์ยังไม่ตรงสายงานนี้',
  location_mismatch: 'พื้นที่ทำงานไม่ตรงเงื่อนไข',
  education_below_minimum: 'วุฒิต่ำกว่าเกณฑ์บังคับ',
  gender_mismatch: 'ข้อมูลไม่ตรงเงื่อนไขที่ใบงานระบุ',
  age_out_of_range: 'อายุอยู่นอกช่วงที่ใบงานระบุ',
  compensation_mismatch: 'เงินเดือนที่คาดหวังเกินเงื่อนไข',
  insufficient_evidence: 'หลักฐานใน Resume ยังไม่พอ',
};

const EVIDENCE: Record<string, string> = {
  job_family: 'สายงานตรง', province: 'พื้นที่ตรง', education: 'วุฒิผ่าน', gender: 'ข้อมูลตามใบงาน',
  age_min: 'อายุผ่านขั้นต่ำ', age_max: 'อายุไม่เกินกำหนด', salary_max: 'เงินเดือนอยู่ในกรอบ',
  required_license: 'พบใบอนุญาตบังคับ', required_skill: 'พบทักษะบังคับ', identity: 'ยืนยันตัวผู้สมัครได้',
};

function humanReason(value: string) {
  if (REASON[value]) return REASON[value];
  if (value.startsWith('insufficient_evidence:')) {
    const field = value.split(':')[1] || '';
    return `ต้องตรวจหลักฐานเพิ่ม: ${EVIDENCE[field] || field.replaceAll('_', ' ')}`;
  }
  return value.replaceAll('_', ' ');
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function fmt(value: string | null) {
  return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

export default async function CandidateJobDetailPage({ params, searchParams }: { params: { taskId: string }; searchParams?: { rescored?: string } }) {
  const [job, rows] = await Promise.all([getCandidateJobGroup(params.taskId), listCandidateJobMatches(params.taskId)]);
  if (!job) notFound();
  let qualifiedRank = 0;

  return (
    <div>
      <ScrapingNav />
      <Link href="/candidates/jobs" className="text-sm text-subtle hover:text-accent">← กลับไปผู้สมัครตามใบงาน</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">{job.source_request_no || 'งานค้นหาที่สร้างเอง'}</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{job.position}</h1>
          <p className="mt-1 text-sm text-subtle">{job.job_family || `${PLATFORM[job.platform] || job.platform} · ${job.connector_label}`} · ผลล่าสุด {fmt(job.latest_matched_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={reassessCandidateJobAction}>
            <input type="hidden" name="taskId" value={job.id} />
            <button className="btn-primary">วิเคราะห์และเรียงใหม่</button>
          </form>
          <Link href="/scraping" className="btn-ghost">ดูสถานะงานค้นหา</Link>
        </div>
      </header>

      {searchParams?.rescored === '1' && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✓ ประเมินผู้สมัครจาก Resume และเกณฑ์ใบงานล่าสุดแล้ว โดยไม่ Scrap หรือใช้โควตาเพิ่ม</div>}

      <section className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric value={job.qualified_count} label="ผ่าน Hard Gate" tone="text-emerald-700" />
        <Metric value={job.needs_review_count} label="ต้องตรวจหลักฐาน" tone="text-amber-700" />
        <Metric value={job.rejected_count} label="ไม่ผ่าน" tone="text-red-700" />
        <Metric value={job.target_count ?? 0} label="จำนวนที่ต้องการ" tone="text-ink" />
      </section>

      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <b>AI ช่วยอย่างไร:</b> AI แปลงเนื้องานเป็น Candidate Spec และ Job Family ก่อน จากนั้น Scorecard `candidate-fit-v1` ตรวจ Resume ด้วยหลักฐานที่ย้อนดูได้ คนที่ผ่าน Hard Gate มาก่อน แล้วเรียงคะแนนความตรงและความครบของหลักฐานจากมากไปน้อย หากคะแนนเท่ากันจะให้ Resume ที่ระบบพบล่าสุดอยู่ก่อน ข้อมูลที่ไม่ระบุจะแสดง “ต้องตรวจเพิ่ม” และไม่นับเป็นผ่าน
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 && <div className="card py-14 text-center text-subtle">งานนี้ยังไม่มีผู้สมัครที่ Scrap มา</div>}
        {rows.map((candidate) => {
          const state = STATUS[candidate.qualification_status];
          const score = candidate.assessment_ready ? candidate.qualification_score : null;
          const evidence = candidate.qualification_evidence || {};
          const passed = textList(evidence.passed);
          const missing = textList(evidence.missing);
          const softPassed = textList(evidence.soft_passed);
          const softMissing = textList(evidence.soft_missing);
          const breakdown = evidence.score_breakdown && typeof evidence.score_breakdown === 'object'
            ? evidence.score_breakdown as Record<string, number>
            : null;
          const confidence = Number(evidence.confidence_score ?? 0) || 0;
          const reasons = (candidate.qualification_reasons || []).map(humanReason);
          const rank = candidate.qualification_status === 'qualified' ? ++qualifiedRank : null;
          return (
            <article key={candidate.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start gap-4">
                    {candidate.profile_asset_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/assets/${candidate.profile_asset_id}`} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-line object-cover" />
                    ) : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-[#082f5f] text-xl font-semibold text-white">{(candidate.full_name || '?').charAt(0)}</div>}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {rank && <span className="rounded-full bg-[#082f5f] px-2.5 py-1 text-xs font-semibold text-white">อันดับ {rank}</span>}
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${state.cls}`}>{state.label}</span>
                        {candidate.viewed_at && <span className="pill bg-black/5 text-subtle">เปิดอ่านแล้ว</span>}
                        {candidate.called_at && <span className="pill bg-blue-50 text-blue-700">โทรแล้ว</span>}
                      </div>
                      <Link href={`/candidates/${candidate.id}`} className="mt-2 block truncate text-lg font-semibold text-ink hover:text-accent">{candidate.full_name || '(ไม่มีชื่อ)'}</Link>
                      <p className="mt-1 text-sm text-subtle">{candidate.desired_positions || candidate.matched_position || 'ไม่ระบุตำแหน่ง'} · {candidate.province || 'ไม่ระบุพื้นที่'} · {candidate.age ? `${candidate.age} ปี` : 'ไม่ระบุอายุ'}</p>
                      <p className="mt-1 text-xs text-subtle">พบจาก {(candidate.platforms || []).map((item) => PLATFORM[item] || item).join(', ') || 'ไม่ระบุ'} · {fmt(candidate.last_matched_at)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <EvidenceBox title="หลักฐานที่ผ่าน" items={[...passed.map((x) => EVIDENCE[x] || x), ...softPassed.map((x) => `จุดเด่น: ${x}`)]} empty="ยังไม่มีหลักฐานที่ระบบยืนยัน" tone="green" />
                    <EvidenceBox title={candidate.qualification_status === 'rejected' ? 'เหตุผลที่ไม่ผ่าน' : 'สิ่งที่ต้องตรวจเพิ่ม'} items={[...reasons, ...missing.map(humanReason), ...softMissing.map((x) => `ยังไม่พบหลักฐาน: ${x}`)]} empty="ไม่มีจุดค้างจากข้อมูลที่ตรวจได้" tone={candidate.qualification_status === 'rejected' ? 'red' : 'amber'} />
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-[#f7f9fc] px-4 py-5 text-center">
                  {score == null ? <><b className="text-lg text-amber-700">รอประเมิน</b><span className="mt-1 text-xs text-subtle">ยังไม่มีหลักฐานพอให้แสดง %</span></> : <><b className={`text-4xl ${score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{score}%</b><span className="mt-1 text-xs text-subtle">ความตรงตามเกณฑ์งานนี้</span><span className="mt-1 text-[11px] text-subtle">ความครบหลักฐาน {confidence}%</span></>}
                  {breakdown && <div className="mt-3 w-full space-y-1 border-t border-line pt-3 text-left text-[11px] text-subtle"><div className="flex justify-between"><span>ตำแหน่ง/ประสบการณ์</span><b>{breakdown.role ?? 0}</b></div><div className="flex justify-between"><span>Hard Gate</span><b>{breakdown.hard_filters ?? 0}</b></div><div className="flex justify-between"><span>จุดเด่นเฉพาะงาน</span><b>{breakdown.soft_evidence ?? 0}</b></div><div className="flex justify-between"><span>ความครบหลักฐาน</span><b>{breakdown.evidence_confidence ?? 0}</b></div></div>}
                  <Link href={`/candidates/${candidate.id}`} className="btn-ghost mt-4 w-full text-xs">เปิด Resume และหลักฐาน</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className="rounded-xl border border-line bg-white px-4 py-4"><b className={`text-2xl ${tone}`}>{value.toLocaleString('th-TH')}</b><p className="mt-1 text-xs text-subtle">{label}</p></div>;
}

function EvidenceBox({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: 'green' | 'amber' | 'red' }) {
  const cls = tone === 'green' ? 'border-emerald-100 bg-emerald-50/60' : tone === 'red' ? 'border-red-100 bg-red-50/60' : 'border-amber-100 bg-amber-50/60';
  return <div className={`rounded-xl border px-4 py-3 ${cls}`}><h3 className="text-xs font-semibold text-ink">{title}</h3>{items.length ? <ul className="mt-2 space-y-1 text-xs text-ink/75">{[...new Set(items)].map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-subtle">{empty}</p>}</div>;
}
