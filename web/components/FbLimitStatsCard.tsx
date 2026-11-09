import type { FbLimitStats } from '@/lib/fb-limit-stats';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const SHOW = 40;

function when(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** ทุกครั้งที่ Facebook จำกัดบัญชี พร้อมตัวเลขก่อนโดน — ใช้ตั้งเพดานจากของจริง */
export function FbLimitStatsCard({ stats }: { stats: FbLimitStats }) {
  const s = stats;
  return (
    <Card>
      <CardHeader>
        <CardTitle>โดน Facebook จำกัด · {s.days} วันล่าสุด</CardTitle>
        <CardDescription>
          {s.total} ครั้ง · โดนตอนวันนั้นยังไม่ได้โพสต์ {s.carried_over} ครั้ง
          {s.median_posted_that_day != null && ` · ครั้งที่โพสต์แล้วค่อยโดน ค่ากลาง ${s.median_posted_that_day} กลุ่ม`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>เพดานตอนนี้</CardDescription>
              <CardTitle className="text-2xl">{s.current_cap} กลุ่ม/วัน</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>80% ของค่ากลาง</CardDescription>
              <CardTitle className="text-2xl">{s.suggested_cap != null ? `${s.suggested_cap} กลุ่ม/วัน` : 'ยังไม่มีข้อมูล'}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>โดนตอนโพสต์แล้ว</CardDescription>
              <CardTitle className="text-2xl">{s.total - s.carried_over}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>โดนค้างจากวันก่อน</CardDescription>
              <CardTitle className="text-2xl">{s.carried_over}</CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เมื่อ</TableHead>
              <TableHead>บัญชี</TableHead>
              <TableHead className="text-right">โพสต์วันนั้นก่อนโดน</TableHead>
              <TableHead className="text-right">โพสต์ 7 วันก่อนโดน</TableHead>
              <TableHead className="text-right">อายุบัญชี (วัน)</TableHead>
              <TableHead className="text-right">ครั้งที่ใน 7 วัน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.events.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">ไม่มีบัญชีโดนจำกัดในช่วงนี้</TableCell>
              </TableRow>
            )}
            {s.events.slice(0, SHOW).map((e, i) => (
              <TableRow key={`${e.at}-${i}`}>
                <TableCell className="whitespace-nowrap">{when(e.at)}</TableCell>
                <TableCell>{e.account}</TableCell>
                <TableCell className="text-right tabular-nums">{e.posted_that_day}</TableCell>
                <TableCell className="text-right tabular-nums">{e.posted_7d}</TableCell>
                <TableCell className="text-right tabular-nums">{e.age_days ?? '-'}</TableCell>
                <TableCell className="text-right tabular-nums">{e.strike ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {s.events.length > SHOW && <p className="text-sm text-muted-foreground">แสดง {SHOW} ครั้งล่าสุด จาก {s.events.length} ครั้ง</p>}
      </CardContent>
    </Card>
  );
}
