import Link from 'next/link';
import { ExternalLinkIcon } from 'lucide-react';
import { createGroupAction, deleteGroupAction, setGroupDepartmentAction, setGroupProvinceAction, setGroupSectorAction } from '@/lib/actions';
import { listPostingGroups } from '@/lib/repo';
import type { PostingGroup } from '@/lib/repo';
import { GROUP_SECTORS, groupSectorLabel, isGroupSector } from '@/lib/group-sectors';
import { groupByBusinessUnit } from '@/lib/business-units';
import { BusinessUnitSection } from '@/components/BusinessUnitSection';
import { GroupBusinessSelect } from '@/components/GroupBusinessSelect';
import { GroupSectorSelect } from '@/components/GroupSectorSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

/** แสดงได้สูงสุดต่อหน้า — คลังมี 2,000+ กลุ่มหลังนำเข้าชีตราชการ ต้องพิมพ์ค้นหาแทนการเลื่อนดูทั้งหมด */
const MAX_ROWS = 200;

/**
 * คลังกลุ่ม Facebook — เพิ่ม/ลบ ติดป้ายธุรกิจ (LBD/LBA/LM) และประเภท (เอกชน/ราชการ)
 * การเลือกว่าบัญชีไหนโพสต์กลุ่มไหน อยู่ในฟอร์มเพิ่ม/แก้ไขบัญชี (ตั้งค่า → บัญชีที่ใช้งาน)
 * ไม่ใช่ตารางบัญชี × กลุ่มที่นี่ (เคยเป็นช่องติ๊ก 34 × 37 บนหน้าเดียว)
 */
/** จังหวัดของกลุ่มเป็นข้อความ "ก, ข" — แยกเป็นรายการ */
function provincesOf(group: PostingGroup): string[] {
  return String(group.province ?? '').split(/[,،]/).map((v) => v.trim()).filter(Boolean);
}

