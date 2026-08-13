import { getWorkflowReadiness } from '@/lib/repo';
import { runWorkflowSelfTestAction } from '@/lib/actions';
import { WorkflowSelfTestButton } from '@/components/WorkflowSelfTestButton';

/**
 * แถบสถานะเครื่อง worker บนศูนย์งาน — แก้ปัญหา "worker ตายเงียบไม่มีใครรู้"
 * (server component: อ่าน heartbeat จาก DB ทั้งฝั่ง scraper และ autopost)
 */
export async function WorkerStatus() {
  const readiness = await getWorkflowReadiness();
  const workers = readiness.workers;
  const offline = workers.filter((w) => !w.online);
  return (
    <div className={`rounded-2xl border px-4 py-3 text-xs shadow-card ${
      readiness.status === 'ready' ? 'border-emerald-200 bg-emerald-50/60' : readiness.status === 'blocked' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'
    }`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">ความพร้อมทั้งระบบ</span>
        <span className="font-semibold text-ink">{readiness.score}/100</span>
        <span className={readiness.status === 'ready' ? 'text-emerald-700' : readiness.status === 'blocked' ? 'text-red-700' : 'text-amber-700'}>
          {readiness.summary}
        </span>
        <form action={runWorkflowSelfTestAction} className="ml-auto">
          <WorkflowSelfTestButton />
        </form>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer select-none text-subtle">ดูผลตรวจ {readiness.checks.length} จุด</summary>
        <div className="mt-2 grid gap-1.5 md:grid-cols-2">
          {readiness.checks.map((check) => (
            <div key={check.code} className={check.status === 'pass' ? 'text-emerald-700' : check.status === 'fail' ? 'text-red-700' : 'text-amber-700'}>
              {check.status === 'pass' ? '✓' : check.status === 'fail' ? '✕' : '!'} <span className="font-medium">{check.label}</span> — {check.message}
            </div>
          ))}
        </div>
      </details>
      {workers.length > 0 && offline.length > 0 && (
        <div className="mt-2 text-subtle">เครื่องออฟไลน์: {offline.map((worker) => worker.name).join(', ')}</div>
      )}
    </div>
  );
}
