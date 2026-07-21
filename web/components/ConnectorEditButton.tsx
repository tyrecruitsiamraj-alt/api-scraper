'use client';

import { useState } from 'react';
import { editConnectorAction } from '@/lib/actions';

/**
 * ปุ่ม "แก้ไข" + modal ฟอร์มแก้ข้อมูล connector (Scraper หรือ Facebook).
 * รหัสผ่านเว้นว่าง = คงรหัสเดิม (ไม่บังคับกรอกซ้ำ).
 */
export function ConnectorEditButton({
  id,
  platform,
  label,
  username,
}: {
  id: string;
  platform: string;
  label: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const isFb = platform === 'facebook';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm">แก้ไข</button>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold">แก้ไข {isFb ? 'บัญชี Facebook' : 'Connector'}</h3>
            <form action={editConnectorAction} className="space-y-3" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="platform" value={platform} />
              <div>
                <label className="label">ชื่อที่แสดง</label>
                <input name="label" defaultValue={label} required className="field" />
              </div>
              <div>
                <label className="label">{isFb ? 'อีเมล/เบอร์ (ล็อกอิน FB)' : 'ชื่อผู้ใช้'}</label>
                <input name="username" defaultValue={username} className="field" />
              </div>
              <div>
                <label className="label">รหัสผ่าน <span className="text-subtle">(เว้นว่าง = คงรหัสเดิม)</span></label>
                <input name="password" type="password" placeholder="••••••••" className="field" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">ยกเลิก</button>
                <button className="btn-primary btn-sm">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
