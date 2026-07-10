import { listConnectors, listProviderLimits } from '@/lib/repo';
import { deleteConnectorAction, toggleConnectorAction } from '@/lib/actions';
import { ProviderLimitsPanel } from '@/components/ProviderLimitsPanel';
import { NewConnectorForm } from './NewConnectorForm';

export const dynamic = 'force-dynamic';

// โหมด Scraping: บัญชี scraper เท่านั้น (JobBKK/JobThai) — บัญชี Facebook อยู่ที่โหมด Auto-Post
const PLATFORM: Record<string, { label: string; avatar: string }> = {
  jobbkk: { label: 'JobBKK', avatar: 'bg-blue-500' },
  jobthai: { label: 'JobThai', avatar: 'bg-orange-500' },
};

function fmtDate(s: string | null) {
  if (!s) return 'ยังไม่เคยล็อกอิน';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function ConnectorsPage() {
  const [connectors, limits] = await Promise.all([listConnectors(), listProviderLimits()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Connector</h1>
        <p className="mt-1 text-sm text-subtle">บัญชีแพลตฟอร์มสำหรับดึงข้อมูล (JobBKK / JobThai) — รหัสผ่านถูกเข้ารหัสก่อนเก็บลงฐานข้อมูล</p>
      </div>

      {/* connector list */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">บัญชีทั้งหมด</h2>
          <span className="text-xs text-subtle">{connectors.length} บัญชี</span>
        </div>

        {connectors.length > 0 && (
          <div className="card divide-y divide-hairline/50 overflow-hidden">
            {connectors.map((c) => {
              const p = PLATFORM[c.platform] ?? { label: c.platform, avatar: 'bg-gray-400' };
              const cooling = c.cooldown_until && new Date(c.cooldown_until) > new Date();
              return (
                <div key={c.id} className="row">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white ${p.avatar}`}>
                    {p.label.slice(3, 4) || p.label[0]}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{c.label}</span>
                      <span className="pill bg-black/5 text-subtle">{p.label}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-subtle">
                      {c.username} · ล็อกอินล่าสุด {fmtDate(c.last_login_at)}
                    </div>
                  </div>

                  <div className="hidden text-right sm:block">
                    <div className="text-sm tabular-nums text-ink">
                      {c.scrape_limit}<span className="text-subtle"> / รอบ</span>
                    </div>
                    <div className="text-[13px] tabular-nums text-subtle">{c.daily_cap} / วัน</div>
                  </div>

                  <div className="w-24 shrink-0 text-center">
                    {cooling ? (
                      <span className="pill bg-amber-50 text-amber-700"><span className="dot bg-amber-500" />พัก</span>
                    ) : c.enabled ? (
                      <span className="pill bg-green-50 text-green-700"><span className="dot bg-green-500" />เปิด</span>
                    ) : (
                      <span className="pill bg-black/5 text-subtle"><span className="dot bg-gray-400" />ปิด</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <form action={toggleConnectorAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="enabled" value={(!c.enabled).toString()} />
                      <button className="btn-ghost btn-sm">{c.enabled ? 'ปิด' : 'เปิด'}</button>
                    </form>
                    <form action={deleteConnectorAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn-danger btn-sm" aria-label="ลบ">ลบ</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <NewConnectorForm />
      </section>

      {/* provider daily caps */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">โควต้าต่อวันระดับแพลตฟอร์ม</h2>
          <p className="mt-0.5 text-xs text-subtle">เพดานรวมของทุกบัญชีในแพลตฟอร์ม — บังคับใช้แบบเข้มในตัว scraper</p>
        </div>
        <ProviderLimitsPanel initialLimits={limits} />
      </section>
    </div>
  );
}
