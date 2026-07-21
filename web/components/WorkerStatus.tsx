import { listWorkerHeartbeats } from '@/lib/repo';

/**
 * แถบสถานะเครื่อง worker บนศูนย์งาน — แก้ปัญหา "worker ตายเงียบไม่มีใครรู้"
 * (server component: อ่าน heartbeat จาก DB ทั้งฝั่ง scraper และ autopost)
 */
export async function WorkerStatus() {
  const workers = await listWorkerHeartbeats();
  if (workers.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-line/70 bg-white px-4 py-2.5 text-xs shadow-card text-subtle">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300" />
        <span className="eyebrow">เครื่องทำงาน</span>
        <span>ยังไม่มีเครื่องรายงานตัว — เปิด start-workers.bat (PC) / start-mac.command (Mac) แล้วรอ ~1 นาที</span>
      </div>
    );
  }
  const offline = workers.filter((w) => !w.online);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line/70 bg-white px-4 py-2.5 text-xs shadow-card">
      <span className="eyebrow">เครื่องทำงาน</span>
      {workers.map((w) => (
        <span key={`${w.kind}:${w.name}`} className="inline-flex items-center gap-2">
          <span className={`relative inline-flex h-2 w-2`}>
            <span className={`inline-block h-2 w-2 rounded-full ${w.online ? 'bg-emerald-500' : 'bg-accent'}`} />
            {w.online && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />}
          </span>
          <span className={w.online ? 'text-ink' : 'font-medium text-accent'}>
            {w.name}
            <span className="text-subtle"> · {w.kind === 'scraper' ? 'สแครป/AI' : 'โพสต์ FB'}</span>
            {!w.online && ` — ออฟไลน์ตั้งแต่ ${new Date(w.last_seen).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' })}`}
          </span>
        </span>
      ))}
      {offline.length > 0 && (
        <span className="ml-auto font-medium text-accent">{offline.length} เครื่องหาย — งานจะค้างคิวจนกว่าจะเปิดกลับ</span>
      )}
    </div>
  );
}
