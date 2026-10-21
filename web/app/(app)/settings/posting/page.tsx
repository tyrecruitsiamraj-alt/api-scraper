import { ChevronsUpDownIcon } from 'lucide-react';
import { AutopostFrame } from '@/components/AutopostFrame';
import { PostingGroupsManager } from '@/components/PostingGroupsManager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">ตั้งค่าการโพสต์</h2>
        <p className="text-sm text-muted-foreground">เลือกกลุ่มให้แต่ละบัญชี และจัดการคลังกลุ่ม Facebook</p>
      </div>

      <PostingGroupsManager />

      <Collapsible asChild>
        <Card>
          <CardHeader>
            <CardTitle>เครื่องมือขั้นสูง</CardTitle>
            <CardDescription>เทมเพลตแคปชั่นและตารางเวลา ใช้เป็นครั้งคราว</CardDescription>
            <CardAction>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  เปิด/ซ่อน
                  <ChevronsUpDownIcon data-icon="inline-end" />
                </Button>
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {ready ? (
                <AutopostFrame baseUrl={AUTOPOST_URL} token={AUTOPOST_ACCESS_TOKEN} tab="templates" subTabs={SUB_TABS} />
              ) : (
                <Alert>
                  <AlertDescription>ระบบเผยแพร่ Facebook ยังไม่พร้อม เปิดระบบบนเครื่องหลักแล้วรีเฟรชหน้านี้</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
