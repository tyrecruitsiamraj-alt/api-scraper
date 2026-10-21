import { AutopostFrame } from '@/components/AutopostFrame';

export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';

export default function AutopostCollectPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">เก็บคอมเมนต์จากโพสต์</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">ดึงคอมเมนต์และเบอร์ผู้สนใจจากโพสต์ในกลุ่ม Facebook (Lead Collect)</p>
      </div>
      <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="lead_collect" />
    </div>
  );
}
