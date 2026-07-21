import { AutopostFrame } from '@/components/AutopostFrame';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

const SUB_TABS = [
  { tab: 'jobs', label: 'เนื้อหางาน (Job)' },
  { tab: 'assignments', label: 'มอบหมาย (บัญชี→งาน→กลุ่ม)' },
  { tab: 'groups', label: 'กลุ่ม Facebook' },
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่าการโพสต์</h1>
        <p className="mt-1 text-sm text-subtle">เนื้อหางาน (Job) · มอบหมายบัญชี→งาน→กลุ่ม · จัดการกลุ่ม · เทมเพลตแคปชั่น · ตารางเวลา</p>
      </div>
      {ready ? (
        <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="jobs" subTabs={SUB_TABS} />
      ) : (
        <div className="card px-6 py-12 text-center">
          <div className="text-base font-semibold text-ink">บริการ Auto-Post ยังไม่พร้อมใช้งาน</div>
          <p className="mx-auto mt-2 max-w-xl text-sm text-subtle">
            เปิดบริการ Auto-Post ที่พอร์ต 3100 แล้วรีเฟรชหน้านี้ การตั้งค่าเดิมและคิวงานจะไม่หาย
          </p>
        </div>
      )}
    </div>
  );
}
