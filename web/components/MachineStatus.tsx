import { listMachineStatus } from '@/lib/repo';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

function silentFor(lastSeen: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(lastSeen).getTime()) / 60000));
  if (min < 60) return `${min} นาที`;
  if (min < 1440) return `${Math.round(min / 60)} ชั่วโมง`;
  return `${Math.round(min / 1440)} วัน`;
}

/** แถบสถานะเครื่อง: ออนไลน์ไหม กำลังทำกี่งาน รอคิวกี่งาน โค้ดรุ่นไหน — ให้ดูเองได้โดยไม่ต้องถามใคร */
export async function MachineStatus({ kind }: { kind?: 'autopost' | 'scraper' }) {
  const { machines, retired } = await listMachineStatus();
  const rows = kind ? machines.filter((m) => m.kind === kind) : machines;
  const hidden = (kind ? retired.filter((r) => r.kind === kind) : retired).length;
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเครื่องที่ส่งสัญญาณเข้ามาใน 7 วัน</p>}
        {rows.map((m) => (
          <div key={`${m.kind}-${m.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">{m.name}</span>
            <span className="text-muted-foreground">{m.kind === 'autopost' ? 'โพสต์' : 'Scrap'}</span>
            {m.online ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                ออนไลน์
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                ออฟไลน์ · เงียบมา {silentFor(m.last_seen)}
              </Badge>
            )}
            {m.kind === 'autopost' && (
              <span className="text-muted-foreground">
                กำลังโพสต์ {m.running} · รอคิว {m.queued}
              </span>
            )}
            {m.build_sha && <span className="font-mono text-xs text-muted-foreground">โค้ด {m.build_sha.slice(0, 7)}</span>}
            {!m.online && <span className="text-muted-foreground">เปิดสวิตช์บนเครื่องนั้น</span>}
          </div>
        ))}
        {hidden > 0 && <p className="text-xs text-muted-foreground">ไม่แสดงเครื่องที่เงียบเกิน 7 วัน {hidden} เครื่อง</p>}
      </CardContent>
    </Card>
  );
}
