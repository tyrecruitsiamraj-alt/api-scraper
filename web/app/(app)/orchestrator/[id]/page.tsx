import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { contentGenIngredients, getCampaign, getCampaignAutopostProgress, getCampaignDraftQueueState, getCampaignPostQueueState, getPosterLayoutStandardMeta, listCampaignContents, listCampaignPosts, listFacebookAccounts, soRecruitCheck } from '@/lib/repo';
import type { CampaignDraftQueueState, CampaignPostRow } from '@/lib/repo';
import { approveContentAction, rejectContentAction, editCaptionAction, editPosterAction, measureCampaignAction, reopenContentForEditingAction, retryCampaignDraftAction, runFacebookPreflightAction } from '@/lib/actions';
import { CaptionViewer } from '@/components/CaptionViewer';
import { AutopostSummaryForm } from '@/components/AutopostSummaryForm';
import { CampaignContentWorkspace } from '@/components/CampaignContentWorkspace';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ContentReviewWorkspace } from '@/components/ContentReviewWorkspaceLazy';


export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const humanText = (value: unknown) => String(value ?? '').replace(/โรงงาร/g, 'โรงงาน');

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const CONTENT_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'ร่าง (รออนุมัติ)', variant: 'outline' },
  approved: { label: 'อนุมัติแล้ว', variant: 'secondary' },
  rejected: { label: 'ตีกลับ', variant: 'destructive' },
  posted: { label: 'โพสต์แล้ว', variant: 'secondary' },
};

const VERDICT: Record<string, { label: string; variant: BadgeVariant }> = {
  high: { label: 'คนสนใจเยอะ', variant: 'secondary' },
  low: { label: 'คนสนใจน้อย ต้องทำใหม่', variant: 'destructive' },
  pending: { label: 'รอวัดผล', variant: 'outline' },
};

const STAGE_LABEL: Record<string, string> = {
  new: 'งานใหม่',
  needs_input: 'ต้องยืนยันข้อมูล',
  researching: 'กำลังหาแนวทางที่เหมาะกับงานนี้',
  drafting: 'กำลังทำ content',
  pending_approval: 'รออนุมัติ',
  approved: 'พร้อมสรุปก่อน Auto-post',
  posting: 'กำลัง Auto-post',
  measuring: 'วัดผล',
  done: 'เสร็จ',
  low_engagement: 'คนสนใจน้อย (ทำใหม่)',
};

// แถบสเตจบนหน้า detail — ไฮไลต์ว่างานนี้อยู่ช่วงไหน
const STRIP = [
  { label: 'ตรวจใบขอ' },
  { label: 'ค้นผู้สมัคร' },
  { label: 'ทำและแก้สื่อ' },
  { label: 'ตรวจสรุป' },
  { label: 'เสร็จสิ้น' },
];
const STATUS_TO_STEP: Record<string, number> = {
  new: 0,
  needs_input: 0,
  researching: 2,
  drafting: 2,
  low_engagement: 2,
  pending_approval: 2,
  approved: 3,
  posting: 3,
  measuring: 3,
  done: 4,
};

function StageStrip({ status }: { status: string }) {
  const cur = STATUS_TO_STEP[status] ?? 0;
  const lowEng = status === 'low_engagement';
  return (
    <ol className="flex min-w-[640px] items-center justify-between gap-2">
      {STRIP.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        return (
          <li key={s.label} className={cn('flex min-w-0 items-center gap-2', i < STRIP.length - 1 && 'flex-1')}>
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums',
                active && !lowEng && 'border-primary bg-primary text-primary-foreground',
                active && lowEng && 'border-destructive text-destructive',
                done && 'border-transparent bg-muted text-foreground',
                !active && !done && 'text-muted-foreground',
              )}
            >
              {done ? <CheckIcon className="size-3.5" aria-label="เสร็จแล้ว" /> : i + 1}
            </span>
            <span className={cn('whitespace-nowrap text-sm', active ? 'font-medium text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>
            {i < STRIP.length - 1 && <Separator className="min-w-5 flex-1" />}
          </li>
        );
      })}
    </ol>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(date);
}

