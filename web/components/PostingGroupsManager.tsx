import Link from 'next/link';
import { createGroupAction, deleteGroupAction, setAccountGroupsAction } from '@/lib/actions';
import { listPostingGroups, listFbAccountsWithGroups } from '@/lib/repo';

/**
 * จัดการกลุ่มโพสต์ + ผูกกลุ่มเข้าบัญชี แบบ native (แทน iframe เดิมที่ทำยาก).
 * server component — ใช้ server action ตรง ๆ ไม่ต้องมี client state.
 */
export async function PostingGroupsManager() {
  const [groups, accounts] = await Promise.all([listPostingGroups(), listFbAccountsWithGroups()]);

  return (
    <div className="space-y-6">
      {/* บัญชี × กลุ่ม — ติ๊กเลือกกลุ่มที่แต่ละบัญชีจะโพสต์ */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">บัญชีโพสต์ และกลุ่มที่จะลง</h2>
          <p className="mt-0.5 text-xs text-subtle">ติ๊กกลุ่มที่ต้องการให้บัญชีนั้นโพสต์ แล้วกดบันทึก — บัญชีที่ไม่มีกลุ่มจะโพสต์ไม่ได้</p>
        </div>

        {accounts.length === 0 ? (
          <div className="card p-6 text-center text-sm text-subtle">
            ยังไม่มีบัญชี Facebook — <Link href="/settings/connectors" className="text-accent hover:underline">เพิ่มบัญชีก่อน</Link>
          </div>
        ) : groups.length === 0 ? (
          <div className="card p-6 text-center text-sm text-subtle">ยังไม่มีกลุ่มในระบบ — เพิ่มกลุ่มด้านล่างก่อน แล้วค่อยผูกเข้าบัญชี</div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const linked = new Set(account.groupIds);
              const noGroup = linked.size === 0;
              return (
                <form key={account.id} action={setAccountGroupsAction} className={`card p-4 ${noGroup ? 'border-amber-200' : ''}`}>
                  <input type="hidden" name="userId" value={account.id} />
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">f</span>
                      <div>
                        <div className="text-sm font-medium text-ink">{account.label}</div>
                        <div className="text-xs text-subtle">
                          {noGroup ? <span className="text-amber-700">ยังไม่ได้เลือกกลุ่ม</span> : `เลือกไว้ ${linked.size} กลุ่ม`}
                        </div>
                      </div>
                    </div>
                    <button className="btn-primary btn-sm">บันทึกกลุ่มของบัญชีนี้</button>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {groups.map((group) => (
                      <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/[0.03]">
                        <input type="checkbox" name="groupIds" value={group.id} defaultChecked={linked.has(group.id)} className="h-4 w-4" />
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-subtle">{group.fb_group_id}</span>
                      </label>
                    ))}
                  </div>
                </form>
              );
            })}
          </div>
        )}
      </section>

      {/* คลังกลุ่ม — เพิ่ม/ลบ */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">คลังกลุ่ม Facebook</h2>
          <span className="text-xs text-subtle">{groups.length} กลุ่ม</span>
        </div>

        <form action={createGroupAction} className="card flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="new-group-id">ลิงก์กลุ่ม หรือ ID กลุ่ม</label>
            <input id="new-group-id" name="fbGroupId" required placeholder="https://facebook.com/groups/123… หรือ 123456789" className="field w-full" />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="label" htmlFor="new-group-name">ชื่อกลุ่ม (ไม่บังคับ)</label>
            <input id="new-group-name" name="name" placeholder="เช่น หางานขับรถ กทม." className="field w-full" />
          </div>
          <div className="w-32">
            <label className="label" htmlFor="new-group-province">จังหวัด (ไม่บังคับ)</label>
            <input id="new-group-province" name="province" placeholder="กรุงเทพ" className="field w-full" />
          </div>
          <button className="btn-primary">เพิ่มกลุ่ม</button>
        </form>

        {groups.length > 0 && (
          <div className="card divide-y divide-hairline/50 overflow-hidden">
            {groups.map((group) => (
              <div key={group.id} className="row">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{group.name}</div>
                  <div className="mt-0.5 text-[13px] text-subtle">
                    <span className="font-mono">{group.fb_group_id}</span>
                    {group.province ? ` · ${group.province}` : ''}
                    {group.department ? ` · ${group.department}` : ''}
                  </div>
                </div>
                <a
                  href={`https://www.facebook.com/groups/${group.fb_group_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost btn-sm shrink-0"
                >
                  เปิด
                </a>
                <form action={deleteGroupAction}>
                  <input type="hidden" name="id" value={group.id} />
                  <button className="btn-danger btn-sm shrink-0" aria-label={`ลบ ${group.name}`}>ลบ</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
