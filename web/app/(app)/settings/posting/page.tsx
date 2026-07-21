import { AutopostFrame } from '@/components/AutopostFrame';
import { PostingGroupsManager } from '@/components/PostingGroupsManager';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

const SUB_TABS = [
  { tab: 'templates', label: 'เทมเพลตแคปชั่น' },
  { tab: 'schedules', label: 'ตารางเวลา' },
];

async function autopostIsReady() {
  try {
    const response = await fetch(`${AUTOPOST_URL}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function SettingsPostingPage() {
  const ready = await autopostIsReady();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่าการโพสต์</h1>
        <p className="mt-1 text-sm text-subtle">เลือกกลุ่มให้แต่ละบัญชี และจัดการคลังกลุ่ม Facebook</p>
      </div>

      <PostingGroupsManager />

      <details className="rounded-2xl border border-line bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
          เครื่องมือขั้นสูง — เทมเพลตแคปชั่น · ตารางเวลา
          <span className="ml-2 text-xs font-normal text-subtle">(ใช้เป็นครั้งคราว)</span>
        </summary>
        <div className="border-t border-line p-4">
          {ready ? (
            <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="templates" subTabs={SUB_TABS} />
          ) : (
            <div className="px-6 py-10 text-center text-sm text-subtle">
              บริการ Auto-Post ยังไม่พร้อม — เปิดบริการที่พอร์ต 3100 แล้วรีเฟรช
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
