import { ExternalLinkIcon } from 'lucide-react';
import { createGroupAction, deleteGroupAction, setGroupDepartmentAction } from '@/lib/actions';
import { listPostingGroups } from '@/lib/repo';
import { groupByBusinessUnit } from '@/lib/business-units';
import { BusinessUnitSection } from '@/components/BusinessUnitSection';
import { GroupBusinessSelect } from '@/components/GroupBusinessSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

/**
 * คลังกลุ่ม Facebook — เพิ่ม/ลบ และติดป้ายธุรกิจ
 * การเลือกว่าบัญชีไหนโพสต์กลุ่มไหน อยู่ในฟอร์มเพิ่ม/แก้ไขบัญชี (ตั้งค่า → บัญชีที่ใช้งาน)
 * ไม่ใช่ตารางบัญชี × กลุ่มที่นี่ (เคยเป็นช่องติ๊ก 34 × 37 บนหน้าเดียว)
 */
export async function PostingGroupsManager() {
  const groups = await listPostingGroups();

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
              <div className="grid gap-4 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto] sm:items-end">
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
                <Button>เพิ่มกลุ่ม</Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {groupByBusinessUnit(groups, (g) => g.department).map((bu) => (
        <BusinessUnitSection key={bu.code ?? 'none'} code={bu.code} detail={bu.detail} count={bu.items.length} unit="กลุ่ม">
          {bu.items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">ยังไม่มีกลุ่มของ {bu.code} · เพิ่มด้านบนแล้วเลือกธุรกิจ {bu.code}</p>
          ) : (
        <ItemGroup className="gap-2 p-3">
          {bu.items.map((group) => (
            <Item key={group.id} variant="outline" size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>{group.name}</ItemTitle>
                <ItemDescription>
                  <span className="font-mono">{group.fb_group_id}</span>
                  {group.province ? ` · ${group.province}` : ''}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
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
