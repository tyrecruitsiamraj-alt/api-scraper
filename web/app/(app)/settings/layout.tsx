import { SettingsNav } from './SettingsNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">เลือกหัวข้อที่ต้องการจัดการ</p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
