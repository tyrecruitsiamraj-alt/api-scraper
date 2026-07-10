import { autopostOverview } from '@/lib/repo';

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

export default async function AutopostOverviewPage() {
  const a = await autopostOverview();

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
            ดูโควต้ารายบัญชีและจัดการบัญชีได้ที่หน้า “บัญชี Facebook” · ตั้งค่างาน/กลุ่ม/มอบหมาย ที่ “ตั้งค่าโพสต์”
          </p>
        </>
      )}
    </div>
  );
}
