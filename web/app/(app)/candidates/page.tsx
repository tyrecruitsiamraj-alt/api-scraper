import Link from 'next/link';
import { countCandidates, listCandidates } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };
const PLATFORM_COLOR: Record<string, string> = {
  jobbkk: 'bg-blue-50 text-blue-700',
  jobthai: 'bg-orange-50 text-orange-700',
};

/** Full timestamp for the title attribute (hover). */
function fmtFull(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
}

/** Compact relative label: "เมื่อสักครู่ · 12 นาทีที่แล้ว · 3 ชม.ที่แล้ว · 30 มิ.ย." */
function relTime(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันก่อน`;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: { q?: string; platform?: string; page?: string };
}) {
  const search = searchParams.q?.trim() || undefined;
  const platform = searchParams.platform || undefined;
  const pageNo = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const limit = 40;
  const [rows, total] = await Promise.all([
    listCandidates({ search, platform, limit, offset: (pageNo - 1) * limit }),
    countCandidates({ search, platform }),
  ]);
  const pages = Math.max(1, Math.ceil(total / limit));

  const tab = (key: string, label: string) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (key) params.set('platform', key);
    const active = (platform ?? '') === key;
    return (
      <Link
        key={key || 'all'}
        href={`/candidates${params.toString() ? '?' + params.toString() : ''}`}
        className={`pill ${active ? 'bg-ink text-white' : 'bg-black/5 text-ink hover:bg-black/10'}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ผู้สมัคร</h1>
          <p className="text-sm text-subtle mt-1">{total.toLocaleString()} โปรไฟล์พร้อมใช้งาน</p>
        </div>
        <form className="flex gap-2" action="/candidates" method="get">
          {platform && <input type="hidden" name="platform" value={platform} />}
          <input name="q" defaultValue={search} placeholder="ค้นหาชื่อ / เบอร์ / ตำแหน่ง" className="field w-72" />
          <button className="btn-primary" type="submit">ค้นหา</button>
        </form>
      </div>

      <div className="mb-5 flex gap-2">
        {tab('', 'ทั้งหมด')}
        {tab('jobbkk', 'JobBKK')}
        {tab('jobthai', 'JobThai')}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-subtle">
              <th className="px-5 py-3 font-medium">ชื่อ</th>
              <th className="px-5 py-3 font-medium">ตำแหน่งที่ต้องการ</th>
              <th className="px-5 py-3 font-medium">จังหวัด</th>
              <th className="px-5 py-3 font-medium">ติดต่อ</th>
              <th className="px-5 py-3 font-medium">แหล่งที่มา</th>
              <th className="px-5 py-3 font-medium">อัปเดตล่าสุด</th>
              <th className="px-5 py-3 font-medium text-right">ไฟล์</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-subtle">ยังไม่มีข้อมูลผู้สมัคร</td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-hairline/60 last:border-0 hover:bg-black/[0.02]">
                <td className="px-5 py-3.5">
                  <Link href={`/candidates/${c.id}`} className="font-medium text-ink hover:text-accent">
                    {c.full_name || '(ไม่มีชื่อ)'}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-subtle max-w-[240px] truncate">{c.desired_positions || '—'}</td>
                <td className="px-5 py-3.5 text-subtle">{c.province || '—'}</td>
                <td className="px-5 py-3.5 text-subtle">{c.phone || c.email || '—'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {(c.platforms ?? []).map((p) => (
                      <span key={p} className={`pill ${PLATFORM_COLOR[p] ?? 'bg-black/5'}`}>{PLATFORM_LABEL[p] ?? p}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-subtle whitespace-nowrap" title={fmtFull(c.last_updated_at)}>
                  {relTime(c.last_updated_at)}
                </td>
                <td className="px-5 py-3.5 text-right text-subtle">{c.asset_count || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          {pageNo > 1 && (
            <Link className="btn-ghost" href={`/candidates?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(platform ? { platform } : {}), page: String(pageNo - 1) })}`}>ก่อนหน้า</Link>
          )}
          <span className="text-subtle">หน้า {pageNo} / {pages}</span>
          {pageNo < pages && (
            <Link className="btn-ghost" href={`/candidates?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(platform ? { platform } : {}), page: String(pageNo + 1) })}`}>ถัดไป</Link>
          )}
        </div>
      )}
    </div>
  );
}
