import Link from 'next/link';
import { deleteConnectorAction, toggleConnectorAction } from '@/lib/actions';
import { facebookQuotaSummary, listAllConnectors, listProviderLimits } from '@/lib/repo';
import { ProviderLimitsPanel } from '@/components/ProviderLimitsPanel';
import { FacebookQuotaPanel } from '@/components/FacebookQuotaPanel';
import { NewUnifiedConnectorForm } from './NewUnifiedConnectorForm';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, { label: string; avatar: string; letter: string }> = {
  jobbkk: { label: 'JobBKK', avatar: 'bg-blue-500', letter: 'B' },
  jobthai: { label: 'JobThai', avatar: 'bg-orange-500', letter: 'T' },
  facebook: { label: 'Facebook', avatar: 'bg-indigo-600', letter: 'f' },
};

function fmtDate(s: string | null) {
  if (!s) return 'ยังไม่มีข้อมูล';
  return new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function SettingsPage() {
  const [connectors, limits, fbQuota] = await Promise.all([
    listAllConnectors(),
    listProviderLimits(),
    facebookQuotaSummary(),
  ]);
  const scraperCount = connectors.filter((c) => c.platform !== 'facebook').length;
  const facebookCount = connectors.filter((c) => c.platform === 'facebook').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-subtle">จัดการ Connector ทุกระบบจากที่เดียว — Scraping และ Facebook Auto‑Post</p>
        </div>
        <div className="flex gap-2 text-xs text-subtle">
          <span className="pill bg-blue-50 text-blue-700">Scraping {scraperCount}</span>
          <span className="pill bg-indigo-50 text-indigo-700">Facebook {facebookCount}</span>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Connector ทั้งหมด</h2>
            <p className="mt-0.5 text-xs text-subtle">บัญชีเดียวต่อหนึ่ง session/worker lock เพื่อไม่ให้ล็อกอินชนกัน</p>
          </div>
          <span className="text-xs text-subtle">{connectors.length} บัญชี</span>
        </div>

        {connectors.length > 0 ? (
          <div className="card divide-y divide-hairline/50 overflow-hidden">
            {connectors.map((c) => {
              const p = PLATFORM[c.platform] ?? { label: c.platform, avatar: 'bg-gray-500', letter: '?' };
              const cooling = !!c.cooldown_until && new Date(c.cooldown_until) > new Date();
              const paused = !!c.paused_until && new Date(c.paused_until) > new Date();
              const id = c.key.slice(c.key.indexOf(':') + 1);
              return (
                <div key={c.key} className="row">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white ${p.avatar}`}>{p.letter}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-ink">{c.label}</span>
                      <span className="pill bg-black/5 text-subtle">{p.label}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-subtle">
                      {c.username || 'ไม่ระบุผู้ใช้'}
                      {c.platform !== 'facebook' && ` · ล็อกอินล่าสุด ${fmtDate(c.last_login_at)}`}
                      {paused && c.pause_reason ? ` · ${c.pause_reason}` : ''}
                    </div>
                  </div>

                  <div className="hidden min-w-24 text-right sm:block">
                    {c.platform === 'facebook' ? (
                      <>
                        <div className="text-sm tabular-nums text-ink">{c.used_today ?? 0}<span className="text-subtle"> / {c.daily_cap ?? 15}</span></div>
                        <div className="text-[12px] text-subtle">โพสต์วันนี้</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm tabular-nums text-ink">{c.scrape_limit}<span className="text-subtle"> / รอบ</span></div>
                        <div className="text-[12px] text-subtle">{c.daily_cap} / วัน</div>
                      </>
                    )}
                  </div>

                  <div className="w-24 shrink-0 text-center">
                    {cooling || paused ? (
                      <span className="pill bg-amber-50 text-amber-700"><span className="dot bg-amber-500" />พัก</span>
                    ) : c.enabled ? (
                      <span className="pill bg-green-50 text-green-700"><span className="dot bg-green-500" />พร้อม</span>
                    ) : (
                      <span className="pill bg-black/5 text-subtle"><span className="dot bg-gray-400" />ปิด</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {c.platform === 'facebook' ? (
                      <Link href="/autopost/accounts" className="btn-secondary btn-sm">Session / Pin</Link>
                    ) : (
                      <>
                        <form action={toggleConnectorAction}>
                          <input type="hidden" name="id" value={id} />
                          <input type="hidden" name="enabled" value={(!c.enabled).toString()} />
                          <button className="btn-ghost btn-sm">{c.enabled ? 'ปิด' : 'เปิด'}</button>
                        </form>
                        <form action={deleteConnectorAction}>
                          <input type="hidden" name="id" value={id} />
                          <button className="btn-danger btn-sm" aria-label={`ลบ ${c.label}`}>ลบ</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-8 text-center text-sm text-subtle">ยังไม่มี Connector — เพิ่มบัญชีแรกด้านล่าง</div>
        )}

        <NewUnifiedConnectorForm />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold">โควต้าการใช้งาน</h2>
          <p className="mt-0.5 text-xs text-subtle">Scraping คุมรวมระดับแพลตฟอร์ม ส่วน Facebook คุมรายบัญชี</p>
        </div>
        <ProviderLimitsPanel initialLimits={limits} />
        <FacebookQuotaPanel initialFb={fbQuota} />
      </section>
    </div>
  );
}
