import Link from 'next/link';
import { AutopostNav } from '@/components/AutopostNav';
import { LeadPostCard } from '@/components/LeadPostCard';
import { leadResultsSummary, leadsByPosition, topLeadPosts } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const RANGES: { key: string; days?: number; label: string }[] = [
  { key: '7', days: 7, label: '7 วัน' },
  { key: '30', days: 30, label: '30 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
];

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-subtle">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${accent ? 'text-accent' : ''}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-subtle">{sub}</div>}
    </div>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ผลลัพธ์ &amp; Leads</h1>
        <p className="mt-1 text-sm text-subtle">เบอร์ผู้สนใจที่เก็บได้จากคอมเมนต์ พร้อมทักกลับ · โพสต์ตำแหน่งไหนได้ผลจริง</p>
      </div>

      <AutopostNav />

      {!summary ? (
        <div className="card px-5 py-10 text-center text-sm text-subtle">
          ยังไม่มีข้อมูลผลลัพธ์ — ตรวจสอบการเชื่อมต่อฐานข้อมูล Auto-Post หรือรอให้ตัวเก็บคอมเมนต์ทำงาน
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Lead ทั้งหมด" value={summary.leads_total.toLocaleString()} sub="เบอร์จากคอมเมนต์ (ตัดซ้ำแล้ว)" accent />
            <Stat label="Lead 7 วัน" value={summary.leads_7d.toLocaleString()} sub={`วันนี้ ${summary.leads_today.toLocaleString()}`} />
            <Stat
              label="โพสต์ที่ได้ Lead"
              value={summary.posts_with_leads.toLocaleString()}
              sub={`จากโพสต์ทั้งหมด ${summary.posts_total.toLocaleString()}`}
            />
            <Stat
              label="ตำแหน่งเด่น"
              value={summary.top_position ?? '—'}
              sub={summary.top_position ? `${summary.top_position_leads.toLocaleString()} เบอร์` : 'ยังไม่มีข้อมูล'}
            />
          </div>

          {/* leads แยกตามตำแหน่ง — ประกาศตำแหน่งไหนดึงคนได้ */}
          {byPosition.length > 0 && (
            <div>
              <h2 className="mb-3 text-base font-semibold">Lead ตามตำแหน่ง</h2>
              <div className="card divide-y divide-hairline">
                {byPosition.map((p) => (
                  <div key={p.position} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-40 shrink-0 truncate text-sm text-ink sm:w-56" title={p.position}>{p.position}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${maxLeads ? Math.max(4, (p.leads / maxLeads) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs text-subtle">
                      <span className="font-semibold tabular-nums text-ink">{p.leads}</span> เบอร์ · {p.posts} โพสต์
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* โพสต์ที่เก็บ lead ได้ — เบอร์พร้อมทักกลับ */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">โพสต์ที่ได้ Lead ({posts.length})</h2>
              <div className="flex items-center gap-1">
                {RANGES.map((r) => (
                  <Link
                    key={r.key}
                    href={r.key === 'all' ? '/autopost/results' : `/autopost/results?days=${r.key}`}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      rangeKey === r.key ? 'bg-accent text-white' : 'text-subtle hover:bg-black/[0.04]'
                    }`}
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
            </div>
            {posts.length === 0 ? (
              <div className="card px-5 py-10 text-center text-sm text-subtle">
                ยังไม่มีโพสต์ที่เก็บ lead ได้ในช่วงนี้ — โพสต์แล้วรอให้ตัวเก็บคอมเมนต์ทำงาน (หน้า “เก็บคอมเมนต์”)
              </div>
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
