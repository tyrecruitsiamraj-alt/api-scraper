import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from 'lucide-react';
import { countCandidates, listCandidates, listCandidateProvinces } from '@/lib/repo';
import { ScrapingNav } from '@/components/ScrapingNav';
import { markCandidateCalledAction, markCandidateViewedAction } from '@/lib/actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dynamic = 'force-dynamic';

const UPDATED_OPTS: { value: string; label: string }[] = [
  { value: '', label: 'อัปเดตทุกช่วง' },
  { value: '1', label: 'ใน 24 ชม.' },
  { value: '7', label: 'ใน 7 วัน' },
  { value: '30', label: 'ใน 30 วัน' },
  { value: '90', label: 'ใน 90 วัน' },
];
const ACTIVITY_OPTS: { value: string; label: string }[] = [
  { value: '', label: 'ทุกสถานะการติดตาม' },
  { value: 'unviewed', label: 'ยังไม่เปิดอ่าน' },
  { value: 'viewed', label: 'เปิดอ่านแล้ว' },
  { value: 'uncalled', label: 'ยังไม่โทร' },
  { value: 'called', label: 'โทรแล้ว' },
];

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

/** Full timestamp for the title attribute (hover). */
function fmtFull(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' });
}

/** Compact relative label: "เมื่อสักครู่ · 12 นาทีที่แล้ว · 3 ชม.ที่แล้ว · 30 มิ.ย." */
function relTime(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันก่อน`;
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' });
}

function activityTime(s: string | null, by: string | null) {
  if (!s) return '';
  return `${relTime(s)}${by ? ` · ${by}` : ''}`;
}

export default async function CandidatesPage(
  props: {
    searchParams: Promise<{ q?: string; platform?: string; position?: string; province?: string; updated?: string; activity?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const search = searchParams.q?.trim() || undefined;
  const platform = searchParams.platform || undefined;
  const position = searchParams.position?.trim() || undefined;
  const province = searchParams.province?.trim() || undefined;
  const updatedDays = Number.parseInt(searchParams.updated ?? '', 10) || undefined;
  const activity = (['viewed', 'unviewed', 'called', 'uncalled'] as const).includes(searchParams.activity as any)
    ? searchParams.activity as 'viewed' | 'unviewed' | 'called' | 'uncalled'
    : undefined;
  const pageNo = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const limit = 40;
  const filter = { search, platform, position, province, updatedDays, activity };
  const [rows, total, provinces] = await Promise.all([
    listCandidates({ ...filter, limit, offset: (pageNo - 1) * limit }),
    countCandidates(filter),
    listCandidateProvinces(),
  ]);
  const pages = Math.max(1, Math.ceil(total / limit));

  // เก็บ query ปัจจุบัน (ยกเว้น page) เพื่อใส่ในลิงก์แท็บ/หน้า
  const baseParams = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (position) p.set('position', position);
    if (province) p.set('province', province);
    if (updatedDays) p.set('updated', String(updatedDays));
    if (activity) p.set('activity', activity);
    if (platform) p.set('platform', platform);
    for (const [k, v] of Object.entries(extra)) v ? p.set(k, v) : p.delete(k);
    return p;
  };

  const tab = (key: string, label: string) => {
    const p = baseParams({ platform: key });
    return (
      <TabsTrigger key={key || 'all'} value={key || 'all'} asChild>
        <Link href={`/candidates${p.toString() ? '?' + p.toString() : ''}`}>{label}</Link>
      </TabsTrigger>
    );
  };

  const activeFilters = [position, province, updatedDays, activity].filter(Boolean).length;

  return (
    <div>
      <ScrapingNav />
      <div className="flex flex-col gap-6">

        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold">คลังผู้สมัคร</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} โปรไฟล์{activeFilters > 0 ? ' ตามตัวกรอง' : ''}
          </p>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            เก็บทุกคนที่พบไว้ที่นี่ จะได้ไม่เสียโควตาเปิดซ้ำ ส่วนงานค้นหาจะนับเฉพาะคนที่ผ่านช่วงอายุและ Hard Filter
          </p>
        </header>

        <form className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-6" action="/candidates" method="get">
          {platform && <input type="hidden" name="platform" value={platform} />}
          <Field>
            <FieldLabel htmlFor="cand-q" className="sr-only">ค้นหาชื่อหรือเบอร์</FieldLabel>
            <Input id="cand-q" name="q" defaultValue={search} placeholder="ค้นหาชื่อ / เบอร์" />
          </Field>
          <Field>
            <FieldLabel htmlFor="cand-position" className="sr-only">ตำแหน่งที่ต้องการ</FieldLabel>
            <Input id="cand-position" name="position" defaultValue={position} placeholder="ตำแหน่งที่ต้องการ" />
          </Field>
          <Field>
            <FieldLabel htmlFor="cand-province" className="sr-only">จังหวัด</FieldLabel>
            <NativeSelect id="cand-province" name="province" defaultValue={province ?? ''} className="w-full">
              <NativeSelectOption value="">ทุกจังหวัด</NativeSelectOption>
              {provinces.map((pv) => <NativeSelectOption key={pv} value={pv}>{pv}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="cand-updated" className="sr-only">ช่วงที่อัปเดต</FieldLabel>
            <NativeSelect id="cand-updated" name="updated" defaultValue={searchParams.updated ?? ''} className="w-full">
              {UPDATED_OPTS.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="cand-activity" className="sr-only">สถานะการติดตาม</FieldLabel>
            <NativeSelect id="cand-activity" name="activity" defaultValue={searchParams.activity ?? ''} className="w-full">
              {ACTIVITY_OPTS.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <div className="flex gap-2">
            <Button className="flex-1" type="submit">กรอง</Button>
            {(search || activeFilters > 0) && (
              <Button variant="outline" asChild>
                <Link href="/candidates">ล้าง</Link>
              </Button>
            )}
          </div>
        </form>

        <Tabs value={platform ?? 'all'}>
          <TabsList>
            {tab('', 'ทั้งหมด')}
            {tab('jobbkk', 'JobBKK')}
            {tab('jobthai', 'JobThai')}
          </TabsList>
        </Tabs>

        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
              <EmptyTitle>ยังไม่มีข้อมูลผู้สมัคร</EmptyTitle>
              {(search || activeFilters > 0) && <EmptyDescription>ลองล้างตัวกรองแล้วค้นใหม่</EmptyDescription>}
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 text-muted-foreground">ชื่อ</TableHead>
                  <TableHead className="px-4 text-muted-foreground">ตำแหน่งที่ต้องการ</TableHead>
                  <TableHead className="px-4 text-muted-foreground">จังหวัด</TableHead>
                  <TableHead className="px-4 text-muted-foreground">อายุ</TableHead>
                  <TableHead className="px-4 text-muted-foreground">ติดต่อ</TableHead>
                  <TableHead className="hidden xl:table-cell px-4 text-muted-foreground">แหล่งที่มา</TableHead>
                  <TableHead className="hidden 2xl:table-cell px-4 text-muted-foreground">พบจากเว็บล่าสุด</TableHead>
                  <TableHead className="px-4 text-muted-foreground">ติดตาม</TableHead>
                  <TableHead className="px-4 text-right text-muted-foreground">บันทึก</TableHead>
                  <TableHead className="hidden 2xl:table-cell px-4 text-right text-muted-foreground">ไฟล์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar size="lg">
                          {c.profile_asset_id && <AvatarImage src={`/api/assets/${c.profile_asset_id}`} alt="" />}
                          <AvatarFallback>{(c.full_name || '?').trim().charAt(0)}</AvatarFallback>
                        </Avatar>
                        <Link href={`/candidates/${c.id}`} className="font-medium text-foreground hover:text-primary">
                          {c.full_name || '(ไม่มีชื่อ)'}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48 truncate px-4 py-3 text-muted-foreground">{c.desired_positions || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{c.province || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{c.age ? `${c.age} ปี` : 'ไม่ระบุ'}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{c.phone || c.email || '—'}</TableCell>
                    <TableCell className="hidden xl:table-cell px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.platforms ?? []).map((p) => (
                          <Badge key={p} variant="outline">{PLATFORM_LABEL[p] ?? p}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell px-4 py-3 text-muted-foreground" title={fmtFull(c.latest_source_seen_at)}>
                      <div>{relTime(c.latest_source_seen_at)}</div>
                      {c.latest_search_rank && <div className="text-xs">อันดับ {c.latest_search_rank} ในผลค้น</div>}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={c.viewed_at ? 'secondary' : 'outline'}>
                          {c.viewed_at ? 'เปิดอ่านแล้ว' : 'ยังไม่เปิดอ่าน'}
                        </Badge>
                        {c.viewed_at && <span className="text-xs text-muted-foreground" title={fmtFull(c.viewed_at)}>{activityTime(c.viewed_at, c.viewed_by)}</span>}
                        <Badge variant={c.called_at ? 'secondary' : 'outline'}>
                          {c.called_at ? 'โทรแล้ว' : 'ยังไม่โทร'}
                        </Badge>
                        {c.called_at && <span className="text-xs text-muted-foreground" title={fmtFull(c.called_at)}>{activityTime(c.called_at, c.called_by)}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {!c.viewed_at && (
                          <form action={markCandidateViewedAction}>
                            <input type="hidden" name="candidateId" value={c.id} />
                            <Button variant="ghost" size="sm" type="submit">บันทึกว่าอ่านแล้ว</Button>
                          </form>
                        )}
                        {!c.called_at && (
                          <form action={markCandidateCalledAction}>
                            <input type="hidden" name="candidateId" value={c.id} />
                            <Button variant="ghost" size="sm" type="submit">บันทึกว่าโทรแล้ว</Button>
                          </form>
                        )}
                        {(c.viewed_at && c.called_at) && <span className="text-xs text-muted-foreground">ครบแล้ว</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell px-4 py-3 text-right text-muted-foreground">{c.asset_count || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {pages > 1 && (
          <Pagination>
            <PaginationContent className="gap-3">
              {pageNo > 1 && (
                <PaginationItem>
                  <Button variant="ghost" asChild>
                    <Link href={`/candidates?${baseParams({ page: String(pageNo - 1) })}`}>
                      <ChevronLeftIcon data-icon="inline-start" />
                      ก่อนหน้า
                    </Link>
                  </Button>
                </PaginationItem>
              )}
              <PaginationItem>
                <span className="text-sm text-muted-foreground">หน้า {pageNo} / {pages}</span>
              </PaginationItem>
              {pageNo < pages && (
                <PaginationItem>
                  <Button variant="ghost" asChild>
                    <Link href={`/candidates?${baseParams({ page: String(pageNo + 1) })}`}>
                      ถัดไป
                      <ChevronRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}
