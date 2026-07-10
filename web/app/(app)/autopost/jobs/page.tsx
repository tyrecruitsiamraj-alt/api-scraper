import { AutopostFrame } from '@/components/AutopostFrame';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

export default function AutopostJobsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">งานโพสต์ (Jobs)</h1>
        <p className="mt-1 text-sm text-subtle">เนื้อหางานที่จะโพสต์ลงกลุ่ม Facebook — หัวข้อ, แคปชั่น, ลิงก์สมัคร</p>
      </div>
      <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="jobs" />
    </div>
  );
}
