import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCandidate } from '@/lib/repo';
import { AttachmentViewer } from '@/components/AttachmentViewer';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="text-sm mt-0.5">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-sm font-semibold text-subtle mb-4 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

export default async function CandidateDetail({ params }: { params: { id: string } }) {
  const c = await getCandidate(params.id);
  if (!c) notFound();

  const profile = (c.assets ?? []).find((a: any) => a.kind === 'profile');

  const education: any[] = Array.isArray(c.education) ? c.education : [];
  const work: any[] = Array.isArray(c.work_experience) ? c.work_experience : [];
  const hard: string[] = Array.isArray(c.hard_skills) ? c.hard_skills : [];
  const soft: string[] = Array.isArray(c.soft_skills) ? c.soft_skills : [];

  return (
    <div>
      <Link href="/candidates" className="text-sm text-subtle hover:text-accent">← กลับไปรายชื่อ</Link>

      <div className="card mt-3 mb-6 p-7 flex items-start gap-5">
        {profile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${profile.id}`}
            alt={c.full_name || 'profile'}
            className="h-20 w-20 shrink-0 rounded-2xl border border-hairline object-cover"
          />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-ink text-white text-2xl">
            {(c.first_name || c.full_name || '?').trim().charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{c.full_name || '(ไม่มีชื่อ)'}</h1>
          <p className="text-sm text-subtle mt-1">{c.desired_positions || 'ไม่ระบุตำแหน่งที่ต้องการ'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(c.sources ?? []).map((s: any) => (
              <span key={s.external_id} className="pill bg-black/5">
                {PLATFORM_LABEL[s.platform] ?? s.platform}
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">↗</a>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className="hidden sm:block text-right text-sm">
          <p className="font-medium">{c.phone || '—'}</p>
          <p className="text-subtle">{c.email || ''}</p>
          {c.line_id && <p className="text-subtle">LINE: {c.line_id}</p>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Section title="ข้อมูลส่วนตัว">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="คำนำหน้า" value={c.prefix} />
              <Field label="ชื่อ" value={c.first_name} />
              <Field label="นามสกุล" value={c.last_name} />
              <Field label="เพศ" value={c.gender} />
              <Field label="อายุ" value={c.age} />
              <Field label="วันเกิด" value={c.birth_date} />
              <Field label="จังหวัด" value={c.province} />
              <Field label="สัญชาติ" value={c.nationality} />
              <Field label="ศาสนา" value={c.religion} />
            </dl>
            <div className="mt-4 border-t border-hairline pt-4">
              <Field label="ที่อยู่" value={c.address} />
            </div>
          </Section>

          <Section title="งานที่ต้องการ">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="ตำแหน่ง" value={c.desired_positions} />
              <Field label="เงินเดือนที่ต้องการ" value={c.expected_salary} />
              <Field label="พื้นที่ทำงาน" value={c.desired_work_area} />
              <Field label="ประเภทงาน" value={c.job_type} />
              <Field label="เริ่มงานได้" value={c.available_start} />
            </dl>
          </Section>

          <Section title={`การศึกษา (${education.length})`}>
            {education.length === 0 ? (
              <p className="text-sm text-subtle">—</p>
            ) : (
              <ul className="space-y-3">
                {education.map((e, i) => (
                  <li key={i} className="border-l-2 border-hairline pl-4">
                    <p className="text-sm font-medium">{e.institution || '—'}</p>
                    <p className="text-xs text-subtle mt-0.5">
                      {[e.degree, e.faculty, e.major].filter(Boolean).join(' · ')}
                      {e.gpa ? ` · GPA ${e.gpa}` : ''}
                      {e.graduation_year ? ` · ${e.graduation_year}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`ประสบการณ์ทำงาน (${work.length})`}>
            {work.length === 0 ? (
              <p className="text-sm text-subtle">—</p>
            ) : (
              <ul className="space-y-4">
                {work.map((w, i) => (
                  <li key={i} className="border-l-2 border-hairline pl-4">
                    <p className="text-sm font-medium">{w.position || '—'}{w.company ? ` — ${w.company}` : ''}</p>
                    <p className="text-xs text-subtle mt-0.5">
                      {[w.period || w.year, w.salary && `${w.salary} บาท`, w.business_type].filter(Boolean).join(' · ')}
                    </p>
                    {w.responsibilities && (
                      <p className="text-xs text-ink/70 mt-1.5 whitespace-pre-line line-clamp-6">{w.responsibilities}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="เอกสารแนบ">
            <AttachmentViewer assets={c.assets ?? []} />
          </Section>

          {(hard.length > 0 || soft.length > 0) && (
            <Section title="ทักษะ">
              {hard.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-subtle mb-2">Hard skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hard.map((s, i) => <span key={i} className="pill bg-accent/10 text-accent">{s}</span>)}
                  </div>
                </div>
              )}
              {soft.length > 0 && (
                <div>
                  <p className="text-xs text-subtle mb-2">Soft skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {soft.map((s, i) => <span key={i} className="pill bg-black/5">{s}</span>)}
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
