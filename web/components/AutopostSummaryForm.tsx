'use client';

import { useMemo, useState } from 'react';
import { InfoIcon } from 'lucide-react';
import { startCampaignAutopostAction } from '@/lib/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

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
    <form action={startCampaignAutopostAction} className="mt-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="contentId" value={contentId} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="autopost-account">บัญชีที่จะใช้โพสต์</FieldLabel>
            <NativeSelect
              id="autopost-account"
              name="fbAccountId"
              required
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="" disabled>เลือกบัญชี Facebook</NativeSelectOption>
              {accounts.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.label} ({item.groupCount} กลุ่ม)
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="autopost-mode">สิ่งที่จะโพสต์</FieldLabel>
            <NativeSelect id="autopost-mode" name="postMode" defaultValue="both" className="w-full">
              <NativeSelectOption value="both">รูปและแคปชัน</NativeSelectOption>
              <NativeSelectOption value="image">เฉพาะรูป</NativeSelectOption>
              <NativeSelectOption value="caption">เฉพาะแคปชัน</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>

        <Alert>
          <InfoIcon />
          <AlertDescription>
            {account ? (
              <>
                งานนี้จะเข้าคิว Auto-post ไปยัง <span className="font-medium text-foreground">{groupCount} กลุ่ม</span> ของบัญชี{' '}
                <span className="font-medium text-foreground">{account.label}</span> ชุดกลุ่มนี้จะถูกล็อกไว้กับงานทันทีที่กดเริ่ม
              </>
            ) : (
              'เลือกบัญชีก่อน แล้วจะเห็นจำนวนกลุ่มที่งานนี้จะโพสต์ลง'
            )}
          </AlertDescription>
        </Alert>

        <div>
          <Button disabled={!accountId}>
            {account ? `เริ่ม Auto-post ไป ${groupCount} กลุ่ม` : 'เลือกบัญชีเพื่อเริ่ม Auto-post'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
