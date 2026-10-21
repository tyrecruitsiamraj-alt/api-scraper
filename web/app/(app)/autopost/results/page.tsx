import Link from 'next/link';
import { AutopostNav } from '@/components/AutopostNav';
import { LeadPostCard } from '@/components/LeadPostCard';
import { leadResultsSummary, leadsByPosition, topLeadPosts } from '@/lib/repo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dynamic = 'force-dynamic';

const RANGES: { key: string; days?: number; label: string }[] = [
  { key: '7', days: 7, label: '7 วัน' },
  { key: '30', days: 30, label: '30 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
];

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="truncate text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {sub && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </CardContent>
      )}
    </Card>
  );
}

export default async function AutopostResultsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const rangeKey = searchParams?.days && RANGES.some((r) => r.key === searchParams.days) ? searchParams.days : 'all';
  const range = RANGES.find((r) => r.key === rangeKey)!;

  const [summary, byPosition, posts] = await Promise.all([
    leadResultsSummary(),
    leadsByPosition(10),
    topLeadPosts({ days: range.days, limit: 80 }),
  ]);

  const maxLeads = byPosition.length ? Math.max(...byPosition.map((p) => p.leads)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">ผลลัพธ์และผู้สนใจ</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          เบอร์ผู้สนใจที่เก็บได้จากคอมเมนต์ พร้อมข้อความทักกลับ และดูว่าโพสต์ตำแหน่งไหนได้ผล
        </p>
      </div>

      <AutopostNav />

      {!summary ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>ยังไม่มีข้อมูลผลลัพธ์</EmptyTitle>
            <EmptyDescription>ตรวจการเชื่อมต่อฐานข้อมูล Auto-Post หรือรอให้ตัวเก็บคอมเมนต์ทำงาน</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="ผู้สนใจทั้งหมด" value={summary.leads_total.toLocaleString()} sub="เบอร์จากคอมเมนต์ ตัดเบอร์ซ้ำแล้ว" />
            <Stat label="ผู้สนใจใน 7 วัน" value={summary.leads_7d.toLocaleString()} sub={`วันนี้ ${summary.leads_today.toLocaleString()}`} />
            <Stat
              label="โพสต์ที่ได้ผู้สนใจ"
              value={summary.posts_with_leads.toLocaleString()}
              sub={`จากโพสต์ทั้งหมด ${summary.posts_total.toLocaleString()}`}
            />
            <Stat
              label="ตำแหน่งที่ได้เบอร์มากสุด"
              value={summary.top_position ?? '—'}
              sub={summary.top_position ? `${summary.top_position_leads.toLocaleString()} เบอร์` : 'ยังไม่มีข้อมูล'}
            />
          </div>

          {/* leads แยกตามตำแหน่ง — ประกาศตำแหน่งไหนดึงคนได้ */}
          {byPosition.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>ผู้สนใจแยกตามตำแหน่ง</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ตำแหน่ง</TableHead>
                      <TableHead className="w-1/3">
                        <span className="sr-only">สัดส่วน</span>
                      </TableHead>
                      <TableHead className="text-right">เบอร์</TableHead>
                      <TableHead className="text-right">โพสต์</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byPosition.map((p) => (
                      <TableRow key={p.position}>
                        <TableCell className="max-w-56 truncate" title={p.position}>
                          {p.position}
                        </TableCell>
                        <TableCell>
                          <Progress value={maxLeads ? (p.leads / maxLeads) * 100 : 0} aria-label={`${p.position} ${p.leads} เบอร์`} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{p.leads}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{p.posts}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* โพสต์ที่เก็บ lead ได้ — เบอร์พร้อมทักกลับ */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">โพสต์ที่ได้ผู้สนใจ ({posts.length})</h2>
              <Tabs value={rangeKey} activationMode="manual">
                <TabsList>
                  {RANGES.map((r) => (
                    <TabsTrigger key={r.key} value={r.key} asChild>
                      <Link href={r.key === 'all' ? '/autopost/results' : `/autopost/results?days=${r.key}`}>{r.label}</Link>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {posts.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>ยังไม่มีโพสต์ที่พบผู้สนใจในช่วงนี้</EmptyTitle>
                  <EmptyDescription>หลังโพสต์แล้ว ระบบจะตรวจคอมเมนต์และรวบรวมเบอร์มาไว้ที่นี่</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-3">
                {posts.map((post) => (
                  <LeadPostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
