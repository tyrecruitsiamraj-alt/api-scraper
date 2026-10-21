import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { getCandidate, recordCandidateActivity } from '@/lib/repo';
import { AttachmentViewer } from '@/components/AttachmentViewer';
import { markCandidateCalledAction, markCandidateViewedAction } from '@/lib/actions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-relaxed">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function fmtActivity(s: string | null) {
  return s ? new Date(s).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : '';
}

export default async function CandidateDetail({ params }: { params: { id: string } }) {
  const c = await getCandidate(params.id);
  if (!c) notFound();

  // Opening the profile is itself the meaningful "อ่านแล้ว" event. Keep the
  // explicit button below for corrections or a second review.
  const session = await getServerSession(authOptions);
  const actor = session?.user?.email ?? session?.user?.name ?? null;
  let viewedAt = c.viewed_at as string | null;
  let viewedBy = c.viewed_by as string | null;
  if (!viewedAt) {
    await recordCandidateActivity({ candidateId: c.id, activityType: 'viewed', actor });
    viewedAt = new Date().toISOString();
    viewedBy = actor;
  }

  // Newest successful face only — never an older superseded/merged photo.
  const profile = (c.assets ?? []).find((a: any) => (
    a.kind === 'profile' && a.download_status === 'success'
  ));

  const education: any[] = Array.isArray(c.education) ? c.education : [];
  const work: any[] = Array.isArray(c.work_experience) ? c.work_experience : [];
  const hard: string[] = Array.isArray(c.hard_skills) ? c.hard_skills : [];
  const soft: string[] = Array.isArray(c.soft_skills) ? c.soft_skills : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/candidates">
            <ArrowLeftIcon data-icon="inline-start" />
            กลับไปรายชื่อ
          </Link>
        </Button>
        <Button asChild>
          <a href={`/api/candidates/${params.id}/pdf`}>
            <DownloadIcon data-icon="inline-start" />
            ดาวน์โหลด PDF
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-start gap-5">
          <Avatar className="size-20">
            {profile && <AvatarImage src={`/api/assets/${profile.id}`} alt={c.full_name || 'profile'} />}
            <AvatarFallback className="text-2xl">{(c.first_name || c.full_name || '?').trim().charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-2xl font-semibold">{c.full_name || '(ไม่มีชื่อ)'}</h1>
            <p className="text-sm text-muted-foreground">{c.desired_positions || 'ไม่ระบุตำแหน่งที่ต้องการ'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(c.sources ?? []).map((s: any) => (
                s.source_url ? (
                  <Badge key={s.external_id} variant="outline" asChild>
                    <a href={s.source_url} target="_blank" rel="noreferrer">
                      {PLATFORM_LABEL[s.platform] ?? s.platform}
                      <ExternalLinkIcon data-icon="inline-end" />
                    </a>
                  </Badge>
                ) : (
                  <Badge key={s.external_id} variant="outline">{PLATFORM_LABEL[s.platform] ?? s.platform}</Badge>
                )
              ))}
            </div>
          </div>
          <div className="hidden flex-col items-end gap-0.5 text-sm sm:flex">
            <p className="font-medium">{c.phone || '—'}</p>
            <p className="text-muted-foreground">{c.email || ''}</p>
            {c.line_id && <p className="text-muted-foreground">LINE: {c.line_id}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สถานะการติดตาม</CardTitle>
          <CardDescription>บันทึกว่าทีมเปิดอ่าน Resume หรือโทรหาผู้สมัครแล้วหรือยัง</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={viewedAt ? 'secondary' : 'outline'}>{viewedAt ? 'เปิดอ่านแล้ว' : 'ยังไม่เปิดอ่าน'}</Badge>
            {viewedAt && <span className="text-muted-foreground">{fmtActivity(viewedAt)}{viewedBy ? ` · ${viewedBy}` : ''}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={c.called_at ? 'secondary' : 'outline'}>{c.called_at ? 'โทรแล้ว' : 'ยังไม่โทร'}</Badge>
            {c.called_at && <span className="text-muted-foreground">{fmtActivity(c.called_at)}{c.called_by ? ` · ${c.called_by}` : ''}</span>}
          </div>
          {c.latest_call_note && <p className="text-sm text-muted-foreground">บันทึกการโทรล่าสุด: {c.latest_call_note}</p>}
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <form action={markCandidateViewedAction}>
            <input type="hidden" name="candidateId" value={c.id} />
            <Button variant="outline" type="submit">{viewedAt ? 'บันทึกการอ่านอีกครั้ง' : 'บันทึกว่าอ่านแล้ว'}</Button>
          </form>
          <form action={markCandidateCalledAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="candidateId" value={c.id} />
            <FieldLabel htmlFor="call-note" className="sr-only">ผลการโทร</FieldLabel>
            <Input id="call-note" name="note" className="w-auto min-w-56" placeholder="ผลการโทร (ถ้ามี)" />
            <Button type="submit">{c.called_at ? 'บันทึกการโทรอีกครั้ง' : 'บันทึกว่าโทรแล้ว'}</Button>
          </form>
        </CardFooter>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Section title="ข้อมูลส่วนตัว">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Info label="คำนำหน้า" value={c.prefix} />
              <Info label="ชื่อ" value={c.first_name} />
              <Info label="นามสกุล" value={c.last_name} />
              <Info label="เพศ" value={c.gender} />
              <Info label="อายุ" value={c.age} />
              <Info label="วันเกิด" value={c.birth_date} />
              <Info label="จังหวัด" value={c.province} />
              <Info label="สัญชาติ" value={c.nationality} />
              <Info label="ศาสนา" value={c.religion} />
            </dl>
            <Separator className="my-4" />
            <dl>
              <Info label="ที่อยู่" value={c.address} />
            </dl>
          </Section>

          <Section title="งานที่ต้องการ">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Info label="ตำแหน่ง" value={c.desired_positions} />
              <Info label="เงินเดือนที่ต้องการ" value={c.expected_salary} />
              <Info label="พื้นที่ทำงาน" value={c.desired_work_area} />
              <Info label="ประเภทงาน" value={c.job_type} />
              <Info label="เริ่มงานได้" value={c.available_start} />
            </dl>
          </Section>

          <Section title={`การศึกษา (${education.length})`}>
            {education.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {education.map((e, i) => (
                  <li key={i} className="flex flex-col gap-0.5 border-l-2 pl-4">
                    <p className="text-sm font-medium">{e.institution || '—'}</p>
                    <p className="text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {work.map((w, i) => (
                  <li key={i} className="flex flex-col gap-0.5 border-l-2 pl-4">
                    <p className="text-sm font-medium">{w.position || '—'}{w.company ? ` — ${w.company}` : ''}</p>
                    <p className="text-sm text-muted-foreground">
                      {[w.period || w.year, w.salary && `${w.salary} บาท`, w.business_type].filter(Boolean).join(' · ')}
                    </p>
                    {w.responsibilities && (
                      <p className="mt-1 line-clamp-6 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{w.responsibilities}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-5">
          <Section title="เอกสารแนบ">
            <AttachmentViewer assets={c.assets ?? []} />
          </Section>

          {(hard.length > 0 || soft.length > 0) && (
            <Section title="ทักษะ">
              <div className="flex flex-col gap-4">
                {hard.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">Hard skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hard.map((s, i) => <Badge key={i} variant="secondary">{s}</Badge>)}
                    </div>
                  </div>
                )}
                {soft.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">Soft skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {soft.map((s, i) => <Badge key={i} variant="outline">{s}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
