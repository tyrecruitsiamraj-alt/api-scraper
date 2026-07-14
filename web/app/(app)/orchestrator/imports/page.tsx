import Link from 'next/link';
import { listStagedRequests } from '@/lib/repo';
import { startCampaignAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return String(v);
  }
}

export default async function ImportsPage() {
  const reqs = await listStagedRequests();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orchestrator" className="text-sm text-subtle hover:text-accent">← กลับ Dashboard</Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ใบขอจาก ERP ที่ยังหาคนไม่ครบ</h1>
        <p className="mt-1 text-sm text-subtle">
          กด “เริ่มทำ content” ต่อใบเพื่อเข้าโหมดคิด content ทำการตลาดสรรหา · ข้อมูล sync จาก SQL Server ด้วย{' '}
          <code className="rounded bg-black/5 px-1">npm run erp:sync</code> (รันบนเครื่องที่ต่อ ERP ได้)
        </p>
      </div>

      {reqs.length === 0 ? (
        <div className="card px-5 py-16 text-center text-subtle">
          ยังไม่มีใบขอใน staging — รัน <code className="rounded bg-black/5 px-1">npm run erp:sync</code> บนเครื่อง worker เพื่อดึงจาก ERP
          <br />
          (หรือยังไม่ได้ตั้งค่า <code className="rounded bg-black/5 px-1">MSSQL_*</code> ใน .env)
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-subtle">
                <th className="px-4 py-2.5 font-medium">เลขใบขอ</th>
                <th className="px-4 py-2.5 font-medium">ประเภท/ตำแหน่ง</th>
                <th className="px-4 py-2.5 font-medium">ไซต์/จังหวัด</th>
                <th className="px-4 py-2.5 font-medium text-right">ต้องการ</th>
                <th className="px-4 py-2.5 font-medium text-right">ขาด</th>
                <th className="px-4 py-2.5 font-medium">วันที่ขอ</th>
                <th className="px-4 py-2.5 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.request_no} className="border-b border-hairline/60 last:border-0 hover:bg-black/[0.015]">
                  <td className="px-4 py-2.5 font-medium">{r.request_no}</td>
                  <td className="px-4 py-2.5">{r.title || '—'}</td>
                  <td className="px-4 py-2.5 text-subtle">{r.province || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.qty ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-amber-700">{r.remaining_qty ?? '—'}</td>
                  <td className="px-4 py-2.5 text-subtle">{fmtDate(r.request_date)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={startCampaignAction} className="inline">
                      <input type="hidden" name="requestNo" value={r.request_no} />
                      <button className="btn-primary btn-sm">เริ่มทำ content</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
