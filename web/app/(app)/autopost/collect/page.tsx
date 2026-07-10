import { AutopostFrame } from '@/components/AutopostFrame';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

export default function AutopostCollectPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">เก็บคอมเมนต์จากโพสต์</h1>
        <p className="mt-1 text-sm text-subtle">ดึงคอมเมนต์/เบอร์ผู้สนใจจากโพสต์ในกลุ่ม Facebook (Lead Collect)</p>
      </div>
      <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="lead_collect" />
    </div>
  );
}
