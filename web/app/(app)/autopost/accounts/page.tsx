import { facebookQuotaSummary, listFbAccountPins, knownWorkerNames } from '@/lib/repo';
import { FacebookQuotaPanel } from '@/components/FacebookQuotaPanel';
import { AutopostFrame } from '@/components/AutopostFrame';
import { setAccountWorkerAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

export default async function AutopostAccountsPage() {
  const [fb, pins, workers] = await Promise.all([facebookQuotaSummary(), listFbAccountPins(), knownWorkerNames()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">บัญชี Facebook</h1>
        <p className="mt-1 text-sm text-subtle">บัญชีสำหรับโพสต์ Auto-Post — โควต้ารายบัญชี + เพิ่ม/แก้ไข/ตรวจ session</p>
      </div>

      {/* โควต้ารายบัญชี (native) */}
      <FacebookQuotaPanel initialFb={fb} />

      {/* Pin บัญชี→เครื่อง: บัญชีวิ่งเครื่องเดิมเสมอ (IP นิ่ง) — ทางฟรีแทน proxy */}
      {pins.length > 0 && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">ผูกบัญชีกับเครื่อง (Pin)</span>
            <span className="text-xs text-subtle">
              ว่าง = เครื่องไหนก็หยิบงานได้ · ผูกแล้วงานของบัญชีจะรอเครื่องนั้นเท่านั้น (เครื่องปิด = งานรอ ไม่ย้ายเครื่อง)
            </span>
          </div>
          <datalist id="known-workers">
            {workers.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {pins.map((a) => (
              <form key={a.id} action={setAccountWorkerAction} className="flex items-center gap-2">
                <input type="hidden" name="accountId" value={a.id} />
                <span className="w-40 shrink-0 truncate text-[13px]" title={a.label}>{a.label}</span>
                <input
                  name="worker"
                  defaultValue={a.preferred_worker ?? ''}
                  placeholder="ชื่อเครื่อง เช่น SONB-RM009"
                  list="known-workers"
                  className="field min-w-0 flex-1 py-1.5 font-mono text-xs"
                />
                <button className="btn-secondary btn-sm shrink-0">บันทึก</button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-subtle">
            ชื่อเครื่อง = ค่า WORKER_NAME (หรือ hostname) ของเครื่องที่รัน worker — ดูได้จากบรรทัดแรกตอน worker เปิด หรือเลือกจากรายชื่อที่ระบบเคยเห็น ·
            ⚠️ ผูกแล้วอย่าย้ายบ่อย: บัญชีเปลี่ยนเครื่อง = เปลี่ยน IP = เสี่ยงโดน Facebook เช็ค
          </p>
        </div>
      )}

      {/* จัดการบัญชี (UI ของ autopost เอง — เพิ่ม/แก้ไข/ตรวจ session) */}
      <div className="space-y-2">
        <h2 className="text-[15px] font-semibold">จัดการบัญชี</h2>
        <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="users" height="calc(100vh - 22rem)" />
      </div>
    </div>
  );
}
