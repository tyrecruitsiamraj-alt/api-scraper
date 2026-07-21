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

export default function SettingsPostingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่าการโพสต์</h1>
        <p className="mt-1 text-sm text-subtle">เนื้อหางาน (Job) · มอบหมายบัญชี→งาน→กลุ่ม · จัดการกลุ่ม · เทมเพลตแคปชั่น · ตารางเวลา</p>
      </div>
      <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="jobs" subTabs={SUB_TABS} />
    </div>
  );
}
