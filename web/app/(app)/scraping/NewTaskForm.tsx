'use client';

import { useState } from 'react';
import { createTaskAction } from '@/lib/actions';
import { EDUCATION_LEVELS, GENDERS, PROVINCES, SALARY_LABELS, SALARY_STEPS } from '@/lib/filter-options';

type ConnectorOption = { id: string; platform: string; label: string; scrape_limit: number };

const PLATFORM_LABEL: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

export function NewTaskForm({ connectors }: { connectors: ConnectorOption[] }) {
  const [mode, setMode] = useState<'count' | 'date_range'>('count');
  const [scheduled, setScheduled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        try {
          await createTaskAction(fd);
          // reset the uncontrolled fields after a successful create
          (document.getElementById('new-task-form') as HTMLFormElement | null)?.reset();
          setMode('count');
          setScheduled(false);
        } finally {
          setSubmitting(false);
        }
      }}
      id="new-task-form"
      className="card p-5"
    >
      <h2 className="text-base font-semibold mb-4">สร้างงาน Scraping</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">ชื่องาน</label>
          <input name="name" required placeholder="เช่น โปรแกรมเมอร์ กรุงเทพ" className="field" />
        </div>
        <div>
          <label className="label">Connector (บัญชี)</label>
          <select name="connectorId" required className="field" defaultValue="">
            <option value="" disabled>
              เลือก connector…
            </option>
            {connectors.map((c) => (
              <option key={c.id} value={c.id}>
                {PLATFORM_LABEL[c.platform] ?? c.platform} — {c.label} (รอบละ {c.scrape_limit})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* mode */}
      <div className="mt-4">
        <label className="label">โหมด</label>
        <div className="flex gap-2">
          {(
            [
              ['count', 'ตามจำนวน'],
              ['date_range', 'ตามช่วงวันที่อัปเดต'],
            ] as const
          ).map(([key, lbl]) => (
            <button
              type="button"
              key={key}
              onClick={() => setMode(key)}
              className={`pill ${mode === key ? 'bg-ink text-white' : 'bg-black/5 text-ink hover:bg-black/10'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {mode === 'count' ? (
          <div>
            <label className="label">จำนวนที่ต้องการ</label>
            <input
              name="targetCount"
              type="number"
              min={1}
              max={1000}
              defaultValue={15}
              className="field"
            />
            <p className="mt-1 text-xs text-subtle">ดึงตามจำนวนนี้ แต่ไม่เกิน daily cap ของ connector/แพลตฟอร์ม</p>
          </div>
        ) : (
          <div>
            <label className="label">อัปเดตตั้งแต่วันที่</label>
            <input name="updatedSince" type="date" max={today} defaultValue={today} className="field" />
            <p className="mt-1 text-xs text-subtle">ดึงโปรไฟล์ที่อัปเดตล่าสุดย้อนไปถึงวันที่นี้</p>
          </div>
        )}
      </div>

      {/* โหมดเนื้องาน: กรอกภาระงาน แล้วให้ AI หาตำแหน่งเอง (ใช้แทนตำแหน่ง/คำค้น) */}
      <div className="mt-4 rounded-lg border border-line/60 bg-black/[0.015] px-4 py-3">
        <label className="label">🧠 บอกเป็น “เนื้องาน” (ไม่บังคับ — ใช้แทนตำแหน่ง)</label>
        <textarea
          name="jobDescription"
          rows={2}
          placeholder="เช่น ยกของ จัดเรียงสินค้าในคลัง เช็คสต็อก ขับโฟล์คลิฟท์ แพ็คของส่ง"
          className="field"
        />
        <p className="mt-1 text-xs text-subtle">
          กรอกภาระงานที่อยากได้คนมาทำ → AI จะหาว่าควรค้นตำแหน่งอะไรบ้าง แล้วกวาดผู้สมัครจากทุกตำแหน่งที่เนื้องานใกล้เคียงกันจนครบจำนวนที่ต้องการ
          <br />
          <span className="text-ink/70">ถ้ากรอกช่องนี้ ระบบจะใช้แทน “ตำแหน่ง/คำค้น” ด้านล่าง</span>
        </p>
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
      <div className="mt-3 rounded-lg border border-line/60 bg-black/[0.015] px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" name="expandAdjacent" defaultChecked className="h-4 w-4 rounded border-hairline" />
          🧭 หาไม่ครบ → ขยายไปตำแหน่งใกล้เคียงอัตโนมัติ
        </label>
        <p className="mt-1 text-xs text-subtle">
          ถ้าได้ผู้สมัครน้อยกว่าจำนวนที่ต้องการ ระบบจะให้ AI จัดกลุ่มงาน (Job Family) แล้วค้นตำแหน่งใกล้เคียงในกลุ่มเดียวกันเพิ่มให้จนครบ (ใช้ AI บริษัทฟรี ไม่ต้องตั้งคีย์)
        </p>
      </div>

      {/* filters (gender / province / salary / education / age) */}
      <details className="mt-4 rounded-lg border border-line/60 bg-black/[0.015] px-4 py-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-ink">
          ตัวกรองเพิ่มเติม (เพศ · จังหวัด · เงินเดือน · วุฒิ · อายุ)
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
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
            <label className="label">จังหวัด</label>
            <input name="province" list="province-options" placeholder="เช่น กรุงเทพมหานคร" className="field" />
            <datalist id="province-options">
              {PROVINCES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
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
          ตัวกรองเหล่านี้ใช้ได้กับทั้ง JobBKK และ JobThai (เงินเดือน/อายุจับเป็นช่วงตามที่แต่ละเว็บกำหนด)
        </p>
      </details>

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

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" name="runNow" value="on" disabled={submitting} className="btn-primary disabled:opacity-50">
          {submitting ? 'กำลังบันทึก…' : 'สร้าง & เริ่มทันที'}
        </button>
        <button type="submit" disabled={submitting} className="btn-ghost disabled:opacity-50">
          บันทึกไว้เฉยๆ
        </button>
      </div>
    </form>
  );
}
