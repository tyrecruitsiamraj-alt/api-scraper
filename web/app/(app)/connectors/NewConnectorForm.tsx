'use client';

import { useState } from 'react';
import { createConnectorAction } from '@/lib/actions';

const PLATFORMS = [
  { value: 'jobbkk', label: 'JobBKK' },
  { value: 'jobthai', label: 'JobThai' },
];

export function NewConnectorForm() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('jobbkk');
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-center gap-2.5 rounded-[18px] border border-dashed border-hairline py-4 text-sm font-medium text-subtle transition-colors hover:border-accent/40 hover:bg-accent/[0.03] hover:text-accent"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-black/5 text-base leading-none text-ink transition-colors group-hover:bg-accent group-hover:text-white">
          +
        </span>
        เพิ่ม Connector ใหม่
      </button>
    );
  }

  return (
    <form
      id="new-connector-form"
      action={async (fd) => {
        setSubmitting(true);
        try {
          await createConnectorAction(fd);
          (document.getElementById('new-connector-form') as HTMLFormElement | null)?.reset();
          setPlatform('jobbkk');
          setOpen(false);
        } finally {
          setSubmitting(false);
        }
      }}
      className="card p-6"
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">เพิ่ม Connector</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-7 w-7 place-items-center rounded-full text-subtle transition-colors hover:bg-black/5 hover:text-ink"
          aria-label="ปิด"
        >
          ✕
        </button>
      </div>

      {/* platform segmented */}
      <div className="mb-5">
        <span className="label">แพลตฟอร์ม</span>
        <div className="seg">
          {PLATFORMS.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => setPlatform(p.value)}
              className={`seg-btn ${platform === p.value ? 'seg-btn-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="platform" value={platform} />
      </div>

      {/* credentials group */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">ชื่อเรียก</label>
          <input name="label" required placeholder="JobBKK - ทีม HR 1" className="field" />
        </div>
        <div>
          <label className="label">Username</label>
          <input name="username" required autoComplete="off" placeholder="ชื่อผู้ใช้ของบัญชี" className="field" />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" required autoComplete="new-password" placeholder="••••••••" className="field" />
        </div>
      </div>

      {/* limits group */}
      <div className="mt-5 rounded-2xl bg-black/[0.02] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">จำนวนต่อรอบ</label>
            <input name="scrapeLimit" type="number" min={1} max={100} defaultValue={15} className="field" />
            <p className="mt-1.5 text-xs text-subtle">ดึงสูงสุดกี่โปรไฟล์ต่อการรัน 1 ครั้ง</p>
          </div>
          <div>
            <label className="label">โควต้าต่อวัน</label>
            <input name="dailyCap" type="number" min={1} max={2000} defaultValue={200} className="field" />
            <p className="mt-1.5 text-xs text-subtle">เพดานสะสมต่อวันของบัญชีนี้</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2.5">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'กำลังบันทึก…' : 'เพิ่ม Connector'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          ยกเลิก
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-subtle">
          <span className="dot bg-green-500" />
          รหัสผ่านเข้ารหัส AES-256
        </span>
      </div>
    </form>
  );
}
