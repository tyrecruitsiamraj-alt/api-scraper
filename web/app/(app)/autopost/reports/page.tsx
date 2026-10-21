import { AutopostFrame } from '@/components/AutopostFrame';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

export default function AutopostReportsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">รายงาน Auto-Post</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">สรุปผลการโพสต์และ lead ที่เก็บได้ แยกตามงาน กลุ่ม และบัญชี</p>
      </div>
      <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="reports" />
    </div>
  );
}
