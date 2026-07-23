import {
  listSoRecruitPostingRequests,
  listCampaigns,
  listPendingApprovalContents,
  listFacebookAccounts,
  listConnectorOptions,
  listTasks,
  listCampaignPostQueueStates,
  listCampaignPendingAdminCounts,
} from '@/lib/repo';
import { AutoRefresh } from '@/components/AutoRefresh';
import { WorkerStatus } from '@/components/WorkerStatus';
import { WorkCenter, type WorkCenterItem, type WorkCenterStage, type Step } from '@/components/WorkCenter';

export const dynamic = 'force-dynamic';

const STATUS_TH: Record<string, string> = {
  new: 'เพิ่งเริ่ม',
  researching: 'สำรวจแนว',
  drafting: 'AI กำลังคิด',
  draft_error: 'สร้าง Content ไม่สำเร็จ',
  low_engagement: 'คนสนใจน้อย — คิดใหม่',
  pending_approval: 'รอตรวจ',
  approved: 'อนุมัติแล้ว',
  posting: 'กำลังโพสต์',
  measuring: 'วัดผล',
  done: 'เสร็จ',
};

// เส้นทางงาน 6 ป้ายเดียวกันทุกงาน — งานไหนไม่ใช้ขั้นไหน = 'skip' (วิ่งทะลุผ่านให้เห็น)
const STEP_LABELS = ['รับงาน', 'เตรียมของ', 'อนุมัติ', 'Scrape', 'Auto post', 'เสร็จ'] as const;
type S = Step['state'];
const mkSteps = (states: [S, S, S, S, S, S]): Step[] =>
  STEP_LABELS.map((label, i) => ({ label, state: states[i] }));

function campaignStage(status: string, postStatus?: string): WorkCenterStage {
  if (postStatus === 'failed' || postStatus === 'cancelled') return 'attention';
  if (status === 'pending_approval') return 'review';
  if (status === 'done') return 'completed';
  if (status === 'low_engagement' || status === 'draft_error') return 'attention';
  return 'working';
}

/** Content: รับงาน → เตรียมของ(AI) → อนุมัติ → [Scrape ข้าม] → Auto post → เสร็จ */
function contentSteps(status: string, postStatus?: string): Step[] {
  let draft: S = 'done';
  if (['new', 'researching', 'drafting'].includes(status)) draft = 'active';
  else if (status === 'draft_error') draft = 'failed';

  let approve: S = 'todo';
  if (status === 'pending_approval') approve = 'active';
  else if (['approved', 'posting', 'measuring', 'done'].includes(status)) approve = 'done';

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
  else if (status === 'error') scrape = 'failed';
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
  const [reqs, campaigns, pending, fb, connectors, tasks, postStates, pendingAdmin] = await Promise.all([
    listSoRecruitPostingRequests(),
    listCampaigns(),
    listPendingApprovalContents(),
    listFacebookAccounts(),
    listConnectorOptions(),
    listTasks(),
    listCampaignPostQueueStates(),
    listCampaignPendingAdminCounts(),
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
              ? (campaign.status === 'measuring' ? 'รอข้อมูล Engagement' : 'โพสต์แล้ว · รอตรวจผล')
              : STATUS_TH[campaign.status] || campaign.status) + adminSuffix;
      return {
        id: `content:${campaign.id}`,
        kind: 'content',
        stage: campaignStage(campaign.status, post?.status),
        title: campaign.title || campaign.request_no || 'Content campaign',
        requestNo: campaign.request_no,
        detail: postFailed ? (post.error || 'งานโพสต์หยุดก่อนสำเร็จ กดลองใหม่ได้') : (content?.caption || campaign.status_note),
        requester: campaign.created_by,
        connector: null,
        statusLabel,
        createdAt: campaign.created_at,
        href: `/orchestrator/${campaign.id}`,
        content: content ? { id: content.id, campaignId: campaign.id, caption: content.caption, hasImage: content.has_image } : null,
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
      if (task.status === 'error') stage = 'attention';
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
        statusLabel: task.status === 'done' && task.review_status === 'pending' ? 'รอตรวจรับข้อมูล' : task.status === 'error' ? 'ผิดพลาด' : task.status === 'queued' ? 'รอคิว' : task.status === 'running' ? 'กำลัง Scraping' : 'สำเร็จ',
        createdAt: task.created_at,
        href: '/scraping',
        progress: { got: task.progress_got, target: task.progress_target || task.target_count || 0 },
        taskId: task.id,
        steps: scrapeSteps(task.status, task.review_status),
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={8} />
      <WorkerStatus />
      <WorkCenter
        items={items}
        connectors={connectors.map((connector) => ({ id: connector.id, label: `${connector.platform} · ${connector.label}` }))}
        facebookAccounts={fb.map((account) => ({ id: account.id, label: account.label, groupCount: account.group_count }))}
      />
    </div>
  );
}
