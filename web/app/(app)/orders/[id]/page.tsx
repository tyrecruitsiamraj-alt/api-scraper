import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OutcomeBadge } from '@/components/OrderOutcomeBadge';
import { GroupStatusBadge } from '@/components/GroupStatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getOrder } from '@/lib/order-log';
import { GROUP_STATUSES } from '../../../../../src/core/order-groups.js';

export const dynamic = 'force-dynamic';

function when(iso: string | null) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** ใบสั่งโพสต์ 1 ใบ: สั่งกี่กลุ่ม แต่ละกลุ่มเป็นยังไง ลิงก์ไปดูโพสต์ หรือเหตุที่ไม่สำเร็จ */
export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const order = await getOrder(id);
  if (!order) notFound();
  const counts = order.group_counts;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/orders" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          คำสั่งงาน
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl leading-snug font-semibold">{order.request_no}</h1>
          <OutcomeBadge outcome={order.outcome} />
        </div>
        <p className="text-sm text-muted-foreground">
          {order.type === 'scraping' ? 'Scrap' : 'โพสต์'}
          {order.position ? ` · ${order.position}` : ''} · สั่งโดย {order.who.replace(/@siamraj\.com$/i, '')} · {when(order.created_at)}
          {order.account ? ` · บัญชีที่เลือก ${order.account}` : ''}
        </p>
        <p className="text-sm">ขั้นตอนตอนนี้: {order.stage}</p>
        {order.notes && <p className="text-sm text-destructive">{order.notes}</p>}
      </header>

      {order.type === 'scraping' ? (
        <Card>
          <CardContent>
            {order.task_id ? (
              <Link href={`/scraping/${order.task_id}`} className="underline-offset-4 hover:underline">
                ดูงานค้นหาของใบนี้
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">ใบนี้ยังไม่ได้สร้างงานค้นหา</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {counts && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <Card size="sm">
                <CardHeader>
                  <CardDescription>สั่งทั้งหมด</CardDescription>
                  <CardTitle className="text-2xl">{counts.total} กลุ่ม</CardTitle>
                </CardHeader>
              </Card>
              {GROUP_STATUSES.map((s) => (
                <Card key={s.key} size="sm">
                  <CardHeader>
                    <CardDescription>{s.label}</CardDescription>
                    <CardTitle className="text-2xl">{counts[s.key]}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>ทีละกลุ่ม</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>กลุ่ม</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>บัญชีที่โพสต์</TableHead>
                    <TableHead>เวลา</TableHead>
                    <TableHead>ลิงก์ / เหตุ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.groups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">ใบนี้ไม่มีรายการกลุ่ม</TableCell>
                    </TableRow>
                  )}
                  {order.groups.map((g) => (
                    <TableRow key={g.fb_group_id}>
                      <TableCell className="min-w-48 whitespace-normal">
                        <div>{g.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{g.fb_group_id}</div>
                      </TableCell>
                      <TableCell><GroupStatusBadge status={g.status} /></TableCell>
                      <TableCell>{g.account ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{when(g.at)}</TableCell>
                      <TableCell className="min-w-56 whitespace-normal">
                        {g.post_link ? (
                          <a href={g.post_link} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                            เปิดดูโพสต์
                          </a>
                        ) : g.error ? (
                          <span className="text-sm text-muted-foreground">{g.error}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
