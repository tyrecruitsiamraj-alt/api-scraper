'use client';

import { useState } from 'react';
import { createConnectorAction } from '@/lib/actions';

const PLATFORMS = [
  { value: 'jobbkk', label: 'JobBKK', detail: 'ดึง Resume', color: 'border-blue-200 bg-blue-50/60' },
  { value: 'jobthai', label: 'JobThai', detail: 'ดึง Resume', color: 'border-orange-200 bg-orange-50/60' },
  { value: 'facebook', label: 'Facebook', detail: 'Auto-Post', color: 'border-indigo-200 bg-indigo-50/60' },
];

export function NewUnifiedConnectorForm({ workers = [] }: { workers?: string[] }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('jobbkk');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const facebook = platform === 'facebook';

  if (!open) {
    return (
      <button
        onClick={() => { setError(''); setOpen(true); }}
        className="group flex w-full items-center justify-center gap-2.5 rounded-[18px] border border-dashed border-hairline py-4 text-sm font-medium text-subtle transition-colors hover:border-accent/40 hover:bg-accent/[0.03] hover:text-accent"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-black/5 text-base leading-none text-ink transition-colors group-hover:bg-accent group-hover:text-white">+</span>
        เพิ่ม Connector ใหม่
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        setError('');
        try {
          await createConnectorAction(fd);
          setPlatform('jobbkk');
          setOpen(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'เพิ่ม Connector ไม่สำเร็จ');
        } finally {
          setSubmitting(false);
        }
      }}
      className="card p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">เพิ่ม Connector</h2>
          <p className="mt-0.5 text-xs text-subtle">เลือกได้ทั้งบัญชีดึงผู้สมัครและบัญชีโพสต์ Facebook</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-subtle hover:bg-black/5 hover:text-ink" aria-label="ปิด">✕</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {PLATFORMS.map((p) => (
          <button
            type="button"
            key={p.value}
            onClick={() => { setPlatform(p.value); setError(''); }}
            className={`rounded-2xl border p-3 text-left transition ${
              platform === p.value ? `${p.color} ring-2 ring-accent/20` : 'border-line bg-white hover:bg-canvas'
            }`}
          >
            <span className="block text-sm font-semibold text-ink">{p.label}</span>
            <span className="mt-0.5 block text-xs text-subtle">{p.detail}</span>
          </button>
        ))}
      </div>
      <input type="hidden" name="platform" value={platform} />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">ชื่อเรียก</label>
          <input name="label" required placeholder={facebook ? 'Facebook - ทีมสรรหา 1' : 'JobBKK - ทีม HR 1'} className="field" />
        </div>
        <div>
          <label className="label">{facebook ? 'อีเมลหรือเบอร์ที่ใช้ล็อกอิน' : 'Username'}</label>
          <input name="username" required autoComplete="off" placeholder={facebook ? 'email@example.com หรือ 08x...' : 'ชื่อผู้ใช้ของบัญชี'} className="field" />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" required autoComplete="new-password" placeholder="••••••••" className="field" />
        </div>

        {facebook && (
          <>
            <div>
              <label className="label">ชื่อที่ใช้โพสต์</label>
              <input name="posterName" placeholder="เว้นว่างเพื่อใช้ชื่อเรียก" className="field" />
            </div>
            <div>
              <label className="label">เบอร์ของบัญชีเอง</label>
              <input name="contactPhone" placeholder="ใช้ตัดเบอร์ตัวเองออกจาก Lead" className="field" />
            </div>
            <div className="md:col-span-2">
              <label className="label">ผูกบัญชีกับเครื่อง (Pin)</label>
              <input
                name="preferredWorker"
                list="facebook-worker-names"
                placeholder="ชื่อเครื่อง เช่น SONB-RM009"
                className="field font-mono"
              />
              <datalist id="facebook-worker-names">
                {workers.map((worker) => <option key={worker} value={worker} />)}
              </datalist>
              <p className="mt-1.5 text-xs text-subtle">
                เลือกเครื่องเดิมให้บัญชีนี้เพื่อไม่ให้ IP สลับ · เว้นว่างได้หากยังไม่ทราบชื่อเครื่อง
              </p>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-black/[0.02] p-4">
        <div className={`grid gap-4 ${facebook ? '' : 'sm:grid-cols-2'}`}>
          {!facebook && (
            <div>
              <label className="label">จำนวนต่อรอบ</label>
              <input name="scrapeLimit" type="number" min={1} max={100} defaultValue={15} className="field" />
              <p className="mt-1.5 text-xs text-subtle">ดึงสูงสุดต่อการรันหนึ่งครั้ง</p>
            </div>
          )}
          <div>
            <label className="label">โควต้าต่อวัน</label>
            <input key={platform} name="dailyCap" type="number" min={1} max={facebook ? 50 : 2000} defaultValue={facebook ? 15 : 200} className="field" />
            <p className="mt-1.5 text-xs text-subtle">{facebook ? 'จำนวนโพสต์สูงสุดต่อบัญชี/วัน (แนะนำ 15)' : 'จำนวนโปรไฟล์สะสมสูงสุดต่อบัญชี/วัน'}</p>
          </div>
        </div>
      </div>

      {facebook && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Worker จะใช้ข้อมูลนี้เปิด Chrome และล็อกอินเมื่อรับงานครั้งแรก หาก Facebook ขอ OTP ให้ยืนยันบนเครื่องที่ Pin ไว้
        </p>
      )}
      {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'กำลังบันทึก…' : 'เพิ่ม Connector'}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">ยกเลิก</button>
        {!facebook && <span className="ml-auto text-xs text-subtle">รหัสผ่าน Scraping เข้ารหัส AES‑256</span>}
      </div>
    </form>
  );
}
