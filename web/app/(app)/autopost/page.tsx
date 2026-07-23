import Link from 'next/link';
import {
  autopostOverview,
  autopostActivity,
  listBestPostTimes,
  listPendingApprovalContents,
  postQueueList,
} from '@/lib/repo';

const DOW_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
import { AutopostActivity } from '@/components/AutopostActivity';

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
  const [a, activity, pending, queue, bestTimes] = await Promise.all([
    autopostOverview(),
    autopostActivity(),
    listPendingApprovalContents(),
    postQueueList(),
    listBestPostTimes(3),
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
          <div className="card flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-xs">
            <span className="eyebrow">ช่วงเวลาโพสต์แนะนำ</span>
            {bestTimes.length > 0 ? (
              bestTimes.map((t) => (
                <span key={`${t.dow}-${t.hour}`} className="pill bg-emerald-50 text-emerald-700">
                  {DOW_TH[t.dow]} {String(t.hour).padStart(2, '0')}:00 · score {t.score.toFixed(1)}
                </span>
              ))
            ) : (
              <span className="text-subtle">ยังไม่มีข้อมูลพอ — แนวทั่วไป: เช้า 07-09 · เที่ยง 12-13 · เย็น 18-20 (ระบบจะเรียนรู้เองเมื่อโพสต์สะสมมากขึ้น)</span>
            )}
          </div>
          <p className="text-xs text-subtle">
            จัดการ Connector, Job และการตั้งค่าโพสต์ได้จากเมนู “ตั้งค่า” ด้านบน
          </p>
        </>
      )}

      {/* การอนุมัติรวมไว้ที่ Work Center จุดเดียว เพื่อลดเส้นทางซ้ำและลดการกดผิดหน้า. */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Content รอตรวจ ({pending.length})</h2>
        <div className="card px-5 py-8 text-center text-sm text-subtle">
          <p>{pending.length > 0 ? `มี ${pending.length} งานรอตรวจและเลือกบัญชีโพสต์` : 'ตอนนี้ไม่มี Content รอตรวจ'}</p>
          <Link href="/orchestrator" className="btn-primary btn-sm mt-3 inline-flex">ไปจัดการที่ศูนย์งาน</Link>
        </div>
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
