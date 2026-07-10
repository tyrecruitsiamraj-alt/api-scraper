import { listAllConnectors, listProviderLimits } from '@/lib/repo';
import { deleteConnectorAction, toggleConnectorAction } from '@/lib/actions';
import { ProviderLimitsPanel } from '@/components/ProviderLimitsPanel';
import { NewConnectorForm } from './NewConnectorForm';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, { label: string; avatar: string; initial: string }> = {
  jobbkk: { label: 'JobBKK', avatar: 'bg-blue-500', initial: 'B' },
  jobthai: { label: 'JobThai', avatar: 'bg-orange-500', initial: 'T' },
  facebook: { label: 'Facebook', avatar: 'bg-[#1877F2]', initial: 'f' },
};

function fmtDate(s: string | null) {
  if (!s) return 'ยังไม่เคยล็อกอิน';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** id ดิบสำหรับ action ของ scraper (v_connectors.key = '<platform>:<id>') */
function rawId(key: string) {
  const i = key.indexOf(':');
  return i < 0 ? key : key.slice(i + 1);
}

export default async function ConnectorsPage() {
  const [connectors, limits] = await Promise.all([listAllConnectors(), listProviderLimits()]);

  const fb = connectors.filter((c) => c.platform === 'facebook');
  const fbPaused = fb.filter((c) => c.paused_until && new Date(c.paused_until) > new Date()).length;
  const fbOverCap = fb.filter((c) => (c.used_today ?? 0) > (c.daily_cap ?? 15)).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Connector</h1>
        <p className="mt-1 text-sm text-subtle">
          บัญชีทุกแพลตฟอร์มในที่เดียว — Scraping (JobBKK/JobThai) และ Facebook (Auto-Post) · รหัสผ่านถูกเข้ารหัสก่อนเก็บ
        </p>
      </div>

      {/* connector list */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">บัญชีทั้งหมด</h2>
          <span className="text-xs text-subtle">
            {connectors.length} บัญชี · Facebook {fb.length}
            {fbPaused > 0 && <span className="text-amber-600"> · พัก {fbPaused}</span>}
            {fbOverCap > 0 && <span className="text-red-600"> · เกินโควต้าวันนี้ {fbOverCap}</span>}
          </span>
        </div>

        {connectors.length > 0 && (
          <div className="card divide-y divide-hairline/50 overflow-hidden">
            {connectors.map((c) => {
              const p = PLATFORM[c.platform] ?? { label: c.platform, avatar: 'bg-gray-400', initial: c.platform[0] };
              const isFb = c.platform === 'facebook';
              const cooling = c.cooldown_until && new Date(c.cooldown_until) > new Date();
              const paused = c.paused_until && new Date(c.paused_until) > new Date();
              const overCap = isFb && (c.used_today ?? 0) > (c.daily_cap ?? 15);
              return (
                <div key={c.key} className="row">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white ${p.avatar}`}>
                    {p.initial}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{c.label}</span>
                      <span className="pill bg-black/5 text-subtle">{p.label}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-subtle">
                      {isFb ? (
                        <>{c.username || 'ไม่มีอีเมล'} · โพสต์อัตโนมัติผ่าน Auto-Post</>
                      ) : (
                        <>{c.username} · ล็อกอินล่าสุด {fmtDate(c.last_login_at)}</>
                      )}
                    </div>
                  </div>

                  {/* right stats */}
                  <div className="hidden text-right sm:block">
                    {isFb ? (
                      <>
                        <div className={`text-sm tabular-nums ${overCap ? 'text-red-600' : 'text-ink'}`}>
                          {c.used_today ?? 0}<span className="text-subtle"> / {c.daily_cap ?? 15} วันนี้</span>
                        </div>
                        <div className="text-[13px] tabular-nums text-subtle">โพสต์/บัญชี/วัน</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm tabular-nums text-ink">
                          {c.scrape_limit}<span className="text-subtle"> / รอบ</span>
                        </div>
                        <div className="text-[13px] tabular-nums text-subtle">{c.daily_cap} / วัน</div>
                      </>
                    )}
                  </div>

                  {/* status */}
                  <div className="w-24 shrink-0 text-center">
                    {paused ? (
                      <span className="pill bg-amber-50 text-amber-700"><span className="dot bg-amber-500" />พักบัญชี</span>
                    ) : cooling ? (
                      <span className="pill bg-amber-50 text-amber-700"><span className="dot bg-amber-500" />พัก</span>
                    ) : c.enabled ? (
                      <span className="pill bg-green-50 text-green-700"><span className="dot bg-green-500" />เปิด</span>
                    ) : (
                      <span className="pill bg-black/5 text-subtle"><span className="dot bg-gray-400" />ปิด</span>
                    )}
                  </div>

                  {/* controls: scraper = เปิด/ปิด/ลบ; Facebook = จัดการในแท็บ Auto-Post */}
                  <div className="flex shrink-0 items-center gap-1">
                    {isFb ? (
                      <span className="text-[12px] text-subtle">จัดการที่แท็บ Auto-Post</span>
                    ) : (
                      <>
                        <form action={toggleConnectorAction}>
                          <input type="hidden" name="id" value={rawId(c.key)} />
                          <input type="hidden" name="enabled" value={(!c.enabled).toString()} />
                          <button className="btn-ghost btn-sm">{c.enabled ? 'ปิด' : 'เปิด'}</button>
                        </form>
                        <form action={deleteConnectorAction}>
                          <input type="hidden" name="id" value={rawId(c.key)} />
                          <button className="btn-danger btn-sm" aria-label="ลบ">ลบ</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <NewConnectorForm />
        <p className="text-xs text-subtle">
          * บัญชี Facebook เพิ่ม/แก้ไข/ผูกกลุ่ม ที่แท็บ Auto-Post · เพดานโพสต์ 15/บัญชี/วัน ปรับได้ที่คอลัมน์ daily_cap
        </p>
      </section>

      {/* provider daily caps */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">โควต้าต่อวันระดับแพลตฟอร์ม (Scraping)</h2>
          <p className="mt-0.5 text-xs text-subtle">เพดานรวมของทุกบัญชีในแพลตฟอร์ม — บังคับใช้แบบเข้มในตัว scraper</p>
        </div>
        <ProviderLimitsPanel initialLimits={limits} />
      </section>
    </div>
  );
}
