import Link from 'next/link';
import {
  autopostOverview,
  autopostActivity,
  listPendingApprovalContents,
  postQueueList,
  listFacebookAccounts,
} from '@/lib/repo';
import { AutopostActivity } from '@/components/AutopostActivity';
import { approveContentAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

// โหมด Auto-Post: หน้าภาพรวมของตัวเอง (ข้อมูล Auto-Post ล้วน แยกจากภาพรวม Scraping)
function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

const QUEUE_STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: 'รอคิว', cls: 'bg-black/5 text-ink' },
  running: { label: 'กำลังโพสต์', cls: 'bg-blue-50 text-blue-700' },
};

export default async function AutopostOverviewPage() {
  const [a, activity, pending, queue, fbAccounts] = await Promise.all([
    autopostOverview(),
    autopostActivity(),
    listPendingApprovalContents(),
    postQueueList(),
    listFacebookAccounts(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ภาพรวม Auto-Post</h1>
        <p className="mt-1 text-sm text-subtle">สถานะการโพสต์ Facebook และ lead ที่เก็บได้</p>
      </div>

      {!a ? (
        <p className="text-sm text-subtle">ยังไม่มีข้อมูล Auto-Post (ตรวจสอบการเชื่อมต่อฐานข้อมูล)</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="โพสต์วันนี้"
              value={`${a.posts_today.toLocaleString()} / ${a.capacity.toLocaleString()}`}
              sub={`${a.accounts} บัญชี`}
            />
            <Stat
              label="บัญชีเต็มโควต้า"
              value={a.over_cap.toLocaleString()}
              sub={a.paused > 0 ? `พัก (circuit breaker) ${a.paused}` : 'ไม่มีบัญชีถูกพัก'}
            />
            <Stat label="Lead วันนี้" value={a.leads_today.toLocaleString()} sub="เบอร์จากคอมเมนต์" />
            <Stat label="Lead 14 วัน" value={a.leads_14d.toLocaleString()} />
          </div>
          <p className="text-xs text-subtle">
            จัดการ Connector, Job และการตั้งค่าโพสต์ได้จากเมนู “ตั้งค่า” ด้านบน
          </p>
        </>
      )}

      {/* Content รออนุมัติ — ดึงร่างจาก orchestrator มาอนุมัติ→เข้าคิวโพสต์ที่นี่ได้เลย */}
      <div>
        <h2 className="mb-3 text-base font-semibold">📝 Content รออนุมัติ ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="card px-5 py-10 text-center text-sm text-subtle">
            ยังไม่มีร่างคอนเทนต์รออนุมัติ — สร้างได้จากโหมด <Link href="/orchestrator" className="text-accent hover:underline">Content</Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-subtle">
                  <Link href={`/orchestrator/${p.campaign_id}`} className="font-medium text-accent hover:underline">
                    {p.title || p.request_no || 'campaign'} · v{p.version}
                  </Link>
                  {p.has_image && <span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-700">มีรูป</span>}
                </div>
                <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                  {p.has_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/campaign-content/${p.id}/image`}
                      alt="ตัวอย่างรูป"
                      className="h-[120px] w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-[120px] place-items-center rounded-lg bg-black/[0.03] text-xs text-subtle">ไม่มีรูป</div>
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed">{p.caption || '—'}</p>
                  </div>
                </div>
                <form action={approveContentAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="contentId" value={p.id} />
                  <input type="hidden" name="campaignId" value={p.campaign_id} />
                  <select name="fbAccountId" required className="input input-sm flex-1 min-w-[140px]" defaultValue="">
                    <option value="" disabled>เลือกบัญชี Facebook…</option>
                    {fbAccounts.map((f) => (
                      <option key={f.id} value={f.id}>{f.label} ({f.group_count} กลุ่ม)</option>
                    ))}
                  </select>
                  <button className="btn-primary btn-sm">✓ อนุมัติ + เข้าคิวโพสต์</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* คิวโพสต์ — worker รันตามลำดับเวลาเข้าคิว บัญชีละ 1 งานพร้อมกัน */}
      <div>
        <h2 className="mb-1 text-base font-semibold">🚦 คิวโพสต์ (เรียงก่อน-หลัง)</h2>
        <p className="mb-3 text-xs text-subtle">รันตามลำดับเวลาเข้าคิว · แต่ละบัญชีโพสต์ทีละ 1 งานพร้อมกัน (กันโดนบล็อก)</p>
        {queue.length === 0 ? (
          <div className="card px-5 py-10 text-center text-sm text-subtle">คิวว่าง — ไม่มีงานรอโพสต์</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-subtle">
                  <th className="px-4 py-2.5 font-medium">ลำดับ</th>
                  <th className="px-4 py-2.5 font-medium">บัญชี</th>
                  <th className="px-4 py-2.5 font-medium">งาน</th>
                  <th className="px-4 py-2.5 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row, i) => {
                  const meta = QUEUE_STATUS[row.status] ?? { label: row.status, cls: 'bg-black/5 text-ink' };
                  return (
                    <tr key={row.id} className="border-b border-hairline/60 last:border-0">
                      <td className="px-4 py-2.5 tabular-nums font-medium">#{i + 1}</td>
                      <td className="px-4 py-2.5">{row.account || '—'}</td>
                      <td className="px-4 py-2.5 text-subtle">{row.job_title || '—'}</td>
                      <td className="px-4 py-2.5"><span className={`pill ${meta.cls}`}>{meta.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AutopostActivity initial={activity} />
    </div>
  );
}
