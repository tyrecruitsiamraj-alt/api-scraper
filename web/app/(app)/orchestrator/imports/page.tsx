import Link from 'next/link';
import { listConnectorOptions, listSoRecruitPostingRequests } from '@/lib/repo';
import { startCampaignAction, startSoRecruitScrapeAction } from '@/lib/actions';

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
  const [reqs, connectors] = await Promise.all([listSoRecruitPostingRequests(), listConnectorOptions()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orchestrator" className="text-sm text-subtle hover:text-accent">← กลับ Dashboard</Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">คำขอ Content และ Scraping (จาก So Recruit)</h1>
        <p className="mt-1 text-sm text-subtle">
          คำขอที่ทีม Matching ส่งมาเมื่อคนใน pool ไม่พอ · Content จะเข้า AI Draft ส่วน Scraping ต้องเลือก Connector ก่อนเริ่ม
          (ระบบจะแจ้งสถานะกลับ So Recruit อัตโนมัติ)
        </p>
      </div>

      {reqs.length === 0 ? (
        <div className="card px-5 py-16 text-center text-subtle">
          ยังไม่มีคำขอโพสหางานใหม่จาก So Recruit
          <br />
          (ทีม matching จะกดส่งคำขอมาเมื่อหาคนใน pool ไม่พอ)
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-subtle">
                <th className="px-4 py-2.5 font-medium">เลขใบขอ</th>
                <th className="px-4 py-2.5 font-medium">ประเภท</th>
                <th className="px-4 py-2.5 font-medium">ตำแหน่ง/เหตุผล</th>
                <th className="px-4 py-2.5 font-medium">ไซต์/จังหวัด</th>
                <th className="px-4 py-2.5 font-medium">ผู้ขอ</th>
                <th className="px-4 py-2.5 font-medium">วันที่ขอ</th>
                <th className="px-4 py-2.5 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.request_no} className="border-b border-hairline/60 last:border-0 hover:bg-black/[0.015]">
                  <td className="px-4 py-2.5 font-medium">{r.request_no}</td>
                  <td className="px-4 py-2.5">
                    <span className={`pill ${r.request_type === 'scraping' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                      {r.request_type === 'scraping' ? 'Scraping' : 'Content'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.erp_title ? (
                      <span>{r.erp_title}</span>
                    ) : (
                      <span className="text-subtle">{r.reason || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-subtle">{r.erp_province || '—'}</td>
                  <td className="px-4 py-2.5 text-subtle">{r.requested_by_name || '—'}</td>
                  <td className="px-4 py-2.5 text-subtle">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.request_type === 'scraping' ? (
                      <form action={startSoRecruitScrapeAction} className="ml-auto flex max-w-72 items-center justify-end gap-2">
                        <input type="hidden" name="requestNo" value={r.request_no} />
                        <select name="connectorId" required defaultValue="" className="field h-8 min-w-36 py-1 text-xs">
                          <option value="" disabled>เลือก Connector…</option>
                          {connectors.map((connector) => (
                            <option key={connector.id} value={connector.id}>{connector.platform} · {connector.label}</option>
                          ))}
                        </select>
                        <button className="btn-primary btn-sm shrink-0" disabled={connectors.length === 0}>เริ่ม Scraping</button>
                      </form>
                    ) : (
                      <form action={startCampaignAction} className="inline">
                        <input type="hidden" name="requestNo" value={r.request_no} />
                        <button className="btn-primary btn-sm">เริ่มทำ Content</button>
                      </form>
                    )}
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
