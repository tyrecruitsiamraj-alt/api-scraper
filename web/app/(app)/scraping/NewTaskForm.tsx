'use client';

import { useState } from 'react';
import { createTaskAction } from '@/lib/actions';
import { EDUCATION_LEVELS, GENDERS, PROVINCES, SALARY_LABELS, SALARY_STEPS } from '@/lib/filter-options';

type ConnectorOption = { id: string; platform: string; label: string; scrape_limit: number; available: boolean; block_reason: string | null };

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

export function NewTaskForm({ connectors }: { connectors: ConnectorOption[] }) {
  const [scheduled, setScheduled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const readyConnectors = connectors.filter((connector) => connector.available);

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        try {
          await createTaskAction(fd);
          // reset the uncontrolled fields after a successful create
          (document.getElementById('new-task-form') as HTMLFormElement | null)?.reset();
          setScheduled(false);
        } finally {
          setSubmitting(false);
        }
      }}
      id="new-task-form"
      className="card p-5"
    >
      <h2 className="text-base font-semibold">ค้นหา Resume จากรายละเอียดงาน</h2>
      <p className="mt-1 text-sm text-subtle">ระบบจะวิเคราะห์ประเภทงาน ค้นหาตำแหน่งที่ตรงกัน และเก็บเฉพาะ Resume ไม่ซ้ำจนถึงจำนวนที่ต้องการ</p>
      <input type="hidden" name="mode" value="count" />

      <div className="mt-5 rounded-lg border border-line/60 bg-black/[0.015] px-4 py-3">
        <label className="label">รายละเอียดเนื้องาน</label>
        <textarea
          name="jobDescription"
          required
          rows={5}
          placeholder="วางรายละเอียดหน้าที่ คุณสมบัติ พื้นที่ทำงาน และเงื่อนไขที่ต้องการได้เลย"
          className="field"
        />
        <p className="mt-1 text-xs text-subtle">
          ไม่ต้องคิดคำค้นเอง ระบบจะเลือกคำค้นและตำแหน่งใกล้เคียงใน Job Family เดียวกันให้
        </p>
      </div>

      <div className="mt-4 md:w-72">
        <label className="label">จำนวน Resume ที่ต้องการ</label>
        <input name="targetCount" type="number" min={1} max={1000} defaultValue={15} required className="field" />
        <p className="mt-1 text-xs text-subtle">ระบบจะนับคนเดิมเพียงครั้งเดียว และจะไม่ขึ้นว่าสำเร็จจนกว่าจะครบเป้า</p>
      </div>

      <details className="mt-4 rounded-lg border border-line/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">ตัวเลือกเพิ่มเติม</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">ชื่องาน (ไม่บังคับ)</label>
            <input name="name" placeholder="ระบบจะตั้งชื่อจากรายละเอียดงานให้อัตโนมัติ" className="field" />
          </div>
          <div>
            <label className="label">แหล่งค้นหา</label>
            <select name="connectorId" required className="field" defaultValue={readyConnectors[0]?.id ?? ''}>
              {readyConnectors.length === 0 && <option value="">ยังไม่มีบัญชีที่พร้อมใช้งาน</option>}
              {connectors.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.available}>
                  {PLATFORM_LABEL[c.platform] ?? c.platform} — {c.label}{c.available ? ` (รอบละ ${c.scrape_limit})` : ` — ยังใช้ไม่ได้: ${c.block_reason}`}
                </option>
              ))}
            </select>
            {connectors.some((connector) => !connector.available) && <p className="mt-1 text-xs text-amber-700">บัญชีที่ยังใช้ไม่ได้ถูกปิดการเลือกไว้ เพื่อไม่ให้สั่งงานแล้วล้มซ้ำ</p>}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">ตำแหน่ง (ไม่บังคับ)</label>
          <input name="position" placeholder="เช่น Developer" className="field" />
        </div>
        <div>
          <label className="label">คำค้น (ไม่บังคับ)</label>
          <input name="keyword" placeholder="เช่น React" className="field" />
        </div>
      </div>

      {/* auto-expand to adjacent positions when short of target */}
      <div className="mt-4 rounded-lg border border-line/60 bg-black/[0.015] px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" name="expandAdjacent" defaultChecked className="h-4 w-4 rounded border-hairline" />
          🧭 หาไม่ครบ → ขยายไปตำแหน่งใกล้เคียงอัตโนมัติ
        </label>
        <p className="mt-1 text-xs text-subtle">
          ถ้าได้ผู้สมัครน้อยกว่าจำนวนที่ต้องการ ระบบจะให้ AI จัดกลุ่มงาน (Job Family) แล้วค้นตำแหน่งใกล้เคียงในกลุ่มเดียวกันเพิ่มให้จนครบ (ใช้ AI บริษัทฟรี ไม่ต้องตั้งคีย์)
        </p>
      </div>

      {/* filters (province ก่อน · gender · salary · education · age) — กางให้เห็นตลอด */}
      <div className="mt-4 rounded-lg border border-line/60 bg-black/[0.015] px-4 py-3">
        <div className="text-sm font-medium text-ink">ตัวกรอง (เลือกได้ตามต้องการ — ไม่บังคับ)</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">จังหวัด</label>
            <input name="province" list="province-options" placeholder="เช่น กรุงเทพมหานคร" className="field" />
            <datalist id="province-options">
              {PROVINCES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label">เพศ</label>
            <select name="gender" className="field" defaultValue="ไม่ระบุ">
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">วุฒิการศึกษา (ขั้นต่ำ)</label>
            <select name="education" className="field" defaultValue="ไม่ระบุ">
              {EDUCATION_LEVELS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">เงินเดือน (บาท/เดือน)</label>
            <div className="flex items-center gap-2">
              <select name="salaryMin" className="field" defaultValue="">
                <option value="">ต่ำสุด</option>
                {SALARY_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {SALARY_LABELS[s]}
                  </option>
                ))}
              </select>
              <span className="text-subtle">–</span>
              <select name="salaryMax" className="field" defaultValue="">
                <option value="">สูงสุด</option>
                {SALARY_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {SALARY_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">อายุ (ปี)</label>
            <div className="flex items-center gap-2">
              <input name="ageMin" type="number" min={15} max={70} placeholder="ต่ำสุด" className="field" />
              <span className="text-subtle">–</span>
              <input name="ageMax" type="number" min={15} max={70} placeholder="สูงสุด" className="field" />
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-subtle">
          ตัวกรองเหล่านี้ใช้ได้กับทั้ง JobBKK และ JobThai · ระบบเริ่มจาก Resume ที่เพิ่งอัปเดตและอยู่ลำดับต้นของแพลตฟอร์มก่อน · อายุจะตรวจซ้ำจาก Resume จริงก่อนนับเข้ายอด
        </p>
      </div>

      {/* schedule */}
      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scheduled}
            onChange={(e) => setScheduled(e.target.checked)}
            className="h-4 w-4 rounded border-hairline"
          />
          ตั้งเวลาทำงานซ้ำ
        </label>
        {scheduled && (
          <select name="schedule" className="field mt-2 md:w-72" defaultValue="@hourly">
            <option value="every:1800">ทุก 30 นาที</option>
            <option value="@hourly">ทุกชั่วโมง</option>
            <option value="@daily">ทุกวัน</option>
          </select>
        )}
      </div>
      </details>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" name="runNow" value="on" disabled={submitting || readyConnectors.length === 0} className="btn-primary disabled:opacity-50">
          {submitting ? 'กำลังบันทึก…' : 'สร้าง & เริ่มทันที'}
        </button>
        <button type="submit" disabled={submitting || readyConnectors.length === 0} className="btn-ghost disabled:opacity-50">
          บันทึกไว้เฉยๆ
        </button>
      </div>
      {readyConnectors.length === 0 && <p className="mt-2 text-xs text-red-600">ยังเริ่มค้นหาไม่ได้ — ตรวจ Connector ที่ตั้งค่าไว้ก่อน</p>}
    </form>
  );
}
