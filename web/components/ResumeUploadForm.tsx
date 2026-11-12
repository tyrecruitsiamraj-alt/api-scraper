'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';

const MAX_FILES = 20;
const MAX_MB = 10;
const ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png,.webp';

type FileState = { name: string; state: 'waiting' | 'sending' | 'sent' | 'error'; error?: string };

/** เลือกไฟล์ → ส่งทีละไฟล์ (เห็นว่าไฟล์ไหนส่งแล้ว ไฟล์ไหนไม่รับเพราะอะไร) → ส่งครบแล้วไปหน้าผลของรอบนี้ */
export function ResumeUploadForm({ tasks }: { tasks: { id: string; label: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [taskId, setTaskId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [states, setStates] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    setError(picked.length > MAX_FILES ? `เลือกได้ครั้งละไม่เกิน ${MAX_FILES} ไฟล์ ตอนนี้เลือก ${picked.length} ไฟล์` : '');
    setFiles(picked.slice(0, MAX_FILES));
    setStates([]);
  };

  const upload = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    setError('');
    const next: FileState[] = files.map((f) => ({ name: f.name, state: 'waiting' }));
    setStates([...next]);
    let batchId = '';
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (f.size > MAX_MB * 1024 * 1024) {
        next[i] = { name: f.name, state: 'error', error: `ไฟล์ใหญ่เกิน ${MAX_MB} MB` };
        setStates([...next]);
        continue;
      }
      next[i] = { name: f.name, state: 'sending' };
      setStates([...next]);
      const body = new FormData();
      body.set('file', f);
      if (batchId) body.set('batchId', batchId);
      if (taskId) body.set('taskId', taskId);
      try {
        const res = await fetch('/api/candidates/uploads', { method: 'POST', body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.batchId) throw new Error(json.error || `ส่งไม่สำเร็จ (${res.status})`);
        batchId = json.batchId;
        next[i] = { name: f.name, state: 'sent' };
      } catch (e) {
        next[i] = { name: f.name, state: 'error', error: (e as Error).message };
      }
      setStates([...next]);
    }
    if (!batchId) {
      setBusy(false);
      setError('ไม่มีไฟล์ไหนส่งได้ ดูเหตุที่แต่ละไฟล์ด้านล่าง');
      return;
    }
    const res = await fetch(`/api/candidates/uploads/${batchId}/start`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) {
      setBusy(false);
      setError(json.error || 'ส่งไฟล์แล้ว แต่สั่งให้เริ่มอ่านไม่สำเร็จ ลองกดอัปโหลดใหม่');
      return;
    }
    router.push(json.url);
  };

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="resume-files">ไฟล์เรซูเม่</FieldLabel>
        <Input
          ref={inputRef}
          id="resume-files"
          type="file"
          multiple
          accept={ACCEPT}
          disabled={busy}
          onChange={(e) => pick(e.target.files)}
        />
        <FieldDescription>PDF, Word (.docx) หรือรูป JPG/PNG · ครั้งละไม่เกิน {MAX_FILES} ไฟล์ ไฟล์ละไม่เกิน {MAX_MB} MB</FieldDescription>
      </Field>
      <Field className="md:max-w-xl">
        <FieldLabel htmlFor="resume-task">ผูกกับงาน Scrap / ใบขอ (ไม่บังคับ)</FieldLabel>
        <NativeSelect id="resume-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={busy} className="w-full">
          <NativeSelectOption value="">ไม่ผูก</NativeSelectOption>
          {tasks.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription>ผูกแล้ว ทุกคนในไฟล์นับเป็นคนที่ผ่านของใบนั้น</FieldDescription>
      </Field>
      {error && <FieldError>{error}</FieldError>}
      <div>
        <Button type="button" onClick={upload} disabled={busy || files.length === 0}>
          {busy ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
          {busy ? 'กำลังส่งไฟล์' : `อัปโหลด ${files.length} ไฟล์`}
        </Button>
      </div>
      {states.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {states.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex flex-wrap items-center gap-2">
              <Badge variant={s.state === 'error' ? 'destructive' : s.state === 'sent' ? 'secondary' : 'outline'}>
                {s.state === 'waiting' ? 'รอส่ง' : s.state === 'sending' ? 'กำลังส่ง' : s.state === 'sent' ? 'ส่งแล้ว' : 'ไม่รับ'}
              </Badge>
              <span>{s.name}</span>
              {s.error && <span className="text-muted-foreground">{s.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </FieldGroup>
  );
}