export async function PostingGroupsManager({ sector = 'private', query = '', province = '' }: { sector?: string; query?: string; province?: string }) {
  const groups = await listPostingGroups();
  // แยกราชการ/เอกชนเสมอ ไม่ปนกัน (เจ้าของ 4 พ.ย. 2569) — ค่าเริ่มต้นเอกชน
  const sectorFilter = isGroupSector(sector) ? sector : 'private';
  const needle = query.trim().toLowerCase();
  const provinceFilter = province.trim();
  const inSector = groups.filter((g) => g.sector === sectorFilter);
  const provinceCounts = new Map<string, number>();
  let noProvince = 0;
  for (const g of inSector) {
    const list = provincesOf(g);
    if (!list.length) noProvince += 1;
    for (const p of list) provinceCounts.set(p, (provinceCounts.get(p) ?? 0) + 1);
  }
  const provinceIndex = [...provinceCounts.entries()].sort((a, b) => (a[0] === 'ทั่วประเทศ' ? -1 : b[0] === 'ทั่วประเทศ' ? 1 : b[1] - a[1]));
  const visible = inSector.filter((g) =>
    (!provinceFilter || (provinceFilter === '__none__' ? provincesOf(g).length === 0 : provincesOf(g).includes(provinceFilter)))
    && (!needle || `${g.name} ${g.fb_group_id} ${g.province ?? ''}`.toLowerCase().includes(needle)));
  // ราชการมี 2,400 กลุ่ม: ต้องเลือกจังหวัดหรือค้นก่อนถึงแสดงรายการ เอกชนมีน้อยแสดงเลย
  const mustNarrow = !provinceFilter && !needle && inSector.length > MAX_ROWS;
  const shown = mustNarrow ? [] : visible.slice(0, MAX_ROWS);
  const countBySector = (code: string) => groups.filter((g) => g.sector === code).length;
  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ sector: sectorFilter, province: provinceFilter, q: query, ...patch });
    for (const [k, v] of [...next.entries()]) if (!v) next.delete(k);
    return `/settings/posting?${next.toString()}`;
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">คลังกลุ่ม Facebook</h2>
        <span className="text-xs text-muted-foreground">{groups.length} กลุ่ม</span>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>เพิ่มกลุ่ม</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createGroupAction}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="new-group-id">ลิงก์กลุ่ม หรือ ID กลุ่ม</FieldLabel>
                  <Input
                    id="new-group-id"
                    name="fbGroupId"
                    required
                    placeholder="https://facebook.com/groups/123… หรือ 123456789"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-group-name">ชื่อกลุ่ม (ไม่บังคับ)</FieldLabel>
                  <Input id="new-group-name" name="name" placeholder="เช่น หางานขับรถ กทม." />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-group-province">จังหวัด (ไม่บังคับ)</FieldLabel>
                  <Input id="new-group-province" name="province" placeholder="กรุงเทพ" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-group-department">ธุรกิจ</FieldLabel>
                  <GroupBusinessSelect id="new-group-department" name="department" defaultValue={null} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-group-sector">ประเภท</FieldLabel>
                  <GroupSectorSelect id="new-group-sector" name="sector" defaultValue="private" />
                </Field>
                <Button>เพิ่มกลุ่ม</Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="ประเภทกลุ่ม">
        {GROUP_SECTORS.map((s) => (
          <Button key={s.code} asChild size="sm" variant={sectorFilter === s.code ? 'default' : 'outline'}>
            <Link href={href({ sector: s.code, province: '', q: '' })}>{`${s.label} ${countBySector(s.code)}`}</Link>
          </Button>
        ))}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>จังหวัด ({groupSectorLabel(sectorFilter)})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={!provinceFilter ? 'default' : 'outline'}>
            <Link href={href({ province: '' })}>{`ทุกจังหวัด ${inSector.length}`}</Link>
          </Button>
          {provinceIndex.map(([p, n]) => (
            <Button key={p} asChild size="sm" variant={provinceFilter === p ? 'default' : 'outline'}>
              <Link href={href({ province: p })}>{`${p} ${n}`}</Link>
            </Button>
          ))}
          <Button asChild size="sm" variant={provinceFilter === '__none__' ? 'default' : 'outline'}>
            <Link href={href({ province: '__none__' })}>{`ยังไม่ระบุจังหวัด ${noProvince}`}</Link>
          </Button>
        </CardContent>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="sector" value={sectorFilter} />
        {provinceFilter && <input type="hidden" name="province" value={provinceFilter} />}
        <Field className="min-w-64 flex-1">
          <FieldLabel htmlFor="group-filter-q">ค้นหาชื่อกลุ่ม / เลขกลุ่ม</FieldLabel>
          <Input id="group-filter-q" name="q" defaultValue={query} placeholder="เช่น ขับรถ, โรงแรม, 5850142" />
        </Field>
        <Button variant="outline" size="sm">ค้นหา</Button>
        <span className="text-xs text-muted-foreground">
          {mustNarrow
            ? `${groupSectorLabel(sectorFilter)} มี ${inSector.length} กลุ่ม เลือกจังหวัดด้านบนหรือพิมพ์ค้นหาก่อน`
            : `ตรงเงื่อนไข ${visible.length} กลุ่ม${visible.length > MAX_ROWS ? ` · แสดง ${MAX_ROWS} กลุ่มแรก พิมพ์ค้นหาให้แคบลง` : ''}`}
        </span>
      </form>

      {!mustNarrow && groupByBusinessUnit(shown, (g) => g.department).map((bu) => (
        <BusinessUnitSection key={bu.code ?? 'none'} code={bu.code} detail={bu.detail} count={bu.items.length} unit="กลุ่ม">
          {bu.items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">ไม่มีกลุ่มของ {bu.code ?? 'ก้อนนี้'} ตามเงื่อนไขที่ค้น</p>
          ) : (
        <ItemGroup className="gap-2 p-3">
          {bu.items.map((group: PostingGroup) => (
            <Item key={group.id} variant="outline" size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>
                  {group.name}
                  <Badge variant={group.sector === 'government' ? 'secondary' : 'outline'} className="ml-2">{groupSectorLabel(group.sector)}</Badge>
                </ItemTitle>
                <ItemDescription>
                  <span className="font-mono">{group.fb_group_id}</span>
                  {group.province ? ` · ${group.province}` : ' · ยังไม่ระบุจังหวัด'}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <form action={setGroupProvinceAction} className="w-44">
                  <input type="hidden" name="id" value={group.id} />
                  <Input
                    name="province"
                    defaultValue={group.province ?? ''}
                    placeholder="จังหวัด แล้วกด Enter"
                    aria-label={`จังหวัดของกลุ่ม ${group.name}`}
                    className="h-8 text-sm"
                  />
                </form>
                <form action={setGroupSectorAction} className="w-28">
                  <input type="hidden" name="id" value={group.id} />
                  <GroupSectorSelect
                    name="sector"
                    defaultValue={group.sector}
                    ariaLabel={`เปลี่ยนประเภทกลุ่ม ${group.name}`}
                    submitOnChange
                  />
                </form>
                <form action={setGroupDepartmentAction} className="w-36">
                  <input type="hidden" name="id" value={group.id} />
                  <GroupBusinessSelect
                    name="department"
                    defaultValue={group.department}
                    ariaLabel={`ย้ายกลุ่ม ${group.name} ไปธุรกิจอื่น`}
                    submitOnChange
                  />
                </form>
                <Button asChild variant="ghost" size="sm">
                  <a href={`https://www.facebook.com/groups/${group.fb_group_id}`} target="_blank" rel="noreferrer">
                    เปิด
                    <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                </Button>
                <form action={deleteGroupAction}>
                  <input type="hidden" name="id" value={group.id} />
                  <Button variant="destructive" size="sm" aria-label={`ลบ ${group.name}`}>
                    ลบ
                  </Button>
                </form>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
          )}
        </BusinessUnitSection>
      ))}
    </section>
  );
}
