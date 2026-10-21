import Link from 'next/link';
import { listJarvisPostOrders, listPostAssignments, postModeLabel, REPOST_MIN_GAP_DAYS } from '@/lib/repo';
import type { JarvisPostOrder } from '@/lib/repo';
import { postAssignmentNowAction, postJarvisOrderAction, repostJarvisOrderAction, runFacebookPreflightAction } from '@/lib/actions';
import { AutopostNav } from '@/components/AutopostNav';

export const dynamic = 'force-dynamic';

const JARVIS_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'รอโพสต์', cls: 'bg-amber-50 text-amber-800' },
  in_progress: { label: 'กำลังโพสต์', cls: 'bg-blue-50 text-blue-700' },
  posted: { label: 'โพสต์แล้ว', cls: 'bg-emerald-50 text-emerald-700' },
};

// เซิร์ฟเวอร์ Vercel เป็น UTC — บังคับเวลาไทย
function thaiTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function RepostForm({ order }: { order: JarvisPostOrder }) {
  const busy = order.queue_status === 'queued' || order.queue_status === 'running';
  const pickable = order.repost_groups.filter((g) => g.account_label && !g.blocked_until);
  return (
    <details className="rounded-lg border border-line px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">โพสต์ซ้ำ</summary>
      <form action={repostJarvisOrderAction} className="mt-3 space-y-3">
        <input type="hidden" name="requestNo" value={order.request_no} />
        <div className="space-y-1.5">
          <div className="text-xs text-subtle">เลือกกลุ่ม</div>
          {order.repost_groups.map((g) => (
            <label key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="checkbox" name="groupId" value={g.id} disabled={busy || !g.account_label || Boolean(g.blocked_until)} />
              <span>{g.name}</span>
              <span className="text-xs text-subtle">
                {!g.account_label
                  ? 'ยังไม่มีบัญชี Facebook ที่ผูกกลุ่มนี้'
                  : g.blocked_until
                    ? `โพสต์งานนี้ไปแล้ว โพสต์ซ้ำได้หลัง ${thaiTime(g.blocked_until)}`
                    : `โพสต์ด้วย ${g.account_label}`}
              </span>
            </label>
          ))}
          <p className="text-xs text-subtle">
            กลุ่มเดิมต้องเว้น {REPOST_MIN_GAP_DAYS} วัน · เพิ่มกลุ่มได้ที่{' '}
            <Link href="/settings/posting" className="underline">ตั้งค่าการโพสต์</Link>
          </p>
        </div>
        {busy && <p className="text-sm text-amber-700">มีรอบโพสต์ของใบนี้รอคิวอยู่ รอให้เสร็จก่อน</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="yes" required disabled={busy || !pickable.length} />
            ยืนยันว่าจะโพสต์จริงลงกลุ่ม
          </label>
          <button className="btn-primary btn-sm" disabled={busy || !pickable.length}>โพสต์ซ้ำ</button>
        </div>
      </form>
    </details>
  );
}

function JarvisOrderCard({ order }: { order: JarvisPostOrder }) {
  const status = JARVIS_STATUS[order.jarvis_status] ?? { label: order.jarvis_status, cls: 'bg-black/5 text-ink' };
  const blocker = order.issues[0]
    ?? (!order.worker_online ? 'เครื่องที่ผูกกับบัญชี Facebook ยังออฟไลน์' : null);
  const failed = order.jarvis_status === 'in_progress' && order.queue_status === 'failed';
  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{order.position}</div>
          <div className="mt-1 text-xs text-subtle">
            {order.request_no} · {postModeLabel(order.post_mode)} · {order.group_names.join(', ') || 'ไม่มีกลุ่ม'}
            {order.account_label ? ` · โพสต์ด้วย ${order.account_label}` : ''}
            {order.requested_by_name ? ` · สั่งโดย ${order.requested_by_name}` : ''}
            {` · Jarvis สั่งเมื่อ ${thaiTime(order.created_at)}`}
          </div>
        </div>
        <span className={`pill ${status.cls}`}>{status.label}</span>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.03] p-3 font-sans text-sm">{order.caption}</pre>
      {order.post_link && (
        <a href={order.post_link} target="_blank" rel="noreferrer" className="text-sm text-accent underline">เปิดโพสต์บน Facebook</a>
      )}
      {order.posts.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-subtle">ประวัติการโพสต์</div>
          <ul className="space-y-0.5 text-sm">
            {order.posts.map((p) => (
              <li key={`${p.at}-${p.group_name}`}>
                {thaiTime(p.at)} · {p.group_name}{p.worker ? ` · เครื่อง ${p.worker}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed && <p className="text-sm text-red-700">โพสต์ไม่สำเร็จ ดูสาเหตุในบันทึกการโพสต์ด้านล่างหน้า "ภาพรวมการโพสต์"</p>}
      {order.jarvis_status === 'pending' && (
        <>
          {blocker && <p className="text-sm text-amber-700">โพสต์ไม่ได้ตอนนี้: {order.issues.length ? order.issues.join(' · ') : blocker}</p>}
          <form action={postJarvisOrderAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="requestNo" value={order.request_no} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required disabled={Boolean(blocker)} />
              ยืนยันว่าจะโพสต์จริงลงกลุ่ม
            </label>
            <button className="btn-primary btn-sm" disabled={Boolean(blocker)}>โพสต์</button>
          </form>
        </>
      )}
      {order.jarvis_status !== 'pending' && <RepostForm order={order} />}
    </div>
  );
}

const QUEUE_LABEL: Record<string, string> = {
  queued: 'รอคิว',
  running: 'กำลังโพสต์',
  completed: 'โพสต์เสร็จ',
  failed: 'ไม่สำเร็จ',
  cancelled: 'ยกเลิก',
};

// งานโพสต์ที่ผูกบัญชี+กลุ่มไว้แล้ว — สั่งโพสต์จริงหรือทดสอบแบบไม่โพสต์จากหน้านี้
export default async function AutopostJobsPage({ searchParams }: { searchParams?: { notice?: string } }) {
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const [orders, allRows] = await Promise.all([listJarvisPostOrders(), listPostAssignments()]);
  // งานที่สร้างจาก Jarvis แสดงในการ์ดด้านบนแล้ว ไม่ต้องซ้ำในรายการงานเดิม
  const rows = allRows.filter((row) => !row.id.startsWith('jv-'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">งานโพสต์</h1>
        <p className="mt-1 text-sm text-subtle">
          สั่งโพสต์งานที่ผูกบัญชีและกลุ่มไว้แล้ว หรือทดสอบบัญชีแบบไม่โพสต์จริงก่อน
        </p>
      </div>

      <AutopostNav />

      {notice && <div className="card border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}

      <div className="space-y-3">
        <h2 className="text-base font-semibold">คำสั่งโพสต์จาก Jarvis</h2>
        {orders.length === 0 ? (
          <div className="card px-5 py-6 text-center text-sm text-subtle">ยังไม่มีคำสั่งโพสต์จาก Jarvis</div>
        ) : (
          orders.map((order) => <JarvisOrderCard key={order.request_no} order={order} />)
        )}
      </div>

      <h2 className="text-base font-semibold">งานโพสต์อื่นในระบบ</h2>

      {rows.length === 0 ? (
        <div className="card px-5 py-8 text-center text-sm text-subtle">
          ยังไม่มีงานโพสต์ที่ผูกบัญชีไว้ เพิ่มบัญชีและกลุ่มได้ที่{' '}
          <Link href="/settings/posting" className="underline">ตั้งค่าการโพสต์</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const busy = row.last_queue_status === 'queued' || row.last_queue_status === 'running';
            const blocker = !row.account_id
              ? 'ยังไม่ผูกบัญชี Facebook'
              : row.group_count <= 0
                ? 'ยังไม่เลือกกลุ่ม'
                : row.paused
                  ? 'บัญชีถูกพักชั่วคราว'
                  : !row.worker_online
                    ? `เครื่อง ${row.preferred_worker ?? '-'} ออฟไลน์`
                    : busy
                      ? 'มีงานโพสต์รอคิวอยู่แล้ว'
                      : null;
            return (
              <div key={row.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{row.job_titles}</div>
                    <div className="mt-1 text-xs text-subtle">
                      {row.account_label ?? 'ไม่มีบัญชี'} · {row.group_count} กลุ่ม · {row.has_image ? 'caption + รูป' : 'caption อย่างเดียว'}
                    </div>
                  </div>
                  <span className="pill bg-black/5 text-ink">
                    {row.last_queue_status
                      ? `${QUEUE_LABEL[row.last_queue_status] ?? row.last_queue_status} · ${new Date(row.last_queue_at ?? '').toLocaleString('th-TH')}`
                      : 'ยังไม่เคยโพสต์'}
                  </span>
                </div>
                {row.caption_preview && (
                  <p className="line-clamp-3 whitespace-pre-line text-sm text-subtle">{row.caption_preview}</p>
                )}
                {blocker && <p className="text-sm text-amber-700">โพสต์ไม่ได้ตอนนี้: {blocker}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <form action={postAssignmentNowAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="assignmentId" value={row.id} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="confirm" value="yes" required disabled={Boolean(blocker)} />
                      ยืนยันว่าจะโพสต์จริงลงกลุ่ม
                    </label>
                    <button className="btn-primary btn-sm" disabled={Boolean(blocker)}>โพสต์ตอนนี้</button>
                  </form>
                  {row.account_id && (
                    <form action={runFacebookPreflightAction}>
                      <input type="hidden" name="fbAccountId" value={row.account_id} />
                      <button className="btn-ghost btn-sm" disabled={!row.worker_online}>ทดสอบแบบไม่โพสต์จริง</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
