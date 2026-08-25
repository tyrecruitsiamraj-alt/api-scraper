import {
  listSoRecruitPostingRequests,
  listCampaigns,
  listPendingApprovalContents,
  listFacebookAccounts,
  listConnectorOptions,
  listTasks,
  listCampaignPostQueueStates,
  listCampaignPendingAdminCounts,
  getContentBrainSummary,
} from '@/lib/repo';
import { AutoRefresh } from '@/components/AutoRefresh';
import { WorkerStatus } from '@/components/WorkerStatus';
import { WorkCenter, type WorkCenterItem, type WorkCenterStage, type Step } from '@/components/WorkCenter';

export const dynamic = 'force-dynamic';

const STATUS_TH: Record<string, string> = {
  new: 'เพิ่งเริ่ม',
  needs_input: 'ต้องยืนยันข้อมูล',
  researching: 'สำรวจแนว',
  drafting: 'AI กำลังคิด',
  draft_error: 'สร้างประกาศไม่สำเร็จ',
  low_engagement: 'คนสนใจน้อย — คิดใหม่',
  pending_approval: 'รอตรวจ',
  approved: 'รอสรุปก่อน Auto-post',
  posting: 'กำลังโพสต์',
  measuring: 'วัดผล',
  done: 'เสร็จ',
};

// เส้นทางงาน 6 ป้ายเดียวกันทุกงาน — งานไหนไม่ใช้ขั้นไหน = 'skip' (วิ่งทะลุผ่านให้เห็น)
const STEP_LABELS = ['รับงาน', 'เตรียมงาน', 'ตรวจงาน', 'หาผู้สมัคร', 'เผยแพร่', 'เห็นผล'] as const;
type S = Step['state'];
const mkSteps = (states: [S, S, S, S, S, S]): Step[] =>
  STEP_LABELS.map((label, i) => ({ label, state: states[i] }));

function campaignStage(status: string, postStatus?: string): WorkCenterStage {
  if (postStatus === 'failed' || postStatus === 'cancelled') return 'attention';
  if (status === 'pending_approval' || status === 'approved') return 'review';
  if (status === 'done') return 'completed';
  if (status === 'low_engagement' || status === 'draft_error' || status === 'needs_input') return 'attention';
  return 'working';
}

/** Content: รับงาน → เตรียมของ(AI) → อนุมัติ → [Scrape ข้าม] → Auto post → เสร็จ */
function contentSteps(status: string, postStatus?: string): Step[] {
  let draft: S = 'done';
  if (['new', 'researching', 'drafting'].includes(status)) draft = 'active';
  else if (status === 'draft_error' || status === 'needs_input') draft = 'failed';

  let approve: S = 'todo';
  if (status === 'pending_approval' || status === 'approved') approve = 'active';
  else if (['posting', 'measuring', 'done'].includes(status)) approve = 'done';

  let post: S = 'todo';
  if (postStatus === 'failed' || postStatus === 'cancelled') post = 'failed';
  else if (postStatus === 'queued' || postStatus === 'running' || status === 'posting') post = 'active';
  else if (postStatus === 'completed' || ['measuring', 'done'].includes(status)) post = 'done';

  let done: S = 'todo';
  if (status === 'done') done = 'done';
  else if (status === 'measuring') done = 'active';

  return mkSteps(['done', draft, approve, 'skip', post, done]);
}

/** Scraping: รับงาน → เตรียมของ → อนุมัติ → Scrape → [Auto post ข้าม] → เสร็จ */
function scrapeSteps(status: string, reviewStatus?: string): Step[] {
  let scrape: S = 'todo';
  if (status === 'queued' || status === 'running') scrape = 'active';
  else if (status === 'error' || status === 'partial') scrape = 'failed';
  else if (status === 'done') scrape = 'done';

  let done: S = 'todo';
  if (status === 'done') done = reviewStatus === 'pending' ? 'active' : 'done';

  return mkSteps(['done', 'done', 'done', scrape, 'skip', done]);
}

/** คำขอที่ยังไม่รับ — ป้ายแรกกำลังรอ, ที่เหลือ todo, ข้ามตามชนิดงาน */
function intakeSteps(kind: 'content' | 'scraping'): Step[] {
  const scrape: S = kind === 'scraping' ? 'todo' : 'skip';
  const post: S = kind === 'content' ? 'todo' : 'skip';
  return mkSteps(['active', 'todo', 'todo', scrape, post, 'todo']);
}

