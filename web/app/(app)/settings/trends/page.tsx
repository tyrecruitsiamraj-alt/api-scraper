import { listContentTrends } from '@/lib/repo';
import { createTrendAction, toggleTrendAction, deleteTrendAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function TrendsSettingsPage() {
  const trends = await listContentTrends();
  const activeCount = trends.filter((t) => t.active).length;
  const pendingCount = trends.filter((t) => t.source === 'discovered' && !t.active).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">เทรนด์ที่กำลังมา</h2>
        <p className="mt-1 text-sm text-subtle">
          ใส่เทรนด์/มีมที่อยากให้คอนเทนต์เกาะกระแส (เช่น “ไอติมอัลตร้าสมูท”) — ตอน AI คิดแคปชัน/รูปจะดึงเทรนด์ที่<b>เปิดอยู่</b>ไปใช้อย่างเนียน
          {activeCount > 0 ? ` · เปิดอยู่ ${activeCount} รายการ` : ''}
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3">
          <div className="eyebrow text-amber-700">ระบบสำรวจกลุ่มแล้วเสนอเทรนด์ใหม่</div>
          <div className="mt-1 text-[13px] text-amber-800">
            มี {pendingCount} เทรนด์ที่ระบบค้นเจอจากกลุ่ม FB รอคุณกด “เปิด” เพื่ออนุมัติให้เอาไปใช้ (ตรวจก่อนว่าเข้ากับแบรนด์)
          </div>
        </div>
      )}

      {/* เพิ่มเทรนด์ */}
      <form action={createTrendAction} className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <div>
            <label className="label" htmlFor="trend-label">เทรนด์ / มีม</label>
            <input id="trend-label" name="label" required placeholder="เช่น ไอติมอัลตร้าสมูท" className="field w-full" />
          </div>
          <div>
            <label className="label" htmlFor="trend-note">วิธีเกาะ / บริบท (ไม่บังคับ)</label>
            <input id="trend-note" name="note" placeholder="เช่น ใช้มุกเนียน ๆ กับพาดหัว" className="field w-full" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="forCaption" defaultChecked className="h-4 w-4 accent-[var(--accent,#e41c24)]" />
            ใช้กับแคปชัน
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="forImage" defaultChecked className="h-4 w-4 accent-[var(--accent,#e41c24)]" />
            ใช้กับรูป
          </label>
          <button className="btn-primary btn-sm ml-auto">เพิ่มเทรนด์</button>
        </div>
      </form>

      {/* รายการเทรนด์ */}
      {trends.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-subtle">
          ยังไม่มีเทรนด์ — เพิ่มด้านบนเพื่อให้คอนเทนต์เกาะกระแส (ถ้ายังไม่เห็นผล ตรวจว่ารัน migrate ที่ worker แล้ว)
        </div>
      ) : (
        <div className="card divide-y divide-hairline">
          {trends.map((t) => (
            <div key={t.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${t.active ? '' : 'opacity-55'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{t.label}</span>
                  {t.active ? (
                    <span className="pill bg-emerald-50 text-emerald-700">เปิด</span>
                  ) : (
                    <span className="pill bg-black/5 text-subtle">ปิด</span>
                  )}
                  {t.source === 'discovered' && (
                    <span className={`pill text-[11px] ${t.active ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                      {t.active ? 'ระบบเสนอ' : 'ระบบเสนอ · รออนุมัติ'}
                    </span>
                  )}
                  {t.for_caption && <span className="pill bg-black/[0.04] text-[11px] text-subtle">แคปชัน</span>}
                  {t.for_image && <span className="pill bg-black/[0.04] text-[11px] text-subtle">รูป</span>}
                </div>
                {t.note && <div className="mt-0.5 text-xs text-subtle">{t.note}</div>}
              </div>
              <form action={toggleTrendAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="active" value={(!t.active).toString()} />
                <button className="btn-ghost btn-sm">{t.active ? 'ปิด' : t.source === 'discovered' ? 'อนุมัติ' : 'เปิด'}</button>
              </form>
              <form action={deleteTrendAction}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50">ลบ</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-subtle">
        เทรนด์มีอายุสั้น — ปิด/ลบตัวที่ตกกระแสแล้วเพื่อไม่ให้คอนเทนต์ดูเอาต์. โค้ดฝั่ง worker ต้อง <code>npm run migrate</code> + restart ก่อนถึงจะดึงเทรนด์ไปใช้
      </p>
    </div>
  );
}
