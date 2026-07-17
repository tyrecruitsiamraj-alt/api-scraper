import { SettingsNav } from './SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-subtle">เลือกหัวข้อที่ต้องการจัดการ</p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
