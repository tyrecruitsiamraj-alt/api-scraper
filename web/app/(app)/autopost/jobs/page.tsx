import Link from 'next/link';
import { listPostAssignments } from '@/lib/repo';
import { postAssignmentNowAction, runFacebookPreflightAction } from '@/lib/actions';
import { AutopostNav } from '@/components/AutopostNav';

export const dynamic = 'force-dynamic';

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
  const rows = await listPostAssignments();

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
