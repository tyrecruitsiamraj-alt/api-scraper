import { ExternalLinkIcon } from 'lucide-react';
import { createGroupAction, deleteGroupAction, setGroupDepartmentAction, setGroupSectorAction } from '@/lib/actions';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** แสดงได้สูงสุดต่อหน้า — คลังมี 2,000+ กลุ่มหลังนำเข้าชีตราชการ ต้องพิมพ์ค้นหาแทนการเลื่อนดูทั้งหมด */
const MAX_ROWS = 200;

/**
 * คลังกลุ่ม Facebook — เพิ่ม/ลบ ติดป้ายธุรกิจ (LBD/LBA/LM) และประเภท (เอกชน/ราชการ)
 * การเลือกว่าบัญชีไหนโพสต์กลุ่มไหน อยู่ในฟอร์มเพิ่ม/แก้ไขบัญชี (ตั้งค่า → บัญชีที่ใช้งาน)
 * ไม่ใช่ตารางบัญชี × กลุ่มที่นี่ (เคยเป็นช่องติ๊ก 34 × 37 บนหน้าเดียว)
 */
export async function PostingGroupsManager({ sector = 'all', query = '' }: { sector?: string; query?: string }) {
  const groups = await listPostingGroups();
  const sectorFilter = isGroupSector(sector) ? sector : 'all';
  const needle = query.trim().toLowerCase();
  const visible = groups.filter((g) =>
    (sectorFilter === 'all' || g.sector === sectorFilter)
    && (!needle || `${g.name} ${g.fb_group_id} ${g.province ?? ''}`.toLowerCase().includes(needle)));
  const shown = visible.slice(0, MAX_ROWS);
  const countBySector = (code: string) => groups.filter((g) => g.sector === code).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">คลังกลุ่ม Facebook</h2>
        <span className="text-xs text-muted-foreground">
          {groups.length} กลุ่ม · {GROUP_SECTORS.map((s) => `${s.label} ${countBySector(s.code)}`).join(' · ')}
        </span>
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

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel htmlFor="group-filter-sector">ประเภท</FieldLabel>
          <NativeSelect id="group-filter-sector" name="sector" size="sm" defaultValue={sectorFilter} className="w-full">
            <NativeSelectOption value="all">ทั้งหมด</NativeSelectOption>
            {GROUP_SECTORS.map((s) => (
              <NativeSelectOption key={s.code} value={s.code}>{s.label}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="min-w-64 flex-1">
          <FieldLabel htmlFor="group-filter-q">ค้นหาชื่อกลุ่ม / เลขกลุ่ม / จังหวัด</FieldLabel>
          <Input id="group-filter-q" name="q" defaultValue={query} placeholder="เช่น ขับรถ, ภูเก็ต, 5850142" />
        </Field>
        <Button variant="outline" size="sm">ค้นหา</Button>
        <span className="text-xs text-muted-foreground">
          ตรงเงื่อนไข {visible.length} กลุ่ม{visible.length > MAX_ROWS ? ` · แสดง ${MAX_ROWS} กลุ่มแรก พิมพ์ค้นหาให้แคบลง` : ''}
        </span>
      </form>

      {groupByBusinessUnit(shown, (g) => g.department).map((bu) => (
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
                  {group.province ? ` · ${group.province}` : ''}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
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