export default async function OrchestratorPage() {
  const [reqs, campaigns, pending, fb, connectors, tasks, postStates, pendingAdmin, contentBrain] = await Promise.all([
    listSoRecruitPostingRequests(),
    listCampaigns(),
    listPendingApprovalContents(),
    listFacebookAccounts(),
    listConnectorOptions(),
    listTasks(),
    listCampaignPostQueueStates(),
    listCampaignPendingAdminCounts(),
    getContentBrainSummary(),
  ]);
  const contentByCampaign = new Map(pending.map((content) => [content.campaign_id, content]));
  const postByCampaign = new Map(postStates.map((state) => [state.campaign_id, state]));
  const pendingAdminByCampaign = new Map(pendingAdmin.map((x) => [x.campaign_id, x.pending]));
  const items: WorkCenterItem[] = [
    ...reqs.map((request): WorkCenterItem => {
      // ใบตรวจข้อมูล: ช่องไหนมี/ขาด — คนตรวจเห็นก่อนกดรับ/ตีกลับ (ขาดเยอะ = ตีกลับพร้อมบอกได้เลย)
      const js = (request.job_snapshot ?? {}) as Record<string, unknown>;
      const has = (v: unknown) => String(v ?? '').trim() !== '' && v !== null;
      const checklist = [
        { label: 'ตำแหน่ง', ok: has(js.position) || has(request.erp_title && request.erp_title !== request.request_no ? request.erp_title : '') },
        { label: 'พื้นที่', ok: has(js.location) || has(request.erp_province) },
        { label: 'รายได้', ok: has(js.income) },
        { label: 'จำนวน', ok: has(js.qty) || has(request.erp_qty) },
        { label: 'เวลางาน', ok: has(js.work_schedule) },
      ];
      // ข้อมูลใบขอเต็ม (snapshot + ERP fallback) — โชว์บนการ์ด + prefill ช่องแก้ไขก่อนรับงาน
      const sv = (v: unknown) => String(v ?? '').trim();
      const requestFields = {
        position: sv(js.position) || (request.erp_title && request.erp_title !== request.request_no ? request.erp_title : ''),
        location: sv(js.location) || request.erp_province || '',
        income: sv(js.income),
        qty: sv(js.qty) || (request.erp_qty ? String(request.erp_qty) : ''),
        work_schedule: sv(js.work_schedule),
        gender: sv(js.gender),
        age_min: sv(js.age_min),
        age_max: sv(js.age_max),
        unit_name: sv(js.unit_name),
        note: sv(js.note),
      };
      return {
        id: `request:${request.id}`,
        kind: request.request_type,
        stage: 'intake',
        title: request.erp_title || request.request_no,
        requestNo: request.request_no,
        detail: request.reason || request.notes,
        requester: request.requested_by_name,
        connector: null,
        statusLabel: 'รออนุมัติรับงาน',
        createdAt: request.created_at,
        href: '/orchestrator/imports',
        steps: intakeSteps(request.request_type),
        checklist,
        requestFields,
      };
    }),
    ...campaigns.map((campaign): WorkCenterItem => {
      const content = contentByCampaign.get(campaign.id);
      const post = postByCampaign.get(campaign.id);
      const postFailed = post?.status === 'failed' || post?.status === 'cancelled';
      const canMeasure = post?.status === 'completed' && ['posting', 'measuring'].includes(campaign.status);
      // โพสต์ลงกลุ่มแล้วแต่แอดมินกลุ่มยังไม่ปล่อย — บอกตรง ๆ จะได้ไม่รอเก้อ
      const adminPending = pendingAdminByCampaign.get(campaign.id) ?? 0;
      const adminSuffix = adminPending > 0 ? ` · รอแอดมินกลุ่มอนุมัติ ${adminPending} โพสต์` : '';
      const statusLabel = (postFailed
        ? (post.status === 'cancelled' ? 'คิวโพสต์ถูกยกเลิก' : 'โพสต์ไม่สำเร็จ')
        : post?.status === 'queued'
          ? 'รอคิวโพสต์'
          : post?.status === 'running'
            ? 'กำลังโพสต์'
            : canMeasure
              ? (campaign.status === 'measuring' ? 'รอเก็บผลตอบรับ' : 'โพสต์แล้ว · รอตรวจผล')
              : STATUS_TH[campaign.status] || campaign.status) + adminSuffix;
      return {
        id: `content:${campaign.id}`,
        kind: 'content',
        stage: campaignStage(campaign.status, post?.status),
        title: campaign.title || campaign.request_no || 'งานสร้างประกาศรับสมัคร',
        requestNo: campaign.request_no,
        detail: postFailed ? (post.error || 'งานโพสต์หยุดก่อนสำเร็จ กดลองใหม่ได้') : (content?.caption || campaign.status_note),
        requester: campaign.created_by,
        connector: null,
        statusLabel,
        createdAt: campaign.created_at,
        href: `/orchestrator/${campaign.id}`,
        content: content ? {
          id: content.id,
          campaignId: campaign.id,
          caption: content.caption,
          hasImage: content.has_image,
          qualityStatus: content.quality_status,
          qualityScore: content.quality_score,
          qualitySummary: content.quality_checks?.summary ?? null,
        } : null,
        campaignId: campaign.id,
        nextAction: postFailed
          ? 'retry_post'
          : campaign.status === 'draft_error' || (campaign.status === 'new' && !!campaign.status_note)
            ? 'retry_draft'
            : canMeasure
              ? 'measure'
              : null,
        steps: contentSteps(campaign.status, post?.status),
      };
    }),
    ...tasks.filter((task) => task.status !== 'idle' || task.source_request_no).map((task): WorkCenterItem => {
      let stage: WorkCenterStage = 'working';
      if (task.status === 'error' || task.status === 'partial') stage = 'attention';
      else if (task.status === 'done' && task.review_status === 'pending') stage = 'review';
      else if (task.status === 'done') stage = 'completed';
      return {
        id: `scraping:${task.id}`,
        kind: 'scraping',
        stage,
        title: task.name,
        requestNo: task.source_request_no,
        detail: task.last_error || (task.criteria.job_description ? String(task.criteria.job_description) : null),
        requester: null,
        connector: `${task.platform} · ${task.connector_label}`,
        statusLabel: task.status === 'done' && task.review_status === 'pending' ? 'รอตรวจรับข้อมูล' : task.status === 'partial' ? 'ยังได้ Resume ไม่ครบ' : task.status === 'error' ? 'ค้นหาไม่สำเร็จ' : task.status === 'queued' ? 'รอเริ่มค้นหา' : task.status === 'running' ? 'กำลังค้นหาผู้สมัคร' : 'สำเร็จ',
        createdAt: task.created_at,
        href: '/scraping',
        progress: {
          qualified: task.qualified_count,
          assessed: task.assessed_total,
          target: task.progress_target || task.target_count || 0,
          running: task.status === 'running',
        },
        taskId: task.id,
        steps: scrapeSteps(task.status, task.review_status),
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={8} />
      <WorkerStatus />
      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">สมองเรียนรู้การสร้าง Content</h2>
            <p className="mt-1 text-sm text-violet-800">
              เก็บผลจริงจากข้อความ รูป เวลาโพสต์ และกลุ่ม Facebook — ต้องพบซ้ำอย่างน้อย 3 แคมเปญจึงนำมาเป็นสูตรแนะนำ
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-1">หลักฐาน {contentBrain.learning_events}</span>
            <span className="rounded-full bg-white px-3 py-1">แคมเปญ {contentBrain.campaigns_with_evidence}</span>
            <span className="rounded-full bg-amber-100 px-3 py-1">กำลังเรียนรู้ {contentBrain.collecting_patterns}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1">ยืนยันแล้ว {contentBrain.proven_patterns}</span>
          </div>
        </div>
      </section>
      <WorkCenter
        items={items}
        connectors={connectors.map((connector) => ({ id: connector.id, label: `${connector.platform} · ${connector.label}` }))}
        facebookAccounts={fb.map((account) => ({
          id: account.id,
          label: account.label,
          groupCount: account.group_count,
          preferredWorker: account.preferred_worker,
          workerOnline: account.worker_online,
          preflightReady: account.preflight_ready,
          preflightVerified: account.preflight_verified,
        }))}
      />
    </div>
  );
}
