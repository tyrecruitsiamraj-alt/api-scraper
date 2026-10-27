import { Fragment } from 'react';
import { deleteConnectorAction, deleteFacebookAccountAction, setAccountWorkerAction, toggleConnectorAction } from '@/lib/actions';
import { facebookQuotaSummary, knownWorkerNames, listAllConnectors, listProviderLimits } from '@/lib/repo';
import { ProviderLimitsPanel } from '@/components/ProviderLimitsPanel';
import { FacebookQuotaPanel } from '@/components/FacebookQuotaPanel';
import { ConnectorEditButton } from '@/components/ConnectorEditButton';
import { NewUnifiedConnectorForm } from '../NewUnifiedConnectorForm';
import { UserRoundIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, { label: string; letter: string }> = {
  jobbkk: { label: 'JobBKK', letter: 'B' },
  jobthai: { label: 'JobThai', letter: 'T' },
  facebook: { label: 'Facebook', letter: 'f' },
};

function fmtDate(s: string | null) {
  if (!s) return 'ยังไม่มีข้อมูล';
  return new Date(s).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
}

export default async function SettingsConnectorsPage() {
  const [connectors, limits, fbQuota, workers] = await Promise.all([
    listAllConnectors(),
    listProviderLimits(),
    facebookQuotaSummary(),
    knownWorkerNames(),
  ]);
  const scraperCount = connectors.filter((c) => c.platform !== 'facebook').length;
  const facebookCount = connectors.filter((c) => c.platform === 'facebook').length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">บัญชีที่ใช้งาน</h2>
          <p className="text-sm text-muted-foreground">เพิ่มและดูแลบัญชีที่ใช้ค้นหาผู้สมัครและโพสต์ลง Facebook</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">ค้นหาผู้สมัคร {scraperCount}</Badge>
          <Badge variant="secondary">Facebook {facebookCount}</Badge>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-semibold">บัญชีทั้งหมด</h3>
            <p className="text-sm text-muted-foreground">แต่ละบัญชีทำงานทีละงาน จะได้ไม่ล็อกอินซ้อนกัน</p>
          </div>
          <span className="text-sm text-muted-foreground">{connectors.length} บัญชี</span>
        </div>

        {connectors.length > 0 ? (
          <Card className="py-0">
            <ItemGroup className="gap-0">
              {connectors.map((c, index) => {
                const p = PLATFORM[c.platform] ?? { label: c.platform, letter: '?' };
                const cooling = !!c.cooldown_until && new Date(c.cooldown_until) > new Date();
                const paused = !!c.paused_until && new Date(c.paused_until) > new Date();
                const id = c.key.slice(c.key.indexOf(':') + 1);
                return (
                  <Fragment key={c.key}>
                    {index > 0 && <ItemSeparator className="my-0" />}
                    <Item role="listitem" className="rounded-none px-4 py-3">
                      <ItemMedia>
                        <Avatar size="lg">
                          <AvatarFallback className="font-semibold">{p.letter}</AvatarFallback>
                        </Avatar>
                      </ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle>
                          <span className="truncate">{c.label}</span>
                          <Badge variant="outline">{p.label}</Badge>
                        </ItemTitle>
                        <ItemDescription className="line-clamp-1">
                          {c.username || 'ไม่ระบุผู้ใช้'}
                          {c.platform !== 'facebook' && ` · ล็อกอินล่าสุด ${fmtDate(c.last_login_at)}`}
                          {paused && c.pause_reason ? ` · ${c.pause_reason}` : ''}
                          {c.platform === 'facebook' && ` · เครื่องประจำ: ${c.preferred_worker || 'ยังไม่ได้เลือก'}`}
                        </ItemDescription>
                      </ItemContent>

                      <div className="hidden min-w-24 flex-col items-end text-right sm:flex">
                        {c.platform === 'facebook' ? (
                          <>
                            <span className="text-sm tabular-nums">{c.used_today ?? 0}<span className="text-muted-foreground"> / {c.daily_cap ?? 15}</span></span>
                            <span className="text-xs text-muted-foreground">โพสต์วันนี้</span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm tabular-nums">{c.scrape_limit}<span className="text-muted-foreground"> / รอบ</span></span>
                            <span className="text-xs text-muted-foreground">{c.daily_cap} / วัน</span>
                          </>
                        )}
                      </div>

                      <div className="flex w-16 shrink-0 justify-center">
                        {cooling || paused ? (
                          <Badge variant="outline">พัก</Badge>
                        ) : c.enabled ? (
                          <Badge variant="secondary">พร้อม</Badge>
                        ) : (
                          <Badge variant="ghost" className="text-muted-foreground">ปิด</Badge>
                        )}
                      </div>

                      <ItemActions className="flex-wrap justify-end gap-1">
                        {c.platform === 'facebook' ? (
                          <>
                            <form action={setAccountWorkerAction} className="flex items-center gap-1">
                              <input type="hidden" name="accountId" value={id} />
                              <Input
                                name="worker"
                                defaultValue={c.preferred_worker ?? ''}
                                placeholder="ชื่อเครื่อง"
                                list="known-facebook-workers"
                                className="h-7 w-28 font-mono"
                                aria-label={`เครื่องสำหรับ ${c.label}`}
                              />
                              <Button variant="secondary" size="sm" type="submit">บันทึกเครื่อง</Button>
                            </form>
                            <ConnectorEditButton id={id} platform="facebook" label={c.label} username={c.username ?? ''} skipWarmup={Boolean(c.skip_warmup)} hasPassword={Boolean(c.has_password)} />
                            <form action={deleteFacebookAccountAction}>
                              <input type="hidden" name="id" value={id} />
                              <Button variant="destructive" size="sm" type="submit" aria-label={`ลบ ${c.label}`}>ลบ</Button>
                            </form>
                          </>
                        ) : (
                          <>
                            <form action={toggleConnectorAction}>
                              <input type="hidden" name="id" value={id} />
                              <input type="hidden" name="enabled" value={(!c.enabled).toString()} />
                              <Button variant="ghost" size="sm" type="submit">{c.enabled ? 'ปิด' : 'เปิด'}</Button>
                            </form>
                            <ConnectorEditButton id={id} platform={c.platform} label={c.label} username={c.username ?? ''} hasPassword={Boolean(c.has_password)} />
                            <form action={deleteConnectorAction}>
                              <input type="hidden" name="id" value={id} />
                              <Button variant="destructive" size="sm" type="submit" aria-label={`ลบ ${c.label}`}>ลบ</Button>
                            </form>
                          </>
                        )}
                      </ItemActions>
                    </Item>
                  </Fragment>
                );
              })}
            </ItemGroup>
          </Card>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><UserRoundIcon /></EmptyMedia>
              <EmptyTitle>ยังไม่มีบัญชี</EmptyTitle>
              <EmptyDescription>เพิ่มบัญชีแรกได้ที่ปุ่มด้านล่าง</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <datalist id="known-facebook-workers">
          {workers.map((worker) => <option key={worker} value={worker} />)}
        </datalist>
        <NewUnifiedConnectorForm workers={workers} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold">โควต้าการใช้งาน</h3>
          <p className="text-sm text-muted-foreground">กำหนดจำนวนค้นหาผู้สมัครรวมต่อเว็บไซต์ และจำนวนโพสต์ของแต่ละบัญชี Facebook</p>
        </div>
        <ProviderLimitsPanel initialLimits={limits} />
        <FacebookQuotaPanel initialFb={fbQuota} />
      </section>
    </div>
  );
}
