import {
  listSoRecruitPostingRequests,
  listCampaigns,
  listPendingApprovalContents,
  listFacebookAccounts,
  listConnectorOptions,
  listTasks,
} from '@/lib/repo';
import { AutoRefresh } from '@/components/AutoRefresh';
import { WorkCenter, type WorkCenterItem, type WorkCenterStage } from '@/components/WorkCenter';

export const dynamic = 'force-dynamic';

const STATUS_TH: Record<string, string> = {
  new: 'เพิ่งเริ่ม',
  researching: 'สำรวจแนว',
  drafting: 'AI กำลังคิด',
  low_engagement: 'คนสนใจน้อย — คิดใหม่',
  pending_approval: 'รอตรวจ',
  approved: 'อนุมัติแล้ว',
  posting: 'กำลังโพสต์',
  measuring: 'วัดผล',
  done: 'เสร็จ',
};

function campaignStage(status: string): WorkCenterStage {
  if (status === 'pending_approval') return 'review';
  if (status === 'done' || status === 'measuring') return 'completed';
  if (status === 'low_engagement') return 'attention';
  return 'working';
}

export default async function OrchestratorPage() {
  const [reqs, campaigns, pending, fb, connectors, tasks] = await Promise.all([
    listSoRecruitPostingRequests(),
    listCampaigns(),
    listPendingApprovalContents(),
    listFacebookAccounts(),
    listConnectorOptions(),
    listTasks(),
  ]);
  const contentByCampaign = new Map(pending.map((content) => [content.campaign_id, content]));
  const items: WorkCenterItem[] = [
    ...reqs.map((request): WorkCenterItem => ({
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
    })),
    ...campaigns.map((campaign): WorkCenterItem => {
      const content = contentByCampaign.get(campaign.id);
      return {
        id: `content:${campaign.id}`,
        kind: 'content',
        stage: campaignStage(campaign.status),
        title: campaign.title || campaign.request_no || 'Content campaign',
        requestNo: campaign.request_no,
        detail: content?.caption || campaign.status_note,
        requester: campaign.created_by,
        connector: null,
        statusLabel: STATUS_TH[campaign.status] || campaign.status,
        createdAt: campaign.created_at,
        href: `/orchestrator/${campaign.id}`,
        content: content ? { id: content.id, campaignId: campaign.id, caption: content.caption, hasImage: content.has_image } : null,
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
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <AutoRefresh seconds={8} />
      <WorkCenter
        items={items}
        connectors={connectors.map((connector) => ({ id: connector.id, label: `${connector.platform} · ${connector.label}` }))}
        facebookAccounts={fb.map((account) => ({ id: account.id, label: account.label }))}
      />
    </div>
  );
}
