import { facebookQuotaSummary, listProviderLimits } from '@/lib/repo';
import { ProviderLimitsPanel } from '@/components/ProviderLimitsPanel';
import { FacebookQuotaPanel } from '@/components/FacebookQuotaPanel';

export const dynamic = 'force-dynamic';

/** โควต้าการใช้งาน — แยกออกมาจากหน้าบัญชี (เจ้าของสั่ง 4 พ.ย. 2569) */
export default async function SettingsQuotaPage() {
  const [limits, fbQuota] = await Promise.all([listProviderLimits(), facebookQuotaSummary()]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">โควต้าการใช้งาน</h2>
        <p className="text-sm text-muted-foreground">จำนวนค้นหาผู้สมัครรวมต่อเว็บไซต์ต่อวัน และจำนวนโพสต์ของแต่ละบัญชี Facebook</p>
      </div>
      <ProviderLimitsPanel initialLimits={limits} />
      <FacebookQuotaPanel initialFb={fbQuota} />
    </div>
  );
}
