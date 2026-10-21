import {
  listSoRecruitPostingRequests,
  listFacebookAccounts,
  listConnectorOptions,
  listTasks,
} from '@/lib/repo';
import { AutoRefresh } from '@/components/AutoRefresh';
import { WorkerStatus } from '@/components/WorkerStatus';
import { WorkCenter, type WorkCenterItem, type WorkCenterStage, type Step } from '@/components/WorkCenter';
import { humanizeOperatorError, operatorJobTitle } from '@/lib/operator-copy';
import { prefillScrapePlan } from '@/lib/scrape-intake.js';
import { isContentGenerationEnabled, productScopeSummary } from '@/lib/product-scope';

export const dynamic = 'force-dynamic';

const STEP_LABELS = ['รับงาน', 'เตรียมงาน', 'ตรวจงาน', 'หาผู้สมัคร', 'เผยแพร่', 'เห็นผล'] as const;
type S = Step['state'];
const mkSteps = (states: [S, S, S, S, S, S]): Step[] =>
  STEP_LABELS.map((label, i) => ({ label, state: states[i] }));

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

function intakeSteps(): Step[] {
  return mkSteps(['active', 'todo', 'todo', 'todo', 'skip', 'todo']);
}

export default async function OrchestratorPage({ searchParams }: { searchParams?: { notice?: string } }) {
  const [reqs, fb, connectors, tasks] = await Promise.all([
    listSoRecruitPostingRequests(),
    listFacebookAccounts(),
    listConnectorOptions(),
    listTasks(),
  ]);
  const contentEnabled = isContentGenerationEnabled();

  const scrapingReqs = reqs.filter((r) => r.request_type === 'scraping');
  const disabledContentReqs = contentEnabled
    ? []
    // คำสั่งโพสต์แบบใหม่ (มี caption จาก Jarvis) ไปอยู่ห้อง Autopost — ไม่ใช่คำขอสร้างประกาศที่ปิดแล้ว
    : reqs.filter((r) => r.request_type === 'content' && !String((r.job_snapshot ?? {}).caption ?? '').trim());

  const items: WorkCenterItem[] = [
    ...scrapingReqs.map((request): WorkCenterItem => {
      const js = (request.job_snapshot ?? {}) as Record<string, unknown>;
      const has = (v: unknown) => String(v ?? '').trim() !== '' && v !== null;
      const checklist = [
        { label: 'ตำแหน่ง', ok: has(js.position) || has(request.erp_title && request.erp_title !== request.request_no ? request.erp_title : '') },
        { label: 'พื้นที่', ok: has(js.location) || has(request.erp_province) },
        { label: 'รายได้', ok: has(js.income) },
        { label: 'จำนวน', ok: has(js.qty) || has(request.erp_qty) },
        { label: 'เวลางาน', ok: has(js.work_schedule) },
      ];
      const requestFields = prefillScrapePlan(js, {
        position: request.erp_title && request.erp_title !== request.request_no ? request.erp_title : '',
        location: request.erp_province || '',
        qty: request.erp_qty ? String(request.erp_qty) : '',
      });
      return {
        id: `request:${request.id}`,
        kind: 'scraping',
        stage: 'intake',
        title: operatorJobTitle({ position: requestFields.position, title: request.erp_title, requestNo: request.request_no }),
        requestNo: request.request_no,
        detail: request.reason || request.notes,
        requester: request.requested_by_name,
        connector: null,
        statusLabel: 'รอเริ่มค้นหา',
        createdAt: request.created_at,
        href: null,
        context: requestFields.location || request.requested_by_name,
        steps: intakeSteps(),
        checklist,
        requestFields,
      };
    }),
    ...tasks.filter((task) => task.status !== 'idle' || task.source_request_no).map((task): WorkCenterItem => {
      let stage: WorkCenterStage = 'working';
      if (task.status === 'error' || task.status === 'partial') stage = 'attention';
      else if (task.status === 'done' && task.review_status === 'pending') stage = 'review';
      else if (task.status === 'done') stage = 'completed';
      const taskTitle = operatorJobTitle({ position: task.criteria.position || task.criteria.keyword, title: task.name, requestNo: task.source_request_no });
      const taskError = humanizeOperatorError(task.last_error);
      return {
        id: `scraping:${task.id}`,
        kind: 'scraping',
        stage,
        title: taskTitle,
        requestNo: task.source_request_no,
        detail: taskError
          ? [
            taskError.title,
            taskError.detail,
            `ทำต่อ: ${taskError.next}`,
            taskError.technical ? `สาเหตุระบบ: ${taskError.technical}` : null,
          ].filter(Boolean).join('\n')
          : null,
        requester: null,
        connector: `${task.platform === 'jobthai' ? 'JobThai' : task.platform === 'jobbkk' ? 'JobBKK' : task.platform} · ${task.connector_label}`,
        statusLabel: task.status === 'done' && task.review_status === 'pending' ? 'รอตรวจรับข้อมูล' : task.status === 'partial' ? 'ยังได้ Resume ไม่ครบ' : task.status === 'error' ? 'ค้นหาไม่สำเร็จ' : task.status === 'queued' ? 'รอเริ่มค้นหา' : task.status === 'running' ? 'กำลังค้นหาผู้สมัคร' : 'สำเร็จ',
        createdAt: task.created_at,
        href: `/scraping/${task.id}`,
        context: [String(task.criteria.province || '').trim(), `${task.platform === 'jobthai' ? 'JobThai' : task.platform === 'jobbkk' ? 'JobBKK' : task.platform} · ${task.connector_label}`].filter(Boolean).join(' · ') || null,
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
      <AutoRefresh seconds={20} />
      {typeof searchParams?.notice === 'string' && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {searchParams.notice}
        </div>
      )}
      <details className="rounded-xl border border-line bg-white px-4 py-2.5">
        <summary className="cursor-pointer text-sm text-subtle">
          สถานะเครื่อง · {productScopeSummary()}
        </summary>
        <div className="mt-3">
          <WorkerStatus />
        </div>
      </details>
      <WorkCenter
        items={items}
        disabledContentRequests={disabledContentReqs.map((r) => ({
          requestNo: r.request_no,
          title: operatorJobTitle({
            position: String((r.job_snapshot as Record<string, unknown> | null)?.position ?? ''),
            title: r.erp_title,
            requestNo: r.request_no,
          }),
        }))}
        connectors={connectors.map((connector) => ({
          id: connector.id,
          label: `${connector.platform === 'jobthai' ? 'JobThai' : connector.platform === 'jobbkk' ? 'JobBKK' : connector.platform} · ${connector.label}`,
          available: connector.available,
          blockReason: connector.block_reason,
        }))}
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
