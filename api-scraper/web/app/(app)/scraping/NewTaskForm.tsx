'use client';

import { useState } from 'react';
import { createTaskAction } from '@/lib/actions';

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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">ตำแหน่ง (ไม่บังคับ)</label>
            <input name="position" placeholder="เช่น Developer" className="field" />
          </div>
          <div>
            <label className="label">คำค้น (ไม่บังคับ)</label>
            <input name="keyword" placeholder="เช่น React" className="field" />
          </div>
        </div>
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
