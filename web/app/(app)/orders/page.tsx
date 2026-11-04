import Link from 'next/link';
import { AutoSubmitSelect } from '@/components/AutoSubmitSelect';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ORDER_RANGES, ORDER_TYPES, listOrderLog, summarizeOrders } from '@/lib/order-log';
import type { OrderLogRow, OrderRange } from '@/lib/order-log';
import { OUTCOMES } from '../../../../src/core/order-outcome.js';
import type { OrderOutcomeKey } from '../../../../src/core/order-outcome.js';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 300;

function shortName(who: string) {
  return who.replace(/@siamraj\.com$/i, '');
}

function when(iso: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function OutcomeBadge({ outcome }: { outcome: OrderOutcomeKey }) {
  const label = OUTCOMES.find((o) => o.key === outcome)?.label ?? outcome;
  return (
    <Badge
      variant={outcome === 'failed' ? 'destructive' : outcome === 'working' ? 'secondary' : 'outline'}
      className={cn(
        outcome === 'done' && 'border-success/30 bg-success/10 text-success',
        (outcome === 'partial' || outcome === 'waiting') && 'border-warning/30 bg-warning/10 text-warning',
      )}
    >
      {label}
    </Badge>
  );
}

function gotText(r: OrderLogRow) {
  if (r.type === 'content') return `${r.got} กลุ่ม`;
  return r.target ? `${r.got}/${r.target} คน` : `${r.got} คน`;
}

export default async function OrdersPage(props: {
  searchParams?: Promise<{ range?: string; type?: string; by?: string; outcome?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const range: OrderRange = ORDER_RANGES.some((r) => r.value === sp.range) ? (sp.range as OrderRange) : 'today';
  const type = sp.type === 'content' || sp.type === 'scraping' ? sp.type : '';
  const by = typeof sp.by === 'string' ? sp.by.trim().toLowerCase() : '';
  const outcome = OUTCOMES.some((o) => o.key === sp.outcome) ? (sp.outcome as OrderOutcomeKey) : null;

  const rows = await listOrderLog(range, type);
  const { people, total } = summarizeOrders(rows);
  const listed = rows.filter((r) => (!by || r.who === by) && (!outcome || r.outcome === outcome));

  const href = (next: { by?: string; outcome?: string | null }) => {
    const p = new URLSearchParams();
    if (range !== 'today') p.set('range', range);
    if (type) p.set('type', type);
    if (next.by) p.set('by', next.by);
    if (next.outcome) p.set('outcome', next.outcome);
    const s = p.toString();
    return s ? `/orders?${s}` : '/orders';
  };
  const rangeLabel = ORDER_RANGES.find((r) => r.value === range)?.label ?? '';

  const countCell = (who: string | undefined, key: OrderOutcomeKey, n: number) =>
    n > 0 ? (
      <Link href={href({ by: who, outcome: key })} className="underline-offset-4 hover:underline">
        {n}
      </Link>
    ) : (
      <span className="text-muted-foreground">0</span>
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl leading-snug font-semibold">คำสั่งงาน</h1>
        <form method="get" action="/orders" className="flex flex-wrap items-end gap-3">
          {by && <input type="hidden" name="by" value={by} />}
          <Field className="w-40">
            <FieldLabel htmlFor="orders-range">ช่วงเวลา</FieldLabel>
            <AutoSubmitSelect id="orders-range" name="range" defaultValue={range} options={ORDER_RANGES.map((r) => ({ value: r.value, label: r.label }))} />
          </Field>
          <Field className="w-36">
            <FieldLabel htmlFor="orders-type">ประเภท</FieldLabel>
            <AutoSubmitSelect id="orders-type" name="type" defaultValue={type} options={ORDER_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Field>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ใครสั่งเท่าไหร่ · {rangeLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>คนสั่ง</TableHead>
                <TableHead className="text-right">ทั้งหมด</TableHead>
                {OUTCOMES.map((o) => (
                  <TableHead key={o.key} className="text-right">{o.label}</TableHead>
                ))}
                <TableHead className="text-right">กลุ่มที่โพสต์ขึ้น</TableHead>
                <TableHead className="text-right">คนที่ Scrap ได้</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.length === 0 && (
                <TableRow>
                  <TableCell colSpan={OUTCOMES.length + 4} className="text-muted-foreground">
                    ยังไม่มีใครสั่งงานในช่วงนี้
                  </TableCell>
                </TableRow>
              )}
              {people.map((p) => (
                <TableRow key={p.who} data-state={by === p.who ? 'selected' : undefined}>
                  <TableCell>
                    <Link href={href({ by: p.who })} className="font-medium underline-offset-4 hover:underline">
                      {shortName(p.who)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-medium">{p.total}</TableCell>
                  {OUTCOMES.map((o) => (
                    <TableCell key={o.key} className="text-right">{countCell(p.who, o.key, p.counts[o.key])}</TableCell>
                  ))}
                  <TableCell className="text-right">{p.posted_groups}</TableCell>
                  <TableCell className="text-right">{p.candidates}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>
                  <Link href={href({})} className="underline-offset-4 hover:underline">รวม {people.length} คน</Link>
                </TableCell>
                <TableCell className="text-right">{total.total}</TableCell>
                {OUTCOMES.map((o) => (
                  <TableCell key={o.key} className="text-right">{countCell(undefined, o.key, total.counts[o.key])}</TableCell>
                ))}
                <TableCell className="text-right">{total.posted_groups}</TableCell>
                <TableCell className="text-right">{total.candidates}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            รายการ{by ? ` ของ ${shortName(by)}` : 'ทั้งหมด'}
            {outcome ? ` · ${OUTCOMES.find((o) => o.key === outcome)?.label}` : ''} ({listed.length} ใบ)
          </CardTitle>
          {(by || outcome) && (
            <Link href={href({})} className="text-sm underline-offset-4 hover:underline">
              ดูทุกคน
            </Link>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เวลาสั่ง</TableHead>
                <TableHead>คนสั่ง</TableHead>
                <TableHead>ใบขอ</TableHead>
                <TableHead>งาน</TableHead>
                <TableHead>ขั้นตอน</TableHead>
                <TableHead>ผล</TableHead>
                <TableHead className="text-right">ได้</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">ไม่มีรายการ</TableCell>
                </TableRow>
              )}
              {listed.slice(0, LIST_LIMIT).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{when(r.created_at)}</TableCell>
                  <TableCell>{shortName(r.who)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={r.type === 'scraping' && r.task_id ? `/scraping/${r.task_id}` : '/autopost/jobs'}
                      className="font-mono text-xs underline-offset-4 hover:underline"
                    >
                      {r.request_no}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-40 whitespace-normal">
                    {r.type === 'scraping' ? 'Scrap' : 'โพสต์'}
                    {r.position && <span className="text-muted-foreground"> · {r.position}</span>}
                    {r.account && <div className="text-xs text-muted-foreground">บัญชี {r.account}</div>}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    {r.stage}
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes.slice(0, 160)}</div>}
                  </TableCell>
                  <TableCell><OutcomeBadge outcome={r.outcome} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">{gotText(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {listed.length > LIST_LIMIT && (
            <p className="mt-3 text-sm text-muted-foreground">แสดง {LIST_LIMIT} ใบล่าสุด จาก {listed.length} ใบ</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
