import { listWorkerHeartbeats } from '@/lib/repo';

/**
 * แถบสถานะเครื่อง worker บนศูนย์งาน — แก้ปัญหา "worker ตายเงียบไม่มีใครรู้"
 * (server component: อ่าน heartbeat จาก DB ทั้งฝั่ง scraper และ autopost)
 */
export async function WorkerStatus() {
  const workers = await listWorkerHeartbeats();
  if (workers.length === 0) {
    return (
      <div className="card flex items-center gap-2 px-4 py-2.5 text-xs text-subtle">
        <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
        ยังไม่เห็นเครื่อง worker รายงานตัว — เปิด start-workers.bat (PC) / start-mac.command (Mac) แล้วรอ ~1 นาที
      </div>
    );
  }
  const offline = workers.filter((w) => !w.online);
  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-xs">
      <span className="font-medium text-subtle">เครื่องทำงาน:</span>
      {workers.map((w) => (
        <span key={`${w.kind}:${w.name}`} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${w.online ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={w.online ? 'text-ink' : 'text-red-600 font-medium'}>
            {w.name} ({w.kind === 'scraper' ? 'สแครป/AI' : 'โพสต์ FB'})
            {!w.online && ` — ออฟไลน์ตั้งแต่ ${new Date(w.last_seen).toLocaleString('th-TH', { timeStyle: 'short', dateStyle: 'short' })}`}
          </span>
        </span>
      ))}
      {offline.length > 0 && (
        <span className="ml-auto text-red-600">⚠ {offline.length} เครื่องหาย — งานจะค้างคิวจนกว่าจะเปิดกลับ</span>
      )}
    </div>
  );
}
