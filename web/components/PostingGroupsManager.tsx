import { ExternalLinkIcon } from 'lucide-react';
import { createGroupAction, deleteGroupAction, setGroupDepartmentAction, setGroupProvinceAction, setGroupSectorAction } from '@/lib/actions';
import { listPostingGroups } from '@/lib/repo';
import type { PostingGroup } from '@/lib/repo';
import { GROUP_SECTORS, groupSectorLabel, isGroupSector } from '@/lib/group-sectors';
import { groupByBusinessUnit } from '@/lib/business-units';
import { BusinessUnitSection } from '@/components/BusinessUnitSection';
import { GroupBusinessSelect } from '@/components/GroupBusinessSelect';
import { GroupSectorSelect } from '@/components/GroupSectorSelect';
import { AutoSubmitSelect } from '@/components/AutoSubmitSelect';
import { GroupJobTypesDropdown, GroupJobTypesEditor } from '@/components/GroupJobTypesEditor';
import { GROUP_JOB_TYPES, isGroupJobType } from '@/lib/group-job-types';
import { MAX_GROUPS_PER_ADD } from '../../src/core/group-links.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

export async function PostingGroupsManager({ sector = 'private', query = '', province = '', jobType = '' }: { sector?: string; query?: string; province?: string; jobType?: string }) {
  const groups = await listPostingGroups();
  // แยกราชการ/เอกชนเสมอ ไม่ปนกัน (เจ้าของ 4 พ.ย. 2569) — ค่าเริ่มต้นเอกชน
  const sectorFilter = isGroupSector(sector) ? sector : 'private';
  const needle = query.trim().toLowerCase();
  const filtering = Boolean(needle || province.trim() || jobType.trim());
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
  const jobTypeFilter = jobType === '__none__' || isGroupJobType(jobType) ? jobType : '';
  const visible = inSector.filter((g) =>
    (!jobTypeFilter || (jobTypeFilter === '__none__' ? g.job_types.length === 0 : (g.job_types as string[]).includes(jobTypeFilter)))
    && (!provinceFilter || (provinceFilter === '__none__' ? provincesOf(g).length === 0 : provincesOf(g).includes(provinceFilter)))
    && (!needle || `${g.name} ${g.fb_group_id} ${g.province ?? ''}`.toLowerCase().includes(needle)));
  // ราชการมี 2,400 กลุ่ม: ต้องเลือกจังหวัดหรือค้นก่อนถึงแสดงรายการ เอกชนมีน้อยแสดงเลย
  const mustNarrow = !provinceFilter && !needle && !jobTypeFilter && inSector.length > MAX_ROWS;
  const shown = mustNarrow ? [] : visible.slice(0, MAX_ROWS);
  const countBySector = (code: string) => groups.filter((g) => g.sector === code).length;

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
              <Field>
                <FieldLabel htmlFor="new-group-id">ลิงก์กลุ่ม หรือ ID กลุ่ม</FieldLabel>
                <Textarea
                  id="new-group-id"
                  name="fbGroupId"
                  required
                  rows={3}
                  placeholder={'https://facebook.com/groups/123456789\nhttps://facebook.com/groups/987654321\n…'}
                />
                <FieldDescription>
                  เพิ่มหลายกลุ่มได้ วางบรรทัดละกลุ่ม ครั้งละไม่เกิน {MAX_GROUPS_PER_ADD} กลุ่ม ทุกกลุ่มได้ค่าด้านล่างเหมือนกัน
                  ชื่อกลุ่มระบบอ่านจาก Facebook ให้ตอนโพสต์ครั้งแรก
                </FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="new-group-name">ชื่อกลุ่ม (ไม่บังคับ ใส่ได้เมื่อเพิ่มกลุ่มเดียว)</FieldLabel>
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
                  <FieldLabel htmlFor="new-group-sector">ราชการ / เอกชน</FieldLabel>
                  <GroupSectorSelect id="new-group-sector" name="sector" defaultValue="private" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-group-jobtypes">ประเภทงาน</FieldLabel>
                  <GroupJobTypesDropdown id="new-group-jobtypes" />
                </Field>
                <Button>เพิ่มกลุ่ม</Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor="group-filter-sector">ราชการ / เอกชน</FieldLabel>
          <AutoSubmitSelect
            id="group-filter-sector"
            name="sector"
            defaultValue={sectorFilter}
            options={GROUP_SECTORS.map((s) => ({ value: s.code, label: `${s.label} (${countBySector(s.code)})` }))}
          />
        </Field>
        <Field className="w-56">
          <FieldLabel htmlFor="group-filter-province">จังหวัด</FieldLabel>
          <AutoSubmitSelect
            id="group-filter-province"
            name="province"
            defaultValue={provinceFilter}
            options={[
              { value: '', label: `ทุกจังหวัด (${inSector.length})` },
              ...provinceIndex.map(([p, n]) => ({ value: p, label: `${p} (${n})` })),
              { value: '__none__', label: `ยังไม่ระบุจังหวัด (${noProvince})` },
            ]}
          />
        </Field>
        <Field className="w-56">
          <FieldLabel htmlFor="group-filter-job">ประเภทงาน</FieldLabel>
          <AutoSubmitSelect
            id="group-filter-job"
            name="job"
            defaultValue={jobTypeFilter}
            options={[
              { value: '', label: 'ทุกประเภท' },
              ...GROUP_JOB_TYPES.map((t) => ({ value: t, label: `${t} (${inSector.filter((g) => (g.job_types as string[]).includes(t)).length})` })),
              { value: '__none__', label: `ยังไม่ระบุประเภทงาน (${inSector.filter((g) => g.job_types.length === 0).length})` },
            ]}
          />
        </Field>
        <Field className="min-w-64 flex-1">
          <FieldLabel htmlFor="group-filter-q">ค้นหาชื่อกลุ่ม / เลขกลุ่ม</FieldLabel>
          <Input id="group-filter-q" name="q" defaultValue={query} placeholder="เช่น ขับรถ, โรงแรม, 5850142" />
        </Field>
        <Button variant="outline" size="sm">ค้นหา</Button>
        <span className="text-xs text-muted-foreground">
          {mustNarrow
            ? `${groupSectorLabel(sectorFilter)} มี ${inSector.length} กลุ่ม เลือกจังหวัด ประเภทงาน หรือพิมพ์ค้นหาก่อน`
            : `ตรงเงื่อนไข ${visible.length} กลุ่ม${visible.length > MAX_ROWS ? ` · แสดง ${MAX_ROWS} กลุ่มแรก พิมพ์ค้นหาให้แคบลง` : ''}`}
        </span>
      </form>

      {!mustNarrow && groupByBusinessUnit(shown, (g) => g.department).map((bu) => (
        <BusinessUnitSection
          key={`${bu.code ?? 'none'}-${filtering ? 'open' : 'closed'}`}
          code={bu.code}
          detail={bu.detail}
          count={bu.items.length}
          unit="กลุ่ม"
          // ค้นหา/กรองแล้ว กางก้อนที่มีผลให้เลย ไม่ต้องกดหาเอง
          defaultOpen={filtering && bu.items.length > 0}
        >
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
              <ItemActions className="flex-wrap justify-end">
                <GroupJobTypesEditor groupId={group.id} groupName={group.name} value={group.job_types} />
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
