import { facebookQuotaSummary } from '@/lib/repo';
import { FacebookQuotaPanel } from '@/components/FacebookQuotaPanel';
import { AutopostFrame } from '@/components/AutopostFrame';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

export default async function AutopostAccountsPage() {
  const fb = await facebookQuotaSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">บัญชี Facebook</h1>
        <p className="mt-1 text-sm text-subtle">บัญชีสำหรับโพสต์ Auto-Post — โควต้ารายบัญชี + เพิ่ม/แก้ไข/ตรวจ session</p>
      </div>

      {/* โควต้ารายบัญชี (native) */}
      <FacebookQuotaPanel initialFb={fb} />

      {/* จัดการบัญชี (UI ของ autopost เอง — เพิ่ม/แก้ไข/ตรวจ session) */}
      <div className="space-y-2">
        <h2 className="text-[15px] font-semibold">จัดการบัญชี</h2>
        <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="users" height="calc(100vh - 22rem)" />
      </div>
    </div>
  );
}
