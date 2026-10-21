import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScrapingNav } from '@/components/ScrapingNav';
import { getCandidateJobGroup, listCandidateJobMatches } from '@/lib/repo';
import { reassessCandidateJobAction } from '@/lib/actions';
import { humanizeJobFamily, operatorJobTitle } from '@/lib/operator-copy';
import { ArrowLeftIcon, CheckCircle2Icon, InfoIcon, UsersIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const STATUS = {
  qualified: { label: 'ผ่านเกณฑ์', variant: 'secondary' },
  needs_review: { label: 'ต้องตรวจเพิ่ม', variant: 'outline' },
  rejected: { label: 'ไม่ผ่าน Hard Gate', variant: 'destructive' },
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
  const title = operatorJobTitle({ position: job.position, title: job.name, requestNo: job.source_request_no });
  const family = humanizeJobFamily(job.job_family);
  let qualifiedRank = 0;

  return (
    <div>
      <ScrapingNav />
      <div className="flex flex-col gap-6">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/candidates/jobs">
              <ArrowLeftIcon data-icon="inline-start" />
              กลับไปผู้สมัครตามใบงาน
            </Link>
          </Button>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{job.source_request_no || 'งานค้นหาที่สร้างเอง'}</p>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{family || `${PLATFORM[job.platform] || job.platform} · ${job.connector_label}`} · ผลล่าสุด {fmt(job.latest_matched_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={reassessCandidateJobAction}>
              <input type="hidden" name="taskId" value={job.id} />
              <Button type="submit">วิเคราะห์และเรียงใหม่</Button>
            </form>
            <Button variant="outline" asChild>
              <Link href={`/scraping/${job.id}`}>ดูสถานะงานค้นหา</Link>
            </Button>
          </div>
        </header>

        {searchParams?.rescored === '1' && (
          <Alert role="status">
            <CheckCircle2Icon />
            <AlertDescription>ประเมินผู้สมัครใหม่จาก Resume และเกณฑ์ใบงานล่าสุดแล้ว ไม่ได้ Scrap เพิ่มและไม่ใช้โควตา</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-3 sm:grid-cols-4">
          <Metric value={job.qualified_count} label="ผ่าน Hard Gate" />
          <Metric value={job.needs_review_count} label="ต้องตรวจหลักฐาน" />
          <Metric value={job.rejected_count} label="ไม่ผ่าน" />
          <Metric value={job.target_count ?? 0} label="จำนวนที่ต้องการ" />
        </section>

        <Alert>
          <InfoIcon />
          <AlertTitle>ระบบเรียงผู้สมัครอย่างไร</AlertTitle>
          <AlertDescription className="leading-relaxed">
            ระบบอ่านเกณฑ์จากใบงาน แล้วตรวจ Resume ทีละคนพร้อมหลักฐานที่เปิดดูได้ คนที่ผ่านเงื่อนไขบังคับขึ้นก่อน ตามด้วยความเหมาะสมและความครบของข้อมูล ถ้าคะแนนเท่ากัน Resume ที่อัปเดตล่าสุดขึ้นก่อน ข้อที่ Resume ไม่ได้ระบุจะขึ้นว่า “ต้องตรวจเพิ่ม” และไม่นับว่าผ่าน
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3">
          {rows.length === 0 && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
                <EmptyTitle>งานนี้ยังไม่มีผู้สมัครที่ Scrap มา</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
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
              <Card key={candidate.id}>
                <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <Avatar className="size-16">
                        {candidate.profile_asset_id && <AvatarImage src={`/api/assets/${candidate.profile_asset_id}`} alt="" />}
                        <AvatarFallback className="text-xl">{(candidate.full_name || '?').charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rank && <Badge>อันดับ {rank}</Badge>}
                          <Badge variant={state.variant}>{state.label}</Badge>
                          {candidate.viewed_at && <Badge variant="outline">เปิดอ่านแล้ว</Badge>}
                          {candidate.called_at && <Badge variant="outline">โทรแล้ว</Badge>}
                        </div>
                        <Link href={`/candidates/${candidate.id}`} className="mt-1 truncate text-lg font-semibold text-foreground hover:text-primary">{candidate.full_name || '(ไม่มีชื่อ)'}</Link>
                        <p className="text-sm text-muted-foreground">{candidate.desired_positions || candidate.matched_position || 'ไม่ระบุตำแหน่ง'} · {candidate.province || 'ไม่ระบุพื้นที่'} · {candidate.age ? `${candidate.age} ปี` : 'ไม่ระบุอายุ'}</p>
                        <p className="text-xs text-muted-foreground">พบจาก {(candidate.platforms || []).map((item) => PLATFORM[item] || item).join(', ') || 'ไม่ระบุ'} · {fmt(candidate.last_matched_at)}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <EvidenceBox title="หลักฐานที่ผ่าน" items={[...passed.map((x) => EVIDENCE[x] || x), ...softPassed.map((x) => `จุดเด่น: ${x}`)]} empty="ยังไม่มีหลักฐานที่ระบบยืนยัน" />
                      <EvidenceBox title={candidate.qualification_status === 'rejected' ? 'เหตุผลที่ไม่ผ่าน' : 'สิ่งที่ต้องตรวจเพิ่ม'} items={[...reasons, ...missing.map(humanReason), ...softMissing.map((x) => `ยังไม่พบหลักฐาน: ${x}`)]} empty="ไม่มีจุดค้างจากข้อมูลที่ตรวจได้" destructive={candidate.qualification_status === 'rejected'} />
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1 rounded-lg bg-muted/50 px-4 py-5 text-center">
                    {score == null ? (
                      <>
                        <b className="text-lg text-muted-foreground">รอประเมิน</b>
                        <span className="text-xs text-muted-foreground">หลักฐานยังไม่พอให้แสดง %</span>
                      </>
                    ) : (
                      <>
                        <b className={cn('text-4xl font-semibold', score < 60 ? 'text-destructive' : 'text-foreground')}>{score}%</b>
                        <span className="text-xs text-muted-foreground">ตรงเกณฑ์งานนี้</span>
                        <span className="text-xs text-muted-foreground">ความครบหลักฐาน {confidence}%</span>
                      </>
                    )}
                    {breakdown && (
                      <>
                        <Separator className="my-2" />
                        <dl className="flex w-full flex-col gap-1 text-left text-xs text-muted-foreground">
                          <div className="flex justify-between"><dt>ตำแหน่ง/ประสบการณ์</dt><dd className="font-medium text-foreground">{breakdown.role ?? 0}</dd></div>
                          <div className="flex justify-between"><dt>Hard Gate</dt><dd className="font-medium text-foreground">{breakdown.hard_filters ?? 0}</dd></div>
                          <div className="flex justify-between"><dt>จุดเด่นเฉพาะงาน</dt><dd className="font-medium text-foreground">{breakdown.soft_evidence ?? 0}</dd></div>
                          <div className="flex justify-between"><dt>ความครบหลักฐาน</dt><dd className="font-medium text-foreground">{breakdown.evidence_confidence ?? 0}</dd></div>
                        </dl>
                      </>
                    )}
                    <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                      <Link href={`/candidates/${candidate.id}`}>เปิด Resume และหลักฐาน</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value.toLocaleString('th-TH')}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function EvidenceBox({ title, items, empty, destructive = false }: { title: string; items: string[]; empty: string; destructive?: boolean }) {
  return (
    <Item variant="muted" className="items-start">
      <ItemContent className="gap-2">
        <ItemTitle className={cn(destructive && 'text-destructive')}>{title}</ItemTitle>
        {items.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-muted-foreground">
            {[...new Set(items)].map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </ItemContent>
    </Item>
  );
}