function WorkActionCenter({ campaignId, status, statusNote, queue }: {
  campaignId: string;
  status: string;
  statusNote: string | null;
  queue: CampaignDraftQueueState | null;
}) {
  const queueState = queue?.status;
  const working = queueState === 'queued' || queueState === 'running' || ['researching', 'drafting'].includes(status);
  const needsHelp = status === 'needs_input' || queueState === 'needs_input';
  const failed = status === 'draft_error' || queueState === 'error';
  if (!working && !needsHelp && !failed) return null;

  const doing = queueState === 'queued'
    ? 'งานอยู่ในคิว รอเครื่องสร้างสื่อรับงาน'
    : status === 'researching'
      ? statusNote || 'กำลังดูคำค้นและโพสต์ที่เกี่ยวข้องก่อนสร้างสื่อ'
      : queueState === 'running' || status === 'drafting'
        ? 'กำลังเขียน Caption สร้างภาพ และตรวจข้อมูลสำคัญ'
        : needsHelp
          ? 'ระบบหยุดก่อนสร้างสื่อ เพื่อไม่ให้ข้อมูลหรือรูปผิดจากใบขอ'
          : 'ระบบสร้างสื่อไม่สำเร็จ';
  const blocker = needsHelp || failed
    ? statusNote || queue?.last_error || 'ต้องตรวจข้อมูลก่อนทำต่อ'
    : 'ไม่มี ระบบกำลังทำงาน';
  const next = needsHelp
    ? 'ลองสำรวจใหม่หลังระบบมีแหล่งสำรอง หรือกลับไปตรวจข้อมูลใบขอ'
    : failed
      ? 'ลองสร้างสื่อใหม่ ระบบจะเก็บร่างเดิมไว้และไม่โพสต์ Facebook'
      : 'ไม่ต้องกดซ้ำ หน้านี้จะอัปเดตเองเมื่อขั้นต่อไปเสร็จ';
  const queueLabel = queueState === 'queued' ? 'รอคิว' : queueState === 'running' ? 'กำลังทำ' : queueState === 'needs_input' ? 'ต้องให้ช่วย' : queueState || '—';

  return (
    <Alert role="status" aria-live="polite" variant={failed ? 'destructive' : 'default'}>
      {needsHelp || failed ? <CircleAlertIcon /> : <Spinner />}
      <AlertTitle>{needsHelp ? 'ต้องให้คนช่วยก่อนทำต่อ' : failed ? 'ระบบหยุด ต้องลองใหม่' : 'ระบบกำลังทำงาน'}</AlertTitle>
      {queue && (
        <AlertAction>
          <Badge variant="outline">{queueLabel}</Badge>
        </AlertAction>
      )}
      <AlertDescription className="flex flex-col gap-4">
        <dl className="mt-2 grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-0.5"><dt className="font-medium text-foreground">ระบบกำลังทำอะไร</dt><dd>{doing}</dd></div>
          <div className="flex flex-col gap-0.5"><dt className="font-medium text-foreground">ได้อะไรแล้ว</dt><dd>{queue?.started_at ? `Worker เริ่มงานเมื่อ ${formatTime(queue.started_at)}` : 'รับใบขอและตรวจข้อมูลเบื้องต้นแล้ว'}</dd></div>
          <div className="flex flex-col gap-0.5"><dt className="font-medium text-foreground">ติดอะไร</dt><dd>{blocker}</dd></div>
          <div className="flex flex-col gap-0.5"><dt className="font-medium text-foreground">ต้องทำอะไรต่อ</dt><dd>{next}</dd></div>
        </dl>
        {(needsHelp || failed) && (
          <div className="flex flex-wrap gap-2">
            <form action={retryCampaignDraftAction}>
              <input type="hidden" name="campaignId" value={campaignId} />
              <Button size="sm">{needsHelp ? 'สำรวจและสร้างสื่อใหม่' : 'ลองสร้างสื่อใหม่'}</Button>
            </form>
            <Button asChild variant="outline" size="sm">
              <a href="#facts">ตรวจข้อมูลใบขอ</a>
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Fact({ label, value }: { label: string; value?: unknown }) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-relaxed">{v}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

type Engagement = { likes: number; comments: number; leads: number; verdict: string; postLink: string | null };

function aggregateByContent(posts: CampaignPostRow[]): Map<string, Engagement> {
  const map = new Map<string, Engagement>();
  for (const p of posts) {
    if (!p.content_id) continue;
    const e = map.get(p.content_id) ?? { likes: 0, comments: 0, leads: 0, verdict: 'pending', postLink: null };
    e.likes += p.likes ?? 0;
    e.comments += p.comments ?? 0;
    e.leads += p.lead_count ?? 0;
    if (p.verdict === 'high') e.verdict = 'high';
    else if (p.verdict === 'low' && e.verdict !== 'high') e.verdict = 'low';
    if (!e.postLink && p.post_link) e.postLink = p.post_link;
    map.set(p.content_id, e);
  }
  return map;
}

export default async function CampaignDetail(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ contentError?: string; contentSaved?: string; standard?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  try {
    return await renderCampaignDetail({ params, searchParams });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ';
    return (
      <div className="flex flex-col gap-4 p-8">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2.5">
            <Link href="/orchestrator">
              <ArrowLeftIcon data-icon="inline-start" />
              ศูนย์งาน
            </Link>
          </Button>
        </div>
        <h1 className="text-xl font-semibold">เปิดใบงานไม่สำเร็จ</h1>
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    );
  }
}

async function renderCampaignDetail({ params, searchParams }: { params: { id: string }; searchParams?: { contentError?: string; contentSaved?: string; standard?: string } }) {
  const c = await getCampaign(params.id);
  if (!c) notFound();
  const contentError = typeof searchParams?.contentError === 'string' ? searchParams.contentError : null;
  const posterSaved = searchParams?.contentSaved === 'poster' || searchParams?.contentSaved === 'workspace';
  const standardSaved = searchParams?.standard === '1';
  const standardReset = searchParams?.contentSaved === 'standard-reset';
  const standardMeta = await getPosterLayoutStandardMeta().catch(() => ({ exists: false, updatedAt: null, updatedBy: null }));
  const snap = (c.request_snapshot ?? {}) as Record<string, any>;
  const contents = await listCampaignContents(params.id);
  const approvedContent = contents.find((item) => item.status === 'approved') ?? null;
  const readyContents = contents.filter((item) => item.status === 'draft' && item.has_image && item.image_generation_ok && item.quality_status !== 'fail');
  const recommendedContentId = readyContents[0]?.id ?? null;
  // หน้าอนุมัติควรมีตัวเลือกที่ตัดสินใจได้จริง ไม่ควรเอาร่างที่ระบบรู้อยู่แล้วว่า
  // ไม่ผ่านมาวางแข่งกัน ผู้ใช้ยังเห็นจำนวนประวัติที่ถูกคัดออกได้ด้านบน.
  const reviewContents = readyContents.length ? readyContents : contents.slice(0, 1);
  const hiddenHistoryCount = Math.max(0, contents.length - reviewContents.length);
  const fbAccounts = await listFacebookAccounts();
  const preflightAccounts = fbAccounts.filter((account) => account.group_count > 0 && account.preflight_ready);
  const publishAccounts = fbAccounts.filter((account) => account.group_count > 0 && account.preflight_verified && account.preflight_ready);
  const posts = await listCampaignPosts(params.id);
  const postQueue = await getCampaignPostQueueState(params.id);
  const draftQueue = await getCampaignDraftQueueState(params.id);
  const autopostProgress = await getCampaignAutopostProgress(params.id);
  const engByContent = aggregateByContent(posts);
  const canMeasure = ['posting', 'measuring', 'low_engagement'].includes(c.status);
  const activePostQueue = postQueue?.status === 'queued' || postQueue?.status === 'running';
  // Campaign อาจค้างสถานะ drafting จาก worker รุ่นเก่า แต่คิวจริงจบแล้ว.
  // ใช้คิวเป็น source of truth เพื่อให้ปุ่ม "ลองใหม่" ไม่หายไป.
  const activeDraftQueue = draftQueue?.status === 'queued' || draftQueue?.status === 'running';
  const regenerateBusy = activeDraftQueue || ['posting', 'measuring'].includes(c.status) || activePostQueue;
  const liveDraft = draftQueue?.status === 'queued' || draftQueue?.status === 'running' || ['researching', 'drafting'].includes(c.status);
  const pool = await soRecruitCheck(c.request_no);
  const ingredients = await contentGenIngredients(c.title);

  // ป้ายบอกว่า "ต้องทำอะไรต่อ" — คนเปิดหน้ามาแล้วรู้ทันทีว่างานค้างที่ใคร
  const NEXT_ACTION: Record<string, { text: string; variant: 'default' | 'destructive' }> = {
    drafting: { text: 'AI กำลังทำร่าง ร่างใหม่จะขึ้นด้านล่างเมื่อเสร็จ', variant: 'default' },
    pending_approval: { text: 'รอคุณตรวจร่างด้านล่าง เลือกเวอร์ชันที่จะใช้แล้วกดอนุมัติ หรือตีกลับให้ AI แก้', variant: 'default' },
    posting: { text: 'กำลังโพสต์หรือรอคิวโพสต์ เมื่อเสร็จระบบจะเก็บคอมเมนต์และวัดผลเอง', variant: 'default' },
    measuring: { text: 'รอเก็บผลตอบรับจากโพสต์ เมื่อข้อมูลพร้อมให้กด “วัดผลตอนนี้”', variant: 'default' },
    low_engagement: { text: 'คนสนใจน้อย ระบบบันทึกแนวนี้เป็น "ห้ามทำซ้ำ" และให้ AI ทำเวอร์ชันใหม่แล้ว', variant: 'destructive' },
    done: { text: 'เสร็จแล้ว ระบบเก็บแนวที่ได้ผลไว้เป็นแนวทางสำหรับงานถัดไป', variant: 'default' },
    draft_error: { text: 'สร้างประกาศไม่สำเร็จ กลับไปหน้าศูนย์งานแล้วกด “ลองสร้างประกาศใหม่”', variant: 'destructive' },
  };
  const nextAction = NEXT_ACTION[c.status];

  const focusedContent = c.status === 'pending_approval'
    ? reviewContents.find((item) => item.status === 'draft') ?? null
    : null;
  if (focusedContent) {
    const isPreview = focusedContent.gen_notes?.generation_mode === 'preview';
    const posterFields = focusedContent.poster_fields ?? {
      title: String(c.title || snap.position || snap.request_name || ''),
      badge: '',
      location: humanText(snap.location || snap.work_addr || c.province || ''),
      worktime: String(snap.work_schedule || ''),
      salaryTotal: String(snap.income || ''),
      salaryBreakdown: '',
      quantity: c.qty ? `${c.qty} อัตรา` : '',
      qualifications: [
        snap.gender ? (['o', 'all', 'any', 'a', 'ไม่จำกัด'].includes(String(snap.gender).toLowerCase()) ? 'ไม่จำกัดเพศ' : `เพศ ${snap.gender}`) : '',
        snap.age_min || snap.age_max ? `อายุ ${snap.age_min || ''}–${snap.age_max || ''} ปี` : '',
        snap.education ? `วุฒิการศึกษา ${snap.education}` : '',
      ].filter(Boolean),
      benefits: [],
      contactLine: String(snap.contact_phone || snap.phone || snap.tel || snap.mobile || snap.contact_tel || ''),
      imageSide: 'right' as const,
      logoVariant: 'people-navy' as const,
    };
    const qualityStatus = focusedContent.quality_status;
    const qualityVariant: BadgeVariant = qualityStatus === 'fail' ? 'destructive' : qualityStatus === 'pass' ? 'secondary' : 'outline';
    const qualityLabel = qualityStatus === 'fail' ? 'ยังอนุมัติไม่ได้' : qualityStatus === 'pass' ? 'สื่อพร้อมแก้ไข' : 'ควรตรวจเพิ่ม';
    return (
      <div className="flex flex-col gap-4 pb-1">
        <header className="flex flex-col gap-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href="/orchestrator">ศูนย์งาน</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{c.request_no || 'ใบงาน'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="flex flex-wrap items-center gap-x-3 text-2xl font-semibold">
              <span>{c.request_no || 'ใบงาน'}</span>
              <Separator orientation="vertical" className="h-6" />
              <span>{c.title || 'งานรับสมัคร'}</span>
            </h1>
            <div className="flex items-center gap-3">
              <Badge variant={qualityVariant}>{qualityLabel}</Badge>
              <span className="text-sm text-muted-foreground">
                Quality <span className={cn('ml-1 text-2xl font-semibold tabular-nums text-foreground', qualityStatus === 'fail' && 'text-destructive')}>{focusedContent.quality_score ?? '—'}</span>
              </span>
            </div>
          </div>
        </header>
        <Card>
          <CardContent className="overflow-x-auto">
            <StageStrip status={c.status} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-3">
          {contentError && (
            <Alert variant="destructive">
              <CircleXIcon />
              <AlertDescription>{contentError}</AlertDescription>
            </Alert>
          )}
          <ContentReviewWorkspace
            campaignId={c.id}
            content={{
              id: focusedContent.id,
              hasSourceImage: Boolean(focusedContent.has_source_image),
              qualityStatus: focusedContent.quality_status,
              qualityScore: focusedContent.quality_score,
              qualitySummary: focusedContent.quality_checks?.summary,
              qualityChecks: focusedContent.quality_checks?.checks,
              isPreview,
            }}
            initialPoster={JSON.parse(JSON.stringify(posterFields))}
            initialCaption={focusedContent.caption ?? ''}
            saved={posterSaved}
            standardSaved={standardSaved}
            hasStandard={standardMeta.exists}
            standardReset={standardReset}
          />
        </div>
      </div>
    );
  }

  const statusVariant: BadgeVariant = c.status === 'pending_approval' ? 'secondary' : c.status === 'draft_error' ? 'destructive' : 'outline';
  const subline = [c.province ? humanText(c.province) : null, c.remaining_qty != null ? `ยังขาด ${c.remaining_qty} อัตรา` : null].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-5">
      {liveDraft && <AutoRefresh seconds={6} />}
      <Card>
        <CardHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href="/orchestrator">ศูนย์งาน</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{c.request_no || 'ใบงาน'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="flex flex-wrap items-center gap-x-3 text-2xl font-semibold">
                <span>{c.request_no || 'ใบงาน'}</span>
                <Separator orientation="vertical" className="h-6" />
                <span>{c.title || 'งานรับสมัคร'}</span>
              </h1>
              {subline && <p className="text-sm text-muted-foreground">{subline}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant}>{c.status === 'pending_approval' ? 'สื่อพร้อมแก้ไข' : STAGE_LABEL[c.status] ?? c.status}</Badge>
              {recommendedContentId && (
                <span className="text-sm text-muted-foreground">
                  Quality <span className="ml-1 text-xl font-semibold tabular-nums text-foreground">{readyContents[0]?.quality_score ?? '—'}</span>
                </span>
              )}
              {canMeasure && (
                <form action={measureCampaignAction}>
                  <input type="hidden" name="campaignId" value={c.id} />
                  <Button variant="outline" size="sm">วัดผลตอนนี้</Button>
                </form>
              )}
              {!regenerateBusy && (
                <form action={retryCampaignDraftAction}>
                  <input type="hidden" name="campaignId" value={c.id} />
                  <Button variant="outline" size="sm" title="สร้างเวอร์ชันใหม่ ของเดิมยังเก็บไว้ให้เทียบ">
                    <RefreshCwIcon data-icon="inline-start" />
                    ให้ AI ทำร่างใหม่
                  </Button>
                </form>
              )}
              {regenerateBusy && ['posting', 'measuring'].includes(c.status) && (
                <span className="text-xs text-muted-foreground" title="กันไม่ให้ประกาศคนละฉบับชนกับงานที่กำลังเผยแพร่">
                  ทำร่างใหม่ได้หลังโพสต์และวัดผลเสร็จ
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto pb-1"><StageStrip status={c.status} /></div>
          <WorkActionCenter campaignId={c.id} status={c.status} statusNote={c.status_note} queue={draftQueue} />
          {nextAction && !liveDraft && c.status !== 'needs_input' && (
            <Alert role="status" variant={nextAction.variant}>
              <AlertTitle>{nextAction.text}</AlertTitle>
            </Alert>
          )}
          {contentError && (
            <Alert variant="destructive">
              <CircleXIcon />
              <AlertTitle>บันทึกรูปยังไม่สำเร็จ</AlertTitle>
              <AlertDescription>
                <p>{contentError}</p>
                <p>ข้อมูลเดิมยังอยู่ครบ ลองบันทึกอีกครั้งได้ ไม่ต้องสร้าง Content หรือโพสต์ใหม่</p>
              </AlertDescription>
            </Alert>
          )}
          {posterSaved && (
            <Alert role="status">
              <CircleCheckIcon />
              {standardSaved ? (
                <>
                  <AlertTitle>บันทึกแล้ว งานโปสเตอร์ชุดนี้ต่อไปจะจัดวางแบบนี้</AlertTitle>
                  <AlertDescription>ระบบประกอบ PNG ของร่างนี้แล้ว และจะใช้การจัดวางนี้กับงานใหม่ที่ใช้เทมเพลตเดียวกัน โดยไม่ย้ายรูปคนจากงานนี้</AlertDescription>
                </>
              ) : (
                <>
                  <AlertTitle>บันทึกรูปใหม่แล้ว</AlertTitle>
                  <AlertDescription>ระบบประกอบ PNG จากภาพต้นฉบับและตรวจข้อมูลสำคัญแล้ว มีผลเฉพาะร่างนี้</AlertDescription>
                </>
              )}
            </Alert>
          )}
          {standardReset && (
            <Alert role="status">
              <AlertTitle>กลับไปใช้แบบต้นฉบับ SO แล้ว</AlertTitle>
              <AlertDescription>งานโปสเตอร์ชุดนี้ต่อไปจะจัดวางตามเทมเพลต SO PEOPLE เดิม</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Pool pre-check: มีคนใน So Recruit สำหรับใบขอนี้หรือยัง (อ่านอย่างเดียว คนตัดสินใจเอง) */}
      <Card id="facts" size="sm">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">So Recruit</span>
            {pool === null ? (
              <span className="text-muted-foreground">เชื่อมข้อมูล So Recruit ไม่ได้ (สิทธิ์/สคีมา)</span>
            ) : !pool.found ? (
              <span className="text-muted-foreground">
                ยังไม่พบใบขอนี้ใน So Recruit (jobs.request_no ยังไม่ผูก) ถือว่ายังไม่มีคน ควรทำ content
              </span>
            ) : pool.totalAssigned > 0 ? (
              <>
                <Badge variant="secondary">มีคนแล้ว {pool.totalAssigned}</Badge>
                <span className="text-muted-foreground">อาจไม่ต้องทำ content ตรวจก่อนอนุมัติ</span>
              </>
            ) : (
              <>
                <Badge variant="outline">ยังไม่มีคนถูก assign</Badge>
                <span className="text-muted-foreground">พบงานใน So Recruit แล้ว ควรทำ content</span>
              </>
            )}
          </div>
          {pool?.found && pool.jobs.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {pool.jobs.map((j) => (
                <li key={j.id}>
                  {j.unit_name || j.location || 'งาน'} [{j.status || '—'}] · assign {j.assigned}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ข้อเท็จจริงจากใบขอ</CardTitle>
          {(snap.user_edited || snap.simulation) && (
            <CardAction className="flex flex-wrap gap-2">
              {snap.user_edited && <Badge variant="outline">มีการแก้ไขตอนรับงาน</Badge>}
              {snap.simulation && <Badge variant="destructive">DEMO ห้ามเผยแพร่</Badge>}
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="ตำแหน่ง" value={snap.position || snap.request_name || c.title} />
            <Fact label="พื้นที่/สถานที่" value={humanText(snap.location || snap.work_addr || c.province)} />
            <Fact label="รายได้" value={snap.income} />
            <Fact label="จำนวนที่รับ" value={snap.qty || c.qty} />
            <Fact label="เวลางาน" value={snap.work_schedule} />
            <Fact label="เพศ" value={snap.gender} />
            <Fact label="อายุ" value={snap.age_min || snap.age_max ? `${snap.age_min ?? ''}-${snap.age_max ?? ''} ปี` : ''} />
            <Fact label="หน่วยงาน" value={snap.unit_name || snap.site_name} />
            <Fact label="ผู้ขอ" value={snap.requested_by_name || snap.requester_name || c.created_by} />
            <div className="col-span-2 sm:col-span-3"><Fact label="หน้าที่/เหตุผลที่ขอโพส" value={snap.job_description || snap.detail || snap.reason} /></div>
            {snap.note && <div className="col-span-2 sm:col-span-3"><Fact label="หมายเหตุ" value={snap.note} /></div>}
          </dl>
        </CardContent>
      </Card>

      {c.status === 'approved' && approvedContent && (
        <Card>
          <CardHeader>
            <CardDescription>ขั้นสุดท้ายก่อนโพสต์จริง</CardDescription>
            <CardTitle>สรุปงานและเริ่ม Auto-post</CardTitle>
            <CardDescription>Content อนุมัติแล้ว ระบบยังไม่ส่งโพสต์ใดออกไปจนกว่าจะกดปุ่มด้านล่าง</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Item variant="outline">
                <ItemContent>
                  <ItemDescription>ตำแหน่ง</ItemDescription>
                  <ItemTitle>{c.title || c.request_no}</ItemTitle>
                </ItemContent>
              </Item>
              <Item variant="outline">
                <ItemContent>
                  <ItemDescription>สื่อที่อนุมัติ</ItemDescription>
                  <ItemTitle>รูป + แคปชัน เวอร์ชัน {approvedContent.version}</ItemTitle>
                </ItemContent>
              </Item>
              <Item variant="outline">
                <ItemContent>
                  <ItemDescription>สถานะ</ItemDescription>
                  <ItemTitle>รอเลือกบัญชีและกลุ่ม</ItemTitle>
                </ItemContent>
              </Item>
            </div>
            <form action={reopenContentForEditingAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="campaignId" value={c.id} />
              <input type="hidden" name="contentId" value={approvedContent.id} />
              <Button variant="secondary">
                <ArrowLeftIcon data-icon="inline-start" />
                กลับไปแก้รูปและ Caption
              </Button>
              <span className="text-xs text-muted-foreground">ใช้ได้ก่อนเริ่ม Auto-post และไม่ส่งโพสต์จริง</span>
            </form>
            {publishAccounts.length > 0 ? (
              <AutopostSummaryForm
                campaignId={c.id}
                contentId={approvedContent.id}
                accounts={publishAccounts.map((account) => ({ id: account.id, label: account.label, groupCount: account.group_count }))}
              />
            ) : (
              <Alert>
                <CircleAlertIcon />
                <AlertTitle>ยังไม่มีบัญชีที่พร้อม Auto-post</AlertTitle>
                <AlertDescription>
                  ต้องผูกเครื่อง เลือกกลุ่ม และผ่านการทดสอบแบบไม่โพสต์จริงก่อน <Link href="/settings/connectors">ไปตั้งค่า Connector</Link>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {autopostProgress && ['posting', 'measuring', 'done'].includes(c.status) && (
        <Card>
          <CardHeader>
            <CardDescription>Auto-post</CardDescription>
            <CardTitle>ความคืบหน้าการโพสต์ตามกลุ่มที่เลือก</CardTitle>
            <CardAction>
              <Badge variant="secondary">โพสต์สำเร็จ {autopostProgress.posted_groups} / {autopostProgress.selected_groups} กลุ่ม</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Progress
              aria-label="ความคืบหน้าการโพสต์"
              value={autopostProgress.selected_groups ? Math.min(100, Math.round((autopostProgress.posted_groups / autopostProgress.selected_groups) * 100)) : 0}
            />
            <p className="text-xs text-muted-foreground">บันทึกผลแล้ว {autopostProgress.attempted_groups} กลุ่ม · จำนวนเป้าหมายนับจากกลุ่มที่เลือกตอนกด Auto-post</p>
          </CardContent>
        </Card>
      )}

      {/* โปร่งใส: บอกคนตรวจว่า AI เอาอะไรมาประกอบตอนคิดร่าง — จะได้รู้ว่าต้องเช็คอะไร */}
      <Card>
        <Collapsible>
          <CardHeader>
            <CardTitle>AI ใช้ข้อมูลอะไรสร้างประกาศ</CardTitle>
            <CardDescription>ข้อมูลที่นำมาประกอบตอนสร้างร่าง</CardDescription>
            <CardAction>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="group">
                  ดูรายละเอียด
                  <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="flex flex-col gap-4 pt-4 text-sm">
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-muted-foreground">1. ข้อมูลใบขอ (ด้านบน)</div>
                <p className="leading-relaxed">ตำแหน่ง พื้นที่ รายได้ จำนวน เวลางาน ข้อมูลที่ใบขอไม่มี AI ห้ามแต่งเอง (เงินเดือนและสวัสดิการใช้คำกลางแทน)</p>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-muted-foreground">2. ร่างสองแบบให้เทียบ</div>
                <p className="leading-relaxed">A ตรงไปตรงมา: พาดหัวชัด ข้อมูลครบ กระชับ · B เน้นจุดขาย: เปิดด้วยรายได้หรือสวัสดิการ โทนชวนคุย</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">3. แนวที่เคยได้ผลดี ({ingredients.winning.length} ตัวอย่าง)</div>
                {ingredients.winning.length === 0 ? (
                  <p className="text-muted-foreground">ยังไม่มี จะสะสมเองเมื่อโพสต์ที่วัดผลแล้วได้ &quot;คนสนใจเยอะ&quot;</p>
                ) : (
                  ingredients.winning.map((w, i) => (
                    <blockquote key={i} className="border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground">
                      {w.length > 160 ? `${w.slice(0, 160)}…` : w}
                    </blockquote>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-muted-foreground">4. แนวที่ห้ามทำซ้ำ ({ingredients.losing.length} ตัวอย่าง)</div>
                {ingredients.losing.length === 0 ? (
                  <p className="text-muted-foreground">ยังไม่มี จะสะสมเองเมื่อโพสต์ที่วัดผลแล้วได้ &quot;คนสนใจน้อย&quot;</p>
                ) : (
                  ingredients.losing.map((w, i) => (
                    <blockquote key={i} className="border-l-2 border-destructive/40 pl-3 text-xs leading-relaxed text-muted-foreground">
                      {w.length > 160 ? `${w.slice(0, 160)}…` : w}
                    </blockquote>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">ตัวอย่างข้อ 3-4 เลือกจากตำแหน่งใกล้เคียงก่อน แล้วเรียงตามผลตอบรับ อัปเดตเมื่อมีผลจากโพสต์ใหม่</p>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">ร่างคอนเทนต์</h2>
        {contents.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>ยังไม่มีรูปและ Caption</EmptyTitle>
              <EmptyDescription>
                งานยังไม่ถึงขั้นสร้างร่าง ดูสถานะด้านบนว่า Worker กำลังสำรวจตลาด สร้างสื่อ รอคิว หรือมีข้อมูลที่ต้องแก้ ระบบจะไม่แสดงร่างเปล่า และไม่บอกว่างานเสร็จจนกว่าจะมีผลจริง
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {recommendedContentId && (
              <Alert role="status">
                <CircleCheckIcon />
                <AlertTitle>ร่างแนะนำ</AlertTitle>
                <AlertDescription>
                  ผ่านการตรวจข้อเท็จจริงสำคัญและมีรูปพร้อมใช้
                  {hiddenHistoryCount > 0 && ` · ซ่อนร่างเก่าหรือร่างที่ไม่ผ่านไว้ ${hiddenHistoryCount} ร่าง`}
                </AlertDescription>
              </Alert>
            )}
            {reviewContents.map((ct) => {
              const meta = CONTENT_STATUS[ct.status] ?? { label: ct.status, variant: 'outline' as const };
              const eng = engByContent.get(ct.id);
              const isPreview = ct.gen_notes?.generation_mode === 'preview';
              const posterFields = ct.poster_fields ?? {
                title: String(c.title || snap.position || snap.request_name || ''),
                badge: '',
                location: humanText(snap.location || snap.work_addr || c.province || ''),
                worktime: String(snap.work_schedule || ''),
                salaryTotal: String(snap.income || ''),
                salaryBreakdown: '',
                quantity: c.qty ? `${c.qty} อัตรา` : '',
                qualifications: [
                  snap.gender ? (['o', 'all', 'any', 'a', 'ไม่จำกัด'].includes(String(snap.gender).toLowerCase()) ? 'ไม่จำกัดเพศ' : `เพศ ${snap.gender}`) : '',
                  snap.age_min || snap.age_max ? `อายุ ${snap.age_min || ''}–${snap.age_max || ''} ปี` : '',
                  snap.education ? `วุฒิการศึกษา ${snap.education}` : '',
                ].filter(Boolean),
                benefits: [],
                contactLine: String(snap.contact_phone || snap.phone || snap.tel || snap.mobile || snap.contact_tel || ''),
                imageSide: isPreview ? 'left' as const : 'right' as const,
              };
              const verdict = eng ? VERDICT[eng.verdict] ?? VERDICT.pending : null;
              return (
                <Card key={ct.id}>
                  <CardHeader>
                    <CardTitle>
                      เวอร์ชัน {ct.version}
                      {ct.id === recommendedContentId && <span className="ml-1 font-normal text-muted-foreground">(แนะนำ)</span>}
                    </CardTitle>
                    <CardDescription>{ct.platform}</CardDescription>
                    <CardAction>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                  {isPreview && (
                    <Alert>
                      <CircleAlertIcon />
                      <AlertDescription>
                        Preview ชั่วคราวจาก Codex ใช้ตรวจรูปและแคปชันได้ แต่ระบบปิดการโพสต์ไว้จนกว่า Worker จะสร้างร่าง Production ใหม่
                      </AlertDescription>
                    </Alert>
                  )}
                  {ct.status === 'draft' ? (
                    <CampaignContentWorkspace
                      campaignId={c.id}
                      content={{
                        id: ct.id,
                        hasImage: ct.has_image,
                        hasSourceImage: ct.has_source_image,
                        imageGenerationOk: ct.image_generation_ok,
                        qualityStatus: ct.quality_status,
                        qualityScore: ct.quality_score,
                        qualitySummary: ct.quality_checks?.summary,
                        qualityChecks: ct.quality_checks?.checks,
                        isPreview,
                      }}
                      initialPoster={posterFields}
                      initialCaption={ct.caption ?? ''}
                      preflightAccounts={preflightAccounts.map((account) => ({ id: account.id, label: account.label }))}
                      posterSaved={posterSaved}
                      standardSaved={standardSaved}
                      hasStandard={standardMeta.exists}
                      standardReset={standardReset}
                    />
                  ) : (
                  <div className="grid items-start gap-5 sm:grid-cols-[180px_1fr]">
                    {ct.has_image ? (
                      // คลิกเปิดรูปเต็ม (แท็บใหม่ — ซูม/เซฟได้)
                      <a
                        href={`/api/campaign-content/${ct.id}/poster`}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block"
                        title="คลิกดูรูปเต็ม"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/campaign-content/${ct.id}/poster`}
                          alt="รูปคอนเทนต์ที่ AI สร้าง"
                          className="aspect-square w-full rounded-lg border object-cover transition-opacity group-hover:opacity-90"
                        />
                        <Badge variant="secondary" className="absolute right-1.5 bottom-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                          ดูรูปเต็ม
                        </Badge>
                      </a>
                    ) : (
                      <div className="grid aspect-square place-items-center rounded-lg bg-muted text-center text-xs text-muted-foreground">
                        ยังไม่มีรูป
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col gap-3">
                      {ct.status === 'draft' ? (
                        <form action={editCaptionAction} className="rounded-xl border p-4">
                          <input type="hidden" name="contentId" value={ct.id} />
                          <input type="hidden" name="campaignId" value={c.id} />
                          <FieldGroup>
                            <Field>
                              <div className="flex items-start justify-between gap-3">
                                <FieldLabel htmlFor={`caption-${ct.id}`}>แคปชัน</FieldLabel>
                                <Button type="reset" variant="ghost" size="sm" className="shrink-0">คืนค่าเดิม</Button>
                              </div>
                              <FieldDescription>แก้ข้อความใต้โพสต์ได้ทันที บันทึกแล้วระบบจะตรวจข้อมูลสำคัญของร่างนี้ใหม่</FieldDescription>
                              <Textarea
                                id={`caption-${ct.id}`}
                                name="caption"
                                defaultValue={ct.caption ?? ''}
                                rows={9}
                                className="min-h-48 resize-y"
                              />
                            </Field>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button variant="secondary" size="sm">บันทึกแคปชัน</Button>
                              <span className="text-xs text-muted-foreground">ยังไม่โพสต์จริงจนกว่าจะกดอนุมัติ</span>
                            </div>
                          </FieldGroup>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="text-xs text-muted-foreground">แคปชัน</div>
                          <CaptionViewer caption={ct.caption} />
                        </div>
                      )}
                      {ct.video_brief && (
                        <div className="flex flex-col gap-1">
                          <div className="text-xs text-muted-foreground">แนววิดีโอ (brief)</div>
                          <div className="text-sm leading-relaxed text-muted-foreground">{ct.video_brief}</div>
                        </div>
                      )}
                      {ct.reject_reason && <div className="text-xs text-destructive">เหตุผลที่ตีกลับ: {ct.reject_reason}</div>}

                      <Alert variant={ct.quality_status === 'fail' ? 'destructive' : 'default'}>
                        {ct.quality_status === 'fail' ? <CircleXIcon /> : ct.quality_status === 'pass' ? <CircleCheckIcon /> : <CircleAlertIcon />}
                        <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
                          <span>{ct.quality_status === 'fail' ? 'ยังอนุมัติไม่ได้' : ct.quality_status === 'pass' ? 'ข้อมูลสำคัญผ่านการตรวจ' : 'ควรตรวจเพิ่ม'}</span>
                          {ct.quality_score != null && <span className="font-normal tabular-nums">{ct.quality_score}/100</span>}
                        </AlertTitle>
                        {(ct.quality_checks?.summary || ct.quality_checks?.checks?.length) ? (
                          <AlertDescription className="flex flex-col gap-1">
                            {ct.quality_checks?.summary && <p className="text-xs">{ct.quality_checks.summary}</p>}
                            {ct.quality_checks?.checks?.length ? (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button variant="link" size="xs" className="group h-auto px-0 text-muted-foreground">
                                    ดูผลตรวจทีละข้อ
                                    <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <ul className="mt-1.5 flex flex-col gap-1 text-xs">
                                    {ct.quality_checks.checks.map((item) => (
                                      <li key={item.code} className={cn('flex items-start gap-1.5', item.status === 'fail' ? 'text-destructive' : 'text-muted-foreground')}>
                                        {item.status === 'fail'
                                          ? <XIcon className="mt-0.5 size-3.5 shrink-0" aria-label="ไม่ผ่าน" />
                                          : item.status === 'warning'
                                            ? <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-label="ควรตรวจ" />
                                            : <CheckIcon className="mt-0.5 size-3.5 shrink-0" aria-label="ผ่าน" />}
                                        <span>{item.label}: {item.message}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </CollapsibleContent>
                              </Collapsible>
                            ) : null}
                          </AlertDescription>
                        ) : null}
                      </Alert>

                      {/* provenance จริงของร่างนี้ — AI คิดจากอะไร (research + A/B + ตัวอย่างที่ใช้) */}
                      {ct.gen_notes && (ct.gen_notes.angles?.length || ct.gen_notes.hooks?.length || ct.gen_notes.imageStyle || ct.gen_notes.style) && (
                        <Collapsible className="rounded-lg border px-3 py-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="xs" className="group w-full justify-between px-0 text-muted-foreground hover:bg-transparent">
                              ประกาศนี้สร้างจากข้อมูลอะไร
                              <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed">
                              {ct.gen_notes.style && <div><span className="text-muted-foreground">แนวเขียน:</span> {ct.gen_notes.style}</div>}
                              {ct.gen_notes.angles && ct.gen_notes.angles.length > 0 && (
                                <div><span className="text-muted-foreground">แนวคิดที่เลือกใช้:</span> {ct.gen_notes.angles.join(' · ')}</div>
                              )}
                              {ct.gen_notes.hooks && ct.gen_notes.hooks.length > 0 && (
                                <div><span className="text-muted-foreground">ฮุกที่แนะนำ:</span> {ct.gen_notes.hooks.join(' | ')}</div>
                              )}
                              {ct.gen_notes.imageStyle && <div><span className="text-muted-foreground">สไตล์รูป:</span> {ct.gen_notes.imageStyle}</div>}
                              {ct.gen_notes.trends?.length ? <div><span className="text-muted-foreground">คำแนะนำจาก Google Trends:</span> {ct.gen_notes.trends.join(' · ')}</div> : null}
                              {ct.gen_notes.research_keywords?.length ? <div><span className="text-muted-foreground">คำค้นที่ Google แนะนำ:</span> {ct.gen_notes.research_keywords.join(' · ')}</div> : null}
                              <div className="text-muted-foreground">
                                อ้างอิงแนวที่ได้ผล {ct.gen_notes.used_winning ?? 0} · เรียนรู้จากงานที่เคยอนุมัติ {ct.gen_notes.used_feedback ?? 0} · เลี่ยงแนวที่ไม่ผ่าน {ct.gen_notes.used_losing ?? 0}
                                {ct.gen_notes.research_model ? ` · วิเคราะห์ด้วย ${ct.gen_notes.research_model}` : ''}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {ct.status === 'draft' && (
                        <form action={editPosterAction} className="flex flex-col gap-4 rounded-xl border p-4">
                          <input type="hidden" name="contentId" value={ct.id} />
                          <input type="hidden" name="campaignId" value={c.id} />
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-col gap-1">
                              <h3 className="text-base font-medium">ข้อความบนภาพ</h3>
                              <p className="text-xs leading-relaxed text-muted-foreground">แก้รายละเอียดแล้วกดบันทึก ระบบจะประกอบ PNG ใหม่จากภาพต้นฉบับเดิมทางซ้าย และยังไม่ส่งโพสต์จริง</p>
                            </div>
                            <Button type="reset" variant="ghost" size="sm" className="shrink-0">คืนค่าเดิม</Button>
                          </div>
                          <FieldGroup className="grid gap-4 sm:grid-cols-2">
                            <Field>
                              <FieldLabel htmlFor={`posterTitle-${ct.id}`}>ตำแหน่ง</FieldLabel>
                              <Input id={`posterTitle-${ct.id}`} name="posterTitle" required defaultValue={posterFields.title} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterBadge-${ct.id}`}>ป้ายด้านบน</FieldLabel>
                              <Input id={`posterBadge-${ct.id}`} name="posterBadge" defaultValue={posterFields.badge} />
                            </Field>
                            <Field className="sm:col-span-2">
                              <FieldLabel htmlFor={`posterLocation-${ct.id}`}>สถานที่ทำงาน</FieldLabel>
                              <Textarea id={`posterLocation-${ct.id}`} className="min-h-20 resize-y" name="posterLocation" defaultValue={posterFields.location} />
                            </Field>
                            <Field className="sm:col-span-2">
                              <FieldLabel htmlFor={`posterWorktime-${ct.id}`}>วันและเวลาทำงาน</FieldLabel>
                              <Textarea id={`posterWorktime-${ct.id}`} className="min-h-20 resize-y" name="posterWorktime" defaultValue={posterFields.worktime} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterSalaryTotal-${ct.id}`}>รายได้หลัก</FieldLabel>
                              <Input id={`posterSalaryTotal-${ct.id}`} name="posterSalaryTotal" defaultValue={posterFields.salaryTotal} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterSalaryBreakdown-${ct.id}`}>รายละเอียดรายได้เพิ่มเติม</FieldLabel>
                              <Input id={`posterSalaryBreakdown-${ct.id}`} name="posterSalaryBreakdown" defaultValue={posterFields.salaryBreakdown} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterQuantity-${ct.id}`}>จำนวนที่รับ</FieldLabel>
                              <Input id={`posterQuantity-${ct.id}`} name="posterQuantity" defaultValue={posterFields.quantity} />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterQualifications-${ct.id}`}>เพศ / อายุ / คุณสมบัติ</FieldLabel>
                              <Textarea id={`posterQualifications-${ct.id}`} className="min-h-24" name="posterQualifications" defaultValue={posterFields.qualifications.join('\n')} />
                              <FieldDescription>บรรทัดละ 1 ข้อ</FieldDescription>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterBenefits-${ct.id}`}>สวัสดิการ</FieldLabel>
                              <Textarea id={`posterBenefits-${ct.id}`} className="min-h-24" name="posterBenefits" defaultValue={posterFields.benefits.join('\n')} />
                              <FieldDescription>บรรทัดละ 1 ข้อ</FieldDescription>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterContactLine-${ct.id}`}>เบอร์โทรที่ยืนยันแล้ว</FieldLabel>
                              <Input id={`posterContactLine-${ct.id}`} name="posterContactLine" inputMode="tel" placeholder="กรอกเมื่อพร้อม เช่น 081-234-5678" defaultValue={posterFields.contactLine} />
                              <FieldDescription>เมื่อกรอก ระบบจะบันทึกเป็นข้อมูลของงานและเติมใน Caption ให้</FieldDescription>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`posterImageSide-${ct.id}`}>คนอยู่ฝั่งไหนของภาพ</FieldLabel>
                              <NativeSelect id={`posterImageSide-${ct.id}`} name="posterImageSide" defaultValue={posterFields.imageSide} className="w-full">
                                <NativeSelectOption value="right">ขวา (ข้อความอยู่ซ้าย)</NativeSelectOption>
                                <NativeSelectOption value="left">ซ้าย (ข้อความอยู่ขวา)</NativeSelectOption>
                              </NativeSelect>
                            </Field>
                          </FieldGroup>
                          <input type="hidden" name="posterLayout" value={JSON.stringify(posterFields.layout ?? {})} />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="secondary" size="sm" disabled={!ct.has_source_image}>บันทึกและประกอบรูปใหม่</Button>
                            {ct.has_source_image ? (
                              <span className="text-xs text-muted-foreground">มีภาพต้นฉบับแยกไว้แล้ว แก้ข้อความหรือตำแหน่งคนแล้วประกอบ PNG ใหม่ได้</span>
                            ) : (
                              <>
                                <span className="text-xs text-muted-foreground">ร่างนี้ยังไม่มีภาพต้นฉบับ จึงแก้บนรูปเดิมไม่ได้</span>
                                <Button formAction={retryCampaignDraftAction} variant="secondary" size="sm">ให้ AI สร้างรูปและแคปชันใหม่</Button>
                              </>
                            )}
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                  )}

                  {/* engagement ของเวอร์ชันนี้ (ถ้าเคยโพสต์+วัดผลแล้ว) */}
                  {eng && verdict && (
                    <div className="flex flex-wrap items-center gap-5 rounded-lg bg-muted/50 px-4 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground">ผลตอบรับ</span>
                      <Metric label="ไลก์" value={eng.likes} />
                      <Metric label="คอมเมนต์" value={eng.comments} />
                      <Metric label="คนทัก" value={eng.leads} />
                      <Badge variant={verdict.variant}>{verdict.label}</Badge>
                      {eng.postLink && (
                        <Button asChild variant="link" size="xs" className="px-0">
                          <a href={eng.postLink} target="_blank" rel="noreferrer">
                            เปิดโพสต์จริง
                            <ExternalLinkIcon data-icon="inline-end" />
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {posts.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          คะแนนผล = คอมเมนต์ + (คนทัก × 2) · ยอดไลก์จะขึ้นเมื่อตัวเก็บคอมเมนต์อ่าน reactions ได้ (ยังเป็นงานค้าง) · ถ้าคนสนใจน้อย AI จะทำคอนเทนต์ใหม่ให้เอง
        </p>
      )}
    </div>
  );
}
