import Link from 'next/link';
import { ExternalLinkIcon } from 'lucide-react';
import { createGroupAction, deleteGroupAction, setAccountGroupsAction } from '@/lib/actions';
import { listPostingGroups, listFbAccountsWithGroups } from '@/lib/repo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

/**
 * จัดการกลุ่มโพสต์ + ผูกกลุ่มเข้าบัญชี แบบ native (แทน iframe เดิมที่ทำยาก).
 * server component — ใช้ server action ตรง ๆ ไม่ต้องมี client state.
 */
export async function PostingGroupsManager() {
  const [groups, accounts] = await Promise.all([listPostingGroups(), listFbAccountsWithGroups()]);

  return (
    <div className="flex flex-col gap-8">
      {/* บัญชี × กลุ่ม — ติ๊กเลือกกลุ่มที่แต่ละบัญชีจะโพสต์ */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">บัญชีโพสต์และกลุ่มที่จะลง</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            ติ๊กกลุ่มที่ให้บัญชีนั้นโพสต์ แล้วกดบันทึก บัญชีที่ยังไม่มีกลุ่มจะโพสต์ไม่ได้
          </p>
        </div>

        {accounts.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ยังไม่มีบัญชี Facebook</EmptyTitle>
              <EmptyDescription>
                <Link href="/settings/connectors">เพิ่มบัญชีก่อน</Link>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : groups.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>ยังไม่มีกลุ่มในระบบ</EmptyTitle>
              <EmptyDescription>เพิ่มกลุ่มในคลังด้านล่างก่อน แล้วค่อยผูกเข้าบัญชี</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {accounts.map((account) => {
              const linked = new Set(account.groupIds);
              const noGroup = linked.size === 0;
              return (
                <form key={account.id} action={setAccountGroupsAction}>
                  <input type="hidden" name="userId" value={account.id} />
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>{account.label}</CardTitle>
                      <CardDescription>
                        {noGroup ? <Badge variant="outline">ยังไม่ได้เลือกกลุ่ม</Badge> : `เลือกไว้ ${linked.size} กลุ่ม`}
                      </CardDescription>
                      <CardAction>
                        <Button size="sm">บันทึกกลุ่มของบัญชีนี้</Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <FieldSet>
                        <FieldLegend className="sr-only">กลุ่มที่บัญชี {account.label} จะโพสต์</FieldLegend>
                        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                          {groups.map((group) => {
                            const id = `acc-${account.id}-grp-${group.id}`;
                            return (
                              <Field key={group.id} orientation="horizontal">
                                <Checkbox
                                  id={id}
                                  name="groupIds"
                                  value={group.id}
                                  defaultChecked={linked.has(group.id)}
                                />
                                <FieldLabel htmlFor={id} className="min-w-0 font-normal">
                                  <span className="truncate">{group.name}</span>
                                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{group.fb_group_id}</span>
                                </FieldLabel>
                              </Field>
                            );
                          })}
                        </div>
                      </FieldSet>
                    </CardContent>
                  </Card>
                </form>
              );
            })}
          </div>
        )}
      </section>

      {/* คลังกลุ่ม — เพิ่ม/ลบ */}
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
                <div className="grid gap-4 sm:grid-cols-[2fr_1.5fr_1fr_auto] sm:items-end">
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
                  <Button>เพิ่มกลุ่ม</Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        {groups.length > 0 && (
          <ItemGroup className="gap-2">
            {groups.map((group) => (
              <Item key={group.id} variant="outline" size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle>{group.name}</ItemTitle>
                  <ItemDescription>
                    <span className="font-mono">{group.fb_group_id}</span>
                    {group.province ? ` · ${group.province}` : ''}
                    {group.department ? ` · ${group.department}` : ''}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
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
      </section>
    </div>
  );
}
