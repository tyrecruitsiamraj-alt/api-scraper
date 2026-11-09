import { Fragment } from 'react';
import Link from 'next/link';
import { deleteConnectorAction, deleteFacebookAccountAction, setAccountProvinceAction, setAccountWorkerAction, toggleConnectorAction } from '@/lib/actions';
import { knownWorkerNames, listAllConnectors } from '@/lib/repo';
import type { UnifiedConnectorRow } from '@/lib/repo';
import { ConnectorEditButton } from '@/components/ConnectorEditButton';
import { NewUnifiedConnectorForm } from '../NewUnifiedConnectorForm';
import { BusinessUnitSection } from '@/components/BusinessUnitSection';
import { groupByBusinessUnit } from '@/lib/business-units';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

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

type AccountState = 'ready' | 'full' | 'offline' | 'paused' | 'verify' | 'off';

/**
 * สถานะเป็นคำ — เรียงจากเหตุที่หนักสุดลงมา
 * "พร้อม" ต้องโพสต์ได้จริงตอนนี้: ไม่ติดยืนยันตัวตน ไม่ถูกพัก ยังไม่เต็มโควต้าวันนี้ และเครื่องที่ผูกไว้ยังออนไลน์
 */
function accountState(c: UnifiedConnectorRow): AccountState {
  const now = Date.now();
  if (c.needs_verification) return 'verify';
  if ((c.cooldown_until && new Date(c.cooldown_until).getTime() > now) || (c.paused_until && new Date(c.paused_until).getTime() > now)) return 'paused';
  if (!c.enabled) return 'off';
  if (c.daily_cap !== null && c.used_today !== null && c.used_today >= c.daily_cap) return 'full';
  if (c.platform === 'facebook' && c.worker_online === false) return 'offline';
  return 'ready';
}
const STATE_LABEL: Record<AccountState, string> = {
  ready: 'พร้อม',
  full: 'เต็มโควต้าวันนี้',
  offline: 'เครื่องออฟไลน์',
  paused: 'พัก',
  verify: 'ต้องยืนยันตัวตน',
  off: 'ปิด',
};
/** วันเวลาที่บัญชีกลับมาโพสต์ได้ (เวลาไทย) เช่น "12 พ.ย. 08:20" — เจ้าของ 9 พ.ย. 2569: บัญชีที่พักต้องบอกว่ากลับมาเมื่อไร */
function backDate(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

const STATE_RANK: Record<AccountState, number> = { ready: 0, full: 1, offline: 2, paused: 3, verify: 4, off: 5 };

/** โควต้าที่เหลือวันนี้ — บัญชีที่ไม่คุมโควต้าถือว่าเหลือ 0 เพื่อไม่ให้แซงบัญชีโพสต์ */
function roomLeft(c: UnifiedConnectorRow): number {
  if (c.daily_cap === null || c.used_today === null) return 0;
  return Math.max(0, c.daily_cap - c.used_today);
}

function provincesOf(c: UnifiedConnectorRow): string[] {
  return String(c.province ?? '').split(/[,،]/).map((v) => v.trim()).filter(Boolean);
}

export default async function SettingsConnectorsPage({ searchParams }: { searchParams: Promise<{ platform?: string; state?: string; province?: string }> }) {
  const params = await searchParams;
  const [connectors, workers] = await Promise.all([listAllConnectors(), knownWorkerNames()]);
  const platformFilter = ['facebook', 'jobthai', 'jobbkk'].includes(String(params.platform)) ? String(params.platform) : '';
  const stateFilter = ['ready', 'full', 'offline', 'paused', 'verify', 'off'].includes(String(params.state)) ? (String(params.state) as AccountState) : '';
  const provinceFilter = String(params.province ?? '').trim();
  const allProvinces = [...new Set(connectors.flatMap(provincesOf))].sort((a, b) => a.localeCompare(b, 'th'));
  // ใช้ได้ขึ้นก่อน ตัวที่ใช้ไม่ได้ตกลงล่าง (เจ้าของ 4 พ.ย. 2569: ให้โฟกัสเฉพาะที่ใช้ได้)
  const visible = connectors
    .filter((c) => !platformFilter || c.platform === platformFilter)
    .filter((c) => !stateFilter || accountState(c) === stateFilter)
    .filter((c) => !provinceFilter || (provinceFilter === '__none__' ? provincesOf(c).length === 0 : provincesOf(c).includes(provinceFilter)))
    // ใช้ได้ขึ้นก่อน และในกลุ่มที่ใช้ได้ ตัวที่เหลือโควต้าวันนี้มากสุดขึ้นก่อน (ตัวที่ควรรันก่อน)
    .sort((a, b) => STATE_RANK[accountState(a)] - STATE_RANK[accountState(b)] || roomLeft(b) - roomLeft(a));
  const countOf = (platform: string) => connectors.filter((c) => c.platform === platform).length;
  const readyOf = (platform: string) => connectors.filter((c) => c.platform === platform && accountState(c) === 'ready').length;
  const filterHref = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ platform: platformFilter, state: stateFilter, province: provinceFilter, ...patch });
    for (const [k, v] of [...next.entries()]) if (!v) next.delete(k);
    const qs = next.toString();
    return qs ? `/settings/connectors?${qs}` : '/settings/connectors';
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">บัญชีที่ใช้งาน</h2>
          <p className="text-sm text-muted-foreground">เพิ่มและดูแลบัญชีที่ใช้ค้นหาผู้สมัครและโพสต์ลง Facebook · โควต้าย้ายไปแท็บ โควต้าการใช้งาน</p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-semibold">บัญชีแยกตามธุรกิจ</h3>
            <p className="text-sm text-muted-foreground">แต่ละบัญชีทำงานทีละงาน จะได้ไม่ล็อกอินซ้อนกัน · บัญชีที่พร้อมใช้ขึ้นก่อน</p>
          </div>
          <span className="text-sm text-muted-foreground">แสดง {visible.length} จาก {connectors.length} บัญชี</span>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="แยกตามแหล่ง">
          {[
            { code: '', label: `ทั้งหมด ${connectors.length}` },
            { code: 'facebook', label: `Facebook ${countOf('facebook')} · พร้อม ${readyOf('facebook')}` },
            { code: 'jobthai', label: `JobThai ${countOf('jobthai')} · พร้อม ${readyOf('jobthai')}` },
            { code: 'jobbkk', label: `JobBKK ${countOf('jobbkk')} · พร้อม ${readyOf('jobbkk')}` },
          ].map((p) => (
            <Button key={p.code || 'all'} asChild size="sm" variant={platformFilter === p.code ? 'default' : 'outline'}>
              <Link href={filterHref({ platform: p.code })}>{p.label}</Link>
            </Button>
          ))}
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
          {platformFilter && <input type="hidden" name="platform" value={platformFilter} />}
          <Field className="w-44">
            <FieldLabel htmlFor="acc-filter-state">สถานะ</FieldLabel>
            <NativeSelect id="acc-filter-state" name="state" size="sm" defaultValue={stateFilter} className="w-full">
              <NativeSelectOption value="">ทุกสถานะ</NativeSelectOption>
              <NativeSelectOption value="ready">พร้อมใช้งาน</NativeSelectOption>
              <NativeSelectOption value="full">เต็มโควต้าวันนี้</NativeSelectOption>
              <NativeSelectOption value="offline">เครื่องออฟไลน์</NativeSelectOption>
              <NativeSelectOption value="paused">พัก</NativeSelectOption>
              <NativeSelectOption value="verify">ต้องยืนยันตัวตน</NativeSelectOption>
              <NativeSelectOption value="off">ปิด</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field className="w-48">
            <FieldLabel htmlFor="acc-filter-province">จังหวัด</FieldLabel>
            <NativeSelect id="acc-filter-province" name="province" size="sm" defaultValue={provinceFilter} className="w-full">
              <NativeSelectOption value="">ทุกจังหวัด</NativeSelectOption>
              <NativeSelectOption value="__none__">ยังไม่ระบุจังหวัด</NativeSelectOption>
              {allProvinces.map((p) => <NativeSelectOption key={p} value={p}>{p}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Button variant="outline" size="sm">กรอง</Button>
          {(stateFilter || provinceFilter || platformFilter) && (
            <Button asChild variant="ghost" size="sm"><Link href="/settings/connectors">ล้างตัวกรอง</Link></Button>
          )}
        </form>

        <div className="flex flex-col gap-3">
          {groupByBusinessUnit(visible, (c) => c.department).map((bu) => (
            <BusinessUnitSection key={bu.code ?? 'none'} code={bu.code} detail={bu.detail} count={bu.items.length} unit="บัญชี">
              {bu.items.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">ไม่มีบัญชีของ {bu.code} ตามตัวกรองนี้ · เพิ่มบัญชีใหม่ได้ด้านล่าง</p>
              ) : (
            <ItemGroup className="gap-0">
              {bu.items.map((c, index) => {
                const p = PLATFORM[c.platform] ?? { label: c.platform, letter: '?' };
                const paused = !!c.paused_until && new Date(c.paused_until) > new Date();
                const state = accountState(c);
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
                          {c.platform === 'facebook' && ` · เครื่องประจำ: ${c.preferred_worker || 'ยังไม่ได้เลือก'}${c.preferred_worker && c.worker_online === false ? ' (ออฟไลน์)' : ''}`}
                          {c.platform === 'facebook' && ` · โพสต์ ${c.group_ids.length} กลุ่ม`}
                          {` · ${c.province || 'ยังไม่ระบุจังหวัด'}`}
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

                      <div className="flex w-40 shrink-0 justify-center">
                        <Badge
                          variant={state === 'ready' ? 'secondary' : state === 'off' ? 'ghost' : 'outline'}
                          className={state === 'ready' ? '' : state === 'off' ? 'text-muted-foreground' : 'text-destructive'}
                        >
                          {state === 'paused' && paused ? `พักถึง ${backDate(c.paused_until!)}` : STATE_LABEL[state]}
                        </Badge>
                      </div>

                      <ItemActions className="flex-wrap justify-end gap-1">
                        <form action={setAccountProvinceAction}>
                          <input type="hidden" name="key" value={c.key} />
                          <Input
                            name="province"
                            defaultValue={c.province ?? ''}
                            placeholder="จังหวัด แล้วกด Enter"
                            className="h-7 w-36"
                            aria-label={`จังหวัดของ ${c.label}`}
                          />
                        </form>
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
                            <ConnectorEditButton id={id} platform="facebook" label={c.label} username={c.username ?? ''} skipWarmup={Boolean(c.skip_warmup)} hasPassword={Boolean(c.has_password)} groupIds={c.group_ids} department={c.department} />
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
                            <ConnectorEditButton id={id} platform={c.platform} label={c.label} username={c.username ?? ''} hasPassword={Boolean(c.has_password)} department={c.department} />
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
              )}
            </BusinessUnitSection>
          ))}
        </div>

        <datalist id="known-facebook-workers">
          {workers.map((worker) => <option key={worker} value={worker} />)}
        </datalist>
        <NewUnifiedConnectorForm workers={workers} />
      </section>

    </div>
  );
}
