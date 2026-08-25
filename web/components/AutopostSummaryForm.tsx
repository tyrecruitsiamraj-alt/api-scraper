'use client';

import { useMemo, useState } from 'react';
import { startCampaignAutopostAction } from '@/lib/actions';

type Account = { id: string; label: string; groupCount: number };

export function AutopostSummaryForm({ campaignId, contentId, accounts }: {
  campaignId: string;
  contentId: string;
  accounts: Account[];
}) {
  const [accountId, setAccountId] = useState('');
  const account = useMemo(() => accounts.find((item) => item.id === accountId) ?? null, [accountId, accounts]);
  const groupCount = account?.groupCount ?? 0;

  return (
    <form action={startCampaignAutopostAction} className="mt-4 space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="contentId" value={contentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="label">บัญชีที่จะใช้โพสต์</span>
          <select name="fbAccountId" required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="field w-full">
            <option value="" disabled>เลือกบัญชี Facebook…</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>{item.label} · {item.groupCount} กลุ่ม</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">สิ่งที่จะโพสต์</span>
          <select name="postMode" defaultValue="both" className="field w-full">
            <option value="both">รูป + แคปชัน</option>
            <option value="image">เฉพาะรูป</option>
            <option value="caption">เฉพาะแคปชัน</option>
          </select>
        </label>
      </div>

      <div className={`rounded-xl border px-4 py-3 text-sm ${account ? 'border-blue-200 bg-blue-50 text-blue-950' : 'border-hairline bg-black/[0.02] text-subtle'}`}>
        {account
          ? <>งานนี้จะเข้าคิว Auto-post ไปยัง <b>{groupCount} กลุ่ม</b> ของบัญชี <b>{account.label}</b> โดยระบบล็อกชุดกลุ่มนี้ไว้กับงานทันทีที่กดเริ่ม</>
          : 'เลือกบัญชีก่อน ระบบจะแสดงจำนวนกลุ่มที่งานนี้จะถูกส่งไป'}
      </div>

      <button className="btn-primary" disabled={!accountId}>
        {account ? `เริ่ม Auto-post ไป ${groupCount} กลุ่ม` : 'เลือกบัญชีเพื่อเริ่ม Auto-post'}
      </button>
    </form>
  );
}
