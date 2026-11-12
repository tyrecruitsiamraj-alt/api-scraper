import Link from 'next/link';
import { DownloadIcon } from 'lucide-react';
import { GroupStatusBadge } from '@/components/GroupStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listPostGroupRows, parseDay } from '@/lib/order-log';
import { GROUP_STATUSES } from '../../../../../src/core/order-groups.js';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
/** เจ้าของเคาะ 11 พ.ย. 2569: เปิดมาเริ่มที่ 1 ต.ค. 2569 */
const DEFAULT_FROM = '2026-10-01';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function when(iso: string | null) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** เลขหน้าที่โชว์: หน้าแรก หน้าสุดท้าย และรอบ ๆ หน้าปัจจุบัน — ช่องว่างเป็น null */
function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

/** ใบโพสต์จาก Jarvis แตกเป็นรายกลุ่ม: ใครสั่ง · บัญชีไหน · กลุ่มไหน · งานอะไร · วันที่ · ผล · ลิงก์ */
export default async function OrderGroupsPage(props: {
  searchParams?: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  let from = parseDay(sp.from) ?? DEFAULT_FROM;
  let to = parseDay(sp.to) ?? today();
  if (from > to) [from, to] = [to, from];

  const rows = await listPostGroupRows(from, to);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = Object.fromEntries(GROUP_STATUSES.map((s) => [s.key, rows.filter((r) => r.status === s.key).length]));

  const query = (p: number) => `/orders/groups?${new URLSearchParams({ from, to, page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/orders" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          คำสั่งงาน
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl leading-snug font-semibold">โพสต์รายกลุ่ม</h1>
          <form method="get" action="/orders/groups" className="flex flex-wrap items-end gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor="groups-from">ตั้งแต่</FieldLabel>
              <Input id="groups-from" name="from" type="date" defaultValue={from} />
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="groups-to">ถึง</FieldLabel>
              <Input id="groups-to" name="to" type="date" defaultValue={to} />
            </Field>
            <Button type="submit" variant="outline">ดู</Button>
            <Button asChild>
              <a href={`/api/orders/groups/export?${new URLSearchParams({ from, to })}`}>
                <DownloadIcon data-icon="inline-start" />
                โหลด Excel
              </a>
            </Button>
          </form>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Card size="sm">
          <CardHeader>
            <CardDescription>สั่งทั้งหมด</CardDescription>
            <CardTitle className="text-2xl">{rows.length} กลุ่ม</CardTitle>
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

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>คนสั่ง</TableHead>
                <TableHead>บัญชี</TableHead>
                <TableHead>กลุ่ม</TableHead>
                <TableHead>งาน</TableHead>
                <TableHead>วันที่สั่ง</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>ลิงก์ / เหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">ไม่มีการสั่งโพสต์ในช่วงนี้</TableCell>
                </TableRow>
              )}
              {shown.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.who_name}</TableCell>
                  <TableCell>{r.account ?? '-'}</TableCell>
                  <TableCell className="min-w-48 whitespace-normal">{r.group_name}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal">
                    <Link href={`/orders/${r.order_id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {r.request_no}
                    </Link>
                    {r.position && <div className="text-xs text-muted-foreground">{r.position}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{when(r.ordered_at)}</TableCell>
                  <TableCell>
                    <GroupStatusBadge status={r.status} />
                    {r.at && <div className="mt-1 text-xs whitespace-nowrap text-muted-foreground">{when(r.at)}</div>}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    {r.post_link ? (
                      <a href={r.post_link} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        เปิดดูโพสต์
                      </a>
                    ) : r.error ? (
                      <span className="text-sm text-muted-foreground">{r.error}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col items-center gap-2">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text="ก่อนหน้า"
                    href={query(page - 1)}
                    aria-disabled={page <= 1}
                    className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                  />
                </PaginationItem>
                {pageList(page, pages).map((p, i) =>
                  p === null ? (
                    <PaginationItem key={`gap-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink href={query(p)} isActive={p === page}>
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    text="ถัดไป"
                    href={query(page + 1)}
                    aria-disabled={page >= pages}
                    className={page >= pages ? 'pointer-events-none opacity-50' : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
            <p className="text-sm text-muted-foreground">
              หน้า {page} จาก {pages} · ทั้งหมด {rows.length} กลุ่ม
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
